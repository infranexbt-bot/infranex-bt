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
//
// SEC-4b (2026-11-01) — behind the space-z.ai preview proxy the Host header is
// rewritten to the internal upstream, so a public *.space-z.ai Origin never
// equals Host and every browser POST 403'd ("Cross-origin request rejected").
// The allowlist companion (scheme-prefixed env value vs scheme-less .host)
// could also never match. Fix: prefer x-forwarded-host, accept platform
// Origins when the request arrived through the platform/loopback proxy,
// honor sandboxed-iframe "Origin: null" only on platform hosts, and compare
// allowlist entries host-to-host (scheme stripped).
// ---------------------------------------------------------------------------
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Host the browser was actually talking to. Behind the preview proxy Host is
// rewritten to the internal upstream; the public hostname rides in
// x-forwarded-host (first hop wins).
function requestHost(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-host")?.split(",")[0].trim();
  return (forwarded || req.headers.get("host") || req.nextUrl.host).toLowerCase();
}

function originAllowed(req: NextRequest): boolean {
  if (!MUTATING_METHODS.has(req.method.toUpperCase())) return true;

  // The browser's own verdict is authoritative when present.
  if (req.headers.get("sec-fetch-site") === "cross-site") return false;

  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser client (curl / daemon / agent)

  const host = requestHost(req);
  const hostName = host.split(":")[0];

  // Sandboxed preview iframes send an opaque "Origin: null". Such requests
  // cannot carry SameSite cookies anyway (opaque origin ⇒ cross-site), so
  // opening the gate here rides nothing — but only honor it when the app
  // itself is served on a platform host (the preview pane).
  if (origin === "null") return hostName.endsWith(".space-z.ai");

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false; // malformed Origin
  }
  if (!originHost) return false;

  const originName = originHost.split(":")[0].toLowerCase();

  // Same app: exact host match (with or without port).
  if (originHost === host || originName === hostName) return true;

  // Preview platform: app pages live under *.space-z.ai while the front proxy
  // surfaces an internal/pull Host (e.g. gw.internal…). The browser-verdict
  // check above already rejected genuine cross-site attackers (including a
  // malicious sibling *.space-z.ai tenant, whose requests are cross-site to
  // us), so a platform Origin that survived it is our own page or an
  // authorized platform context — accept it regardless of Host rewriting.
  if (originName.endsWith(".space-z.ai")) {
    return true;
  }

  // Optional operator allowlist for custom domains / tunnels. Entries may be
  // bare hosts or full origins ("tunnel.example.com" or
  // "https://tunnel.example.com") — compare host-to-host, scheme-less.
  const allowlist = (process.env.INFRANEX_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .map((s) => {
      try {
        return s.includes("://") ? new URL(s).host : s;
      } catch {
        return s;
      }
    })
    .map((s) => s.split(":")[0]);
  return allowlist.includes(originHost) || allowlist.includes(originName);
}

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const mutating = MUTATING_METHODS.has(req.method.toUpperCase());
  const allowed = originAllowed(req);
  if (mutating && process.env.INFRANEX_GATE_DEBUG === "1") {
    console.log(
      `[GATE] ${req.method} ${pathname} verdict=${allowed ? "allow" : "reject"} ` +
        `origin=${req.headers.get("origin")} host=${req.headers.get("host")} ` +
        `xfh=${req.headers.get("x-forwarded-host")} sfs=${req.headers.get("sec-fetch-site")}`
    );
  }

  if (!allowed) {
    // SEC-4b ops log: when the gate rejects, record the exact routing headers
    // so proxy/gateway surprises (Host rewrite, stripped Origin, ...) are
    // diagnosable from server.log instead of guesswork.
    console.warn(
      `[SEC-4b] rejected ${req.method} ${pathname} origin=${req.headers.get("origin")} ` +
        `host=${req.headers.get("host")} xfh=${req.headers.get("x-forwarded-host")} ` +
        `sfs=${req.headers.get("sec-fetch-site")}`
    );
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
