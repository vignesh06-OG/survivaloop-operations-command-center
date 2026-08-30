import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/server/request";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}
