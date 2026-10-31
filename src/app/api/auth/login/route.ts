// POST /api/auth/login — ID + access code → session cookie (AUTH-1).
//
// Rate limiting: in-memory, 10 failed attempts per IP per 5 minutes, reset
// on success. Good enough for a 5-operator gate; brute force is throttled
// without external state.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyLogin } from "@/lib/auth-users";
import { createSessionToken, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";
import { logAudit } from "@/lib/infranex/audit";

export const dynamic = "force-dynamic";

const WINDOW_MS = 5 * 60 * 1000;
const MAX_FAILURES = 10;
const attempts = new Map<string, { count: number; resetAt: number }>();

// AUDIT-SEC-2 (2026-11-01): per-IP buckets alone can be bypassed by rotating
// source IPs. Track failures per ACCOUNT as well — a distributed brute force
// against one user ID now trips its own lockout.
const ACCOUNT_WINDOW_MS = 15 * 60 * 1000;
const ACCOUNT_MAX_FAILURES = 20;
const accountAttempts = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: NextRequest): string {
  // WINDUP-1: prefer x-real-ip — Caddy sets it from the actual remote host.
  // AUDIT-3 (L-2): when falling back to x-forwarded-for, use the RIGHTMOST
  // entry — the hop appended by the nearest trusted proxy. The leftmost
  // entry is client-controlled (header rotation minted fresh buckets);
  // the rightmost can only be forged if the last proxy forwards client
  // XFF verbatim, which Caddy does not.
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean).pop() ||
    "local"
  );
}

function tooManyAttempts(ip: string): number {
  const rec = attempts.get(ip);
  if (!rec) return 0;
  if (Date.now() > rec.resetAt) {
    attempts.delete(ip);
    return 0;
  }
  return rec.count;
}

function bumpAttempts(map: Map<string, { count: number; resetAt: number }>, key: string, windowMs: number) {
  const rec = map.get(key);
  if (rec && Date.now() <= rec.resetAt) {
    rec.count += 1;
  } else {
    map.set(key, { count: 1, resetAt: Date.now() + windowMs });
  }
}

function recordFailure(ip: string, userId: string) {
  bumpAttempts(attempts, ip, WINDOW_MS);
  bumpAttempts(accountAttempts, userId.toLowerCase(), ACCOUNT_WINDOW_MS);
}

export async function POST(req: NextRequest) {
  let body: { userId?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const userId = (body.userId ?? "").trim();
  const code = (body.code ?? "").trim();
  if (!userId || !code) {
    return NextResponse.json(
      { error: "User ID and access code are both required." },
      { status: 400 }
    );
  }

  const ip = clientIp(req);
  const accountRec = accountAttempts.get(userId.toLowerCase());
  const accountLocked =
    accountRec && Date.now() <= accountRec.resetAt && accountRec.count >= ACCOUNT_MAX_FAILURES;
  if (tooManyAttempts(ip) >= MAX_FAILURES || accountLocked) {
    return NextResponse.json(
      { error: "Too many failed attempts — wait 5 minutes and try again." },
      { status: 429 }
    );
  }

  const user = await verifyLogin(userId, code);
  if (!user) {
    recordFailure(ip, userId);
    // WALLET-ECON-1 — failed sign-ins are audited (userId attempt + IP
    // class; never the code itself).
    await logAudit({
      action: "login.failed",
      actor: userId || "unknown",
      detail: `Failed sign-in attempt for "${userId}" from ${ip}.`,
    });
    // Uniform message — do not reveal whether the ID exists.
    return NextResponse.json(
      { error: "Invalid user ID or access code." },
      { status: 401 }
    );
  }

  attempts.delete(ip);
  accountAttempts.delete(userId.toLowerCase());
  await db.appUser.update({
    where: { userId: user.userId },
    data: { lastLoginAt: new Date() },
  }).catch(() => undefined); // never block a valid login on bookkeeping
  await logAudit({
    action: "login.success",
    actor: user.userId,
    detail: `${user.userId} (${user.role}) signed in from ${ip}.`,
  });

  const token = await createSessionToken(user);
  const res = NextResponse.json({
    ok: true,
    user: { userId: user.userId, label: user.label, role: user.role },
  });
  // SEC-AUDIT-1: mark the cookie Secure whenever the request reached us over
  // https (front proxy sets x-forwarded-proto) — no flag over plain http so
  // the platform's preview proxy does not drop the cookie.
  const overHttps =
    req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https" ||
    req.nextUrl.protocol === "https:";
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(undefined, overHttps));
  return res;
}
