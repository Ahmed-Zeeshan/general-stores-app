import { z } from "zod";
import { NextResponse } from "next/server";
import { ApiError, handle } from "@/lib/api";
import { BRANCH_COOKIE, requireBranch } from "@/lib/branches";

const Body = z.object({ branchId: z.string().regex(/^[a-f0-9]{24}$/i) });

/** Owners and unassigned staff choose which branch they are working in (stored in a cookie). */
export const POST = handle(async (req) => {
  const ctx = await requireBranch();
  const { branchId } = Body.parse(await req.json());
  if (ctx.locked) throw new ApiError(403, "You are assigned to one branch and cannot switch.");
  const branch = ctx.branches.find((b) => String(b._id) === branchId);
  if (!branch) throw new ApiError(404, "Branch not found.");
  const res = NextResponse.json({ ok: true, branch: { _id: branch._id, name: branch.name } });
  res.cookies.set(BRANCH_COOKIE, branchId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
});
