import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

const PUBLIC_PAGES = ["/login", "/setup", "/offline"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // /r/… = a bill or slip a customer opens from WhatsApp (signed link, no login).
  if (pathname.startsWith("/api") || PUBLIC_PAGES.includes(pathname) || pathname.startsWith("/r/")) return NextResponse.next();

  const user = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const redirect = (path: string) => {
    const url = req.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    return NextResponse.redirect(url);
  };
  if (!user) return redirect("/login");

  const isAdminArea = pathname === "/admin" || pathname.startsWith("/admin/");
  if (user.role === "superadmin" && !isAdminArea) return redirect("/admin");
  if (user.role !== "superadmin" && isAdminArea) return redirect("/");
  return NextResponse.next();
}

export const config = {
  // API routes check the login themselves (and must not pass through here: it would cut large uploads such as a backup to restore).
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|icon.svg|icons/|manifest.webmanifest|sw.js).*)"],
};
