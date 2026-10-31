// ---------------------------------------------------------------------------
// AUTH-1 — edge gate for the whole app (Next.js 16 `proxy`, the successor of
// middleware.ts). Only signed-in operators reach the app; everything else is
// bounced to /login.
//
// Public surface (no session required):
//   /login                 — the sign-in page
//   /api/auth/login        — credential check + cookie mint
//   /api/auth/logout       — cookie clear
//   /api/daemon/commands   — HMAC-signed daemon bridge (WINDUP-1): the Node
//   /api/daemon/telemetry    Daemon has no cookie; its auth is the per-deployment
//                            HMAC (x-infranex-signature, ±5 min replay window,
//                            timing-safe compare). Session-gating these made
//                            every real-daemon call 401 at the edge.
//   /api/agent/*           — LOCALHOST-1 local-machine agent (laptop/WSL2):
//                            same pull-model security — one-time enrollment
//                            token then per-host HMAC; no cookie exists there.
// Everything else (pages AND /api/*) requires a valid session cookie:
//   pages  → 307 redirect to /login
//   api    → 401 JSON (fetch-safe; the browser already sends the cookie)
// A valid session hitting /login is bounced back to the app.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/daemon/commands", // HMAC-authenticated (daemon bridge)
  "/api/daemon/telemetry", // HMAC-authenticated (daemon bridge)
  "/api/agent/enroll", // one-time-token exchange (LOCALHOST-1)
  "/api/agent/heartbeat", // HMAC-authenticated (local agent)
  "/api/agent/results", // HMAC-authenticated (local agent)
  "/api/agent/agent.py", // agent source download (no secrets inside)
]);

function isPublic(pathname: string): boolean {
  // /guides/ — static miner-facing documents (public/guides/*.pdf). Setup and
  // operations guides are meant to be shared with miners who have no app
  // account; contents are curated, nothing sensitive lives there.
  return PUBLIC_PATHS.has(pathname) || pathname.startsWith("/guides/");
}

// ---------------------------------------------------------------------------
// AUDIT-SEC-4 (2026-11-01) — CSRF defense-in-depth. Session protection already
// rests on SameSite=Lax; this adds an Origin/Sec-Fetch-Site gate for mutating
// requests so a forged cross-site POST from a legacy browser or same-site
// subdomain is rejected at the edge. Non-browser clients (curl, the daemon
// HMAC bridge, the local agent) send no Origin and are unaffected.
// ---------------------------------------------------------------------------
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function originAllowed(req: NextRequest): boolean {
  if (!MUTATING_METHODS.has(req.method.toUpperCase())) return true;

  // The browser's own verdict is authoritative when present.
  if (req.headers.get("sec-fetch-site") === "cross-site") return false;

  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser client (curl / daemon / agent)

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false; // malformed Origin
  }
  if (!originHost) return false;

  const host = req.headers.get("host") ?? req.nextUrl.host;
  if (originHost === host) return true;

  // Preview platform: the app is served under *.space-z.ai; accept when BOTH
  // the Origin and the Host are platform hosts (Host can differ from Origin
  // across the front proxy).
  if (
    originHost.endsWith(".space-z.ai") &&
    host.endsWith(".space-z.ai")
  ) {
    return true;
  }

  // Optional operator allowlist for custom domains / tunnels.
  const allowlist = (process.env.INFRANEX_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(originHost.toLowerCase());
}

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!originAllowed(req)) {
    return NextResponse.json(
      { error: "Cross-origin request rejected" },
      { status: 403 }
    );
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(token);

  // Signed-in users never see the login page again.
  if (session && pathname === "/login") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (session || isPublic(pathname)) return NextResponse.next();

  // Protected API → JSON 401 (no redirect loops for fetch callers).
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Unauthorized — sign in at /login" },
      { status: 401 }
    );
  }

  // Protected page → login screen. POPOUT-1: keep the full target (path +
  // query) so a deep link like /?view=opportunities survives the bounce and
  // the operator lands back on that exact page after signing in. The login
  // page's open-redirect guard only accepts same-origin paths starting with
  // "/", which "/?view=…" satisfies; protocol-relative forms stay blocked.
  const loginUrl = new URL("/login", req.url);
  const nextTarget = pathname + req.nextUrl.search;
  if (nextTarget !== "/") loginUrl.searchParams.set("next", nextTarget);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Run on everything except immutable static assets (fonts/images/chunks).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
