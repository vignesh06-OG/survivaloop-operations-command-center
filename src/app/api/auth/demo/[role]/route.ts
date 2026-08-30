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
    // Demo identity switch is NEVER available in production — otherwise anyone
    // could elevate to ADMIN. Disabled entirely unless DEMO_MODE is explicitly on.
    if (process.env.NODE_ENV === "production" && process.env.DEMO_MODE !== "1") {
      return NextResponse.json({ error: "Demo auth is disabled." }, { status: 403 });
    }
    ensureSimulation();
    const role = params.role.toUpperCase();
    if (!(VALID as readonly string[]).includes(role)) {
      throw new HttpError(400, `Unknown role '${role}'.`);
    }
    const { repo } = getCtx();
    // Demo identity: for FIELD_WORKER, prefer the seeded worker that is actually
    // assigned to the dispatched demo task (u_w1) so the worker sees a live job.
    const candidates = repo.listUsers("org_demo").filter((u) => u.role === role);
    const preferred = role === "FIELD_WORKER" ? "u_w1" : null;
    const user =
      (preferred && candidates.find((u) => u.id === preferred)) ||
      candidates[0];
    if (!user) throw new HttpError(404, `No seeded user for role '${role}'.`);

    const token = await signSession({
      id: user.id as string,
      orgId: user.org_id as string,
      email: user.email as string,
      name: user.name as string,
      role: user.role as any,
      dataMode: "SIMULATED",
    });

    const res = NextResponse.json({ ok: true, role, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    setSessionCookie(res, token);
    return res;
  } catch (e) {
    return handleError(e);
  }
}
