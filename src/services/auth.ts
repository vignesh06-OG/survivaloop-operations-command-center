/**
 * SurvivaLoop — authentication.
 *
 * Identity is established server-side and carried in a signed JWT. Roles are
 * read from the database on every authenticated request (never from the
 * client). Demo mode offers seeded identities, but the session is still a real
 * signed token and authorization is enforced server-side.
 *
 * No credentials are ever accepted from the client to establish role.
 */
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Repo } from "@/data/repo";
import type { DbRow } from "@/data/repo";
import type { Role } from "@/domain/types";
import { getRuntime } from "@/server/runtime";

const SECRET_ENV = "SURVIVALOOP_JWT_SECRET";
// Demo-only fallback. NOT allowed in production (see secret()).
const DEMO_SECRET = "survivaloop-demo-3f9e7a2c-demo-only";

/**
 * Production MUST set SURVIVALOOP_JWT_SECRET. If it is unset in production we
 * refuse to run rather than silently signing with a predictable, committed
 * fallback (which would let anyone forge a session for any seeded user).
 */
function secret(): Uint8Array {
  const s = process.env[SECRET_ENV];
  if (!s) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`${SECRET_ENV} must be set in production.`);
    }
    return new TextEncoder().encode(DEMO_SECRET);
  }
  return new TextEncoder().encode(s);
}

export interface SessionUser {
  id: string;
  orgId: string;
  email: string;
  name: string;
  role: Role;
  dataMode: "LIVE" | "SIMULATED";
}

/** Real scrypt KDF (N=16384, r=8, p=1, 64-byte key). Salted per user. */
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64, SCRYPT_OPTS).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, expected] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !expected) return false;
  let actual: Buffer;
  try {
    actual = scryptSync(password, salt, 64, SCRYPT_OPTS);
  } catch {
    return false;
  }
  const a = actual;
  const e = Buffer.from(expected, "hex");
  if (a.length !== e.length) return false;
  return timingSafeEqual(a, e);
}

export async function signSession(user: SessionUser, ttlHours = 12): Promise<string> {
  return await new SignJWT({
    orgId: user.orgId,
    role: user.role,
    email: user.email,
    name: user.name,
    dataMode: user.dataMode,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${ttlHours}h`)
    .sign(secret());
}

export interface VerifiedSession extends SessionUser {
  sub: string;
}

export async function verifySession(token: string): Promise<VerifiedSession | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    // Reload user from DB to obtain authoritative role+org (never trust the token's role alone).
    const sub = payload.sub;
    if (!sub) return null;
    const user = (await requireRepo().getUser(sub)) as DbRow | null;
    if (!user) { console.error("[auth] user not found:", sub); return null; }
    return {
      id: sub,
      sub,
      orgId: user.org_id as string,
      email: user.email as string,
      name: user.name as string,
      role: user.role as Role,
      dataMode: (getOrgMode(user.org_id as string) as "LIVE" | "SIMULATED"),
    };
  } catch (e) {
    console.error("[auth] verifySession failed:", e);
    return null;
  }
}

// The repo/AppService come from the process-wide runtime singleton (runtime.ts),
// shared across every route bundle. This module holds no DB state itself.
const ORG_MODE_KEY = "__sl_org_mode__";
const g = globalThis as unknown as Record<string, any>;
let orgModeCache = (g[ORG_MODE_KEY] as Map<string, string> | undefined) ?? new Map<string, string>();
g[ORG_MODE_KEY] = orgModeCache;

/** @deprecated use getRuntime() (`@/server/runtime`) for direct repo access. */
function requireRepo(): Repo {
  const r = getRuntime().repo;
  return r;
}
function getOrgMode(orgId: string): string | undefined {
  const cached = orgModeCache.get(orgId);
  if (cached) return cached;
  const org = getRuntime().repo.getOrg(orgId);
  const mode = (org?.data_mode as string | undefined) ?? "LIVE";
  orgModeCache.set(orgId, mode);
  return mode;
}

export function resetSessionUserCache(): void {
  const m = new Map<string, string>();
  g[ORG_MODE_KEY] = m;
  orgModeCache = m;
}

/** Resolve a user row -> SessionUser (server-side). */
export function rowToSessionUser(r: DbRow): SessionUser {
  return {
    id: r.id as string,
    orgId: r.org_id as string,
    email: r.email as string,
    name: r.name as string,
    role: r.role as Role,
    dataMode: getOrgMode(r.org_id as string) as "LIVE" | "SIMULATED",
  };
}
