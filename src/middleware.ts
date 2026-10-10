import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

const PUBLIC_PAGES = ["/login", "/setup", "/offline"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api") || PUBLIC_PAGES.includes(pathname)) return NextResponse.next();

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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|icons/|manifest.webmanifest|sw.js).*)"],
};
