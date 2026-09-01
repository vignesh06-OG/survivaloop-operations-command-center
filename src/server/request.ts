/**
 * SurvivaLoop — server-side request authorization helpers.
 *
 * Every API route resolves the session from the signed cookie, then re-derives
 * role/org from the DB (never trusts client-supplied identity) and checks the
 * required capability. Failure → 401/403 JSON. No route may rely on the UI to
 * gate access.
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifySession, type SessionUser } from "@/services/auth";
import { roleHas, type Capability } from "@/domain/permissions";
import { getCtx } from "./context";

const SESSION_COOKIE = "sl_session";

export async function sessionFromRequest(): Promise<SessionUser | null> {
  const store = cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const sess = await verifySession(token);
  if (!sess) return null;
  return sess;
}

export async function requireUser(): Promise<SessionUser> {
  const s = await sessionFromRequest();
  if (!s) throw new HttpError(401, "Authentication required.");
  return s;
}

export async function requireCapability(cap: Capability): Promise<SessionUser> {
  const s = await requireUser();
  if (!roleHas(s.role, cap)) {
    throw new HttpError(403, `Your role '${s.role}' does not permit '${cap}'.`);
  }
  return s;
}

export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 86400,
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "HttpError";
  }
}

export function handleError(e: unknown): NextResponse {
  if (e instanceof HttpError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  // Never leak internal details. Log server-side only.
  console.error("[survivaloop] error:", e);
  const msg = e instanceof Error ? e.message : "An unexpected error occurred.";
  // Known, client-safe domain errors remain informative; unknown → generic.
  const msgLower = msg.toLowerCase();
  const safe = msgLower.includes("sla") || msgLower.includes("capacity")
    || msgLower.includes("proof") || msgLower.includes("transition")
    || msgLower.includes("reason") || msgLower.includes("not found")
    || msgLower.includes("invalid") || msgLower.includes("demo auth is disabled")
    || msgLower.includes("survivaloop_jwt_secret") || msgLower.includes("database unavailable")
    || msgLower.includes("demo")
    ? msg : "Unexpected error. Please retry.";
  return NextResponse.json({ error: safe }, { status: 400 });
}

/**
 * Route handler factory. Returns an actual `(req, ctx) => Promise<Response>`
 * function that Next.js can mount, resolves the authorized user, and wraps all
 * errors into safe JSON.
 */
export function route<T>(
  handler: (user: SessionUser, ctx: { app: ReturnType<typeof getCtx>["app"] }, req: Request) => Promise<T>,
  cap: Capability | null,
) {
  return async (req: Request): Promise<Response> => {
    try {
      const app = getCtx().app;
      const user = cap ? await requireCapability(cap) : await requireUser();
      const data = await handler(user, { app }, req);
      return NextResponse.json(data);
    } catch (e) {
      return handleError(e);
    }
  };
}
