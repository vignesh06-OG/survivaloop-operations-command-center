import { NextResponse } from "next/server";
import { getCtx } from "@/server/context";
import { verifySession } from "@/services/auth";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  try {
    const token = cookies().get("survivaloop_session")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = await verifySession(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { age, city, locality } = body;
    
    // Update user in DB
    const repo = getCtx().repo;
    if ('updateUser' in repo) {
        // Safe cast since we know MemoryRepo has it
        (repo as any).updateUser(user.id, { 
            age: age ? parseInt(age) : undefined, 
            city: city || undefined, 
            locality: locality || undefined 
        });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
