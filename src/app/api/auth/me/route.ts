import { NextResponse } from "next/server";
import { sessionFromRequest } from "@/server/request";

export async function GET() {
  const s = await sessionFromRequest();
  if (!s) return NextResponse.json({ user: null }, { status: 200 });
  // Never expose internal id as a trustable handle beyond this session.
  return NextResponse.json({ user: { id: s.id, name: s.name, email: s.email, role: s.role, orgId: s.orgId, dataMode: s.dataMode } });
}

export const dynamic = "force-dynamic";
