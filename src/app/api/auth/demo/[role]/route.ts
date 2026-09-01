/**
 * Demo identity switch (server-side session). Picks a seeded user of the
 * requested role, issues a signed cookie. Real authentication for production
 * would use a proper credential dialog; the seam is identical.
 */
import { NextResponse } from "next/server";
import { getCtx, ensureSimulation } from "@/server/context";
import { signSession } from "@/services/auth";
import { setSessionCookie, HttpError, handleError } from "@/server/request";

const VALID = ["ADMIN", "SUPERVISOR", "FIELD_WORKER", "AUDITOR"] as const;

export async function POST(
  _req: Request,
  { params }: { params: { role: string } },
) {
  try {
    const demoMode = process.env.DEMO_MODE === "1" || process.env.DEMO_MODE === "true";
    if (process.env.NODE_ENV === "production" && !demoMode) {
      throw new HttpError(403, "DEMO_MODE_DISABLED: Demo authentication is only allowed when DEMO_MODE is enabled.");
    }
    if (!process.env.SURVIVALOOP_JWT_SECRET) {
      throw new HttpError(500, "MISSING_JWT_SECRET: Production requires a secret.");
    }

    try {
      ensureSimulation();
    } catch (err) {
      throw new HttpError(500, `SEED_FAILED: ${(err as Error).message}`);
    }

    const role = params.role.toUpperCase();
    if (!(VALID as readonly string[]).includes(role)) {
      throw new HttpError(400, `Unknown role '${role}'.`);
    }
    
    let repo;
    try {
      repo = getCtx().repo;
    } catch (err) {
      throw new HttpError(500, `DB_INIT_FAILED: ${(err as Error).message}`);
    }

    // Use deterministic claims to avoid memory DB lookup during cold starts
    let user;
    if (role === "ADMIN") {
      user = { id: "demo-admin", name: "Demo Admin", role: "ADMIN", org_id: "org_demo", email: "admin@survivaloop.demo" };
    } else if (role === "SUPERVISOR") {
      user = { id: "demo-supervisor", name: "Demo Supervisor", role: "SUPERVISOR", org_id: "org_demo", email: "supervisor@survivaloop.demo" };
    } else if (role === "FIELD_WORKER") {
      user = { id: "demo-worker", name: "Demo Field Worker", role: "FIELD_WORKER", org_id: "org_demo", email: "worker@survivaloop.demo" };
    } else if (role === "AUDITOR") {
      user = { id: "demo-auditor", name: "Demo Auditor", role: "AUDITOR", org_id: "org_demo", email: "auditor@survivaloop.demo" };
    } else {
      throw new HttpError(404, `No seeded user for role '${role}'.`);
    }

    let token;
    try {
      token = await signSession({
        id: user.id as string,
        orgId: user.org_id as string,
        email: user.email as string,
        name: user.name as string,
        role: user.role as any,
        dataMode: "SIMULATED",
      });
    } catch (err) {
      throw new HttpError(500, `AUTH_FAILED: ${(err as Error).message}`);
    }

    const res = NextResponse.json({ ok: true, role, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    setSessionCookie(res, token);
    return res;
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return handleError(e);
  }
}
