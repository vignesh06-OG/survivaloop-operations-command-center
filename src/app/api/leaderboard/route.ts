import { NextResponse } from "next/server";
import { getCtx } from "@/server/context";
import { sessionFromRequest } from "@/server/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const user = await sessionFromRequest();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const scope = searchParams.get("scope") || "overall";

    const repo = getCtx().repo;
    
    // Sort users by points descending
    // We safely cast assuming we have MemoryRepo with listUsers
    const users = (repo as any).listUsers(user.orgId) || [];
    
    let filtered = users;
    const anyUser = user as any;
    if (scope === "locality" && anyUser.locality) {
      filtered = users.filter((u: any) => u.locality === anyUser.locality);
    } else if (scope === "city" && anyUser.city) {
      filtered = users.filter((u: any) => u.city === anyUser.city);
    }

    const sorted = filtered
      .map((u: any) => ({
        id: u.id,
        name: u.name,
        points: u.points || 0,
        locality: u.locality,
        city: u.city
      }))
      .sort((a: any, b: any) => b.points - a.points)
      .slice(0, 10);

    return NextResponse.json(sorted);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
