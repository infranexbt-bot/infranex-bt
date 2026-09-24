// ---------------------------------------------------------------------------
// WINDUP-1 — shared route gates with DB-backed session revocation.
//
// The proxy (Edge runtime, Web Crypto only) verifies the token signature and
// expiry but CANNOT reach the database. These Node-runtime helpers are the
// privilege gates for sensitive routes: on top of signature + expiry they
// re-check the AppUser row, so an admin's `setActive(false)` revokes a live
// token on the very next gated call instead of after the cookie's full TTL.
// The role is ALSO re-read from the DB row (SEC-AUDIT-1): a demoted admin
// loses admin routes immediately, not after the 7-day cookie TTL.
//
// FAIL-CLOSED policy (SEC-AUDIT-1): if the AppUser row cannot be read or no
// longer exists, the gate DENIES. A DB hiccup briefly locks operators out —
// acceptable, because every data surface behind this gate is DB-backed
// anyway; the previous fail-open variant let a deleted/disabled user keep
// working whenever the read failed, which is exactly what this gate exists
// to prevent.
// ---------------------------------------------------------------------------

import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken, type SessionPayload } from "@/lib/auth";
import { db } from "@/lib/db";

export type ActiveGate =
  | { session: SessionPayload }
  | { error: string; status: 401 | 403 | 503 };

async function gate(req: NextRequest, requireAdminRole: boolean): Promise<ActiveGate> {
  return gateForToken(req.cookies.get(SESSION_COOKIE)?.value, requireAdminRole);
}

/**
 * AUDIT-SEC-2 — token-level gate shared by all entry shapes.
 * The DB re-check (revocation + role) is the security core; the cookie can
 * arrive via NextRequest map, a plain Request header, or next/headers jar.
 */
async function gateForToken(token: string | undefined | null, requireAdminRole: boolean): Promise<ActiveGate> {
  const session = await verifySessionToken(token);
  if (!session) return { error: "Not signed in", status: 401 };

  // Revocation + role check — a deactivated or deleted account's token is
  // dead immediately, and the DB role (not the token role) decides admin.
  const row = await db.appUser
    .findUnique({
      where: { userId: session.uid },
      select: { active: true, role: true },
    })
    .catch(() => null);

  if (!row) {
    // DB unreachable OR user row deleted — fail closed either way.
    return { error: "Session cannot be verified right now — try again.", status: 503 };
  }
  if (!row.active) {
    return { error: "Account disabled — ask an admin to reactivate it.", status: 403 };
  }

  if (requireAdminRole && row.role !== "admin") {
    return { error: "Admin privileges required.", status: 403 };
  }
  return { session };
}

/** Valid session + account still active + role "admin". */
export function requireActiveAdmin(req: NextRequest): Promise<ActiveGate> {
  return gate(req, true);
}

/** Valid session + account still active (any role). */
export function requireActiveUser(req: NextRequest): Promise<ActiveGate> {
  return gate(req, false);
}

/**
 * AUDIT-SEC-2 — gate for handlers that receive a standard `Request`
 * (no NextRequest cookie map). Same DB-backed revocation/role semantics.
 */
export async function requireActiveUserRequest(req: Request): Promise<ActiveGate> {
  const header = req.headers.get("cookie") ?? "";
  const pair = header
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(SESSION_COOKIE + "="));
  const token = pair ? decodeURIComponent(pair.slice(SESSION_COOKIE.length + 1)) : undefined;
  return gateForToken(token, false);
}

/**
 * AUDIT-SEC-2 — gate for handlers with NO request parameter at all.
 * Reads the session cookie via next/headers (works in route handlers).
 */
export async function requireActiveUserCookies(): Promise<ActiveGate> {
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  return gateForToken(jar.get(SESSION_COOKIE)?.value, false);
}
