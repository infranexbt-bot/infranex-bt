import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * AUDIT-SEC-3 (2026-11-01) — DNS-resolution SSRF guard.
 *
 * The literal-IP checks (validateWebhookUrl in alerts.ts, isPrivateProbeEndpoint
 * in service-health.ts) block loopback/RFC1918/link-local SPELLINGS, but a
 * public DNS name that RESOLVES to 127.0.0.1 / 10.x / 169.254.169.254 used to
 * pass. assertPublicResolution closes that gap: the hostname is resolved and
 * every returned address is re-checked before any socket is opened.
 *
 * Note on TOCTOU: the outbound fetch performs its own DNS lookup afterwards,
 * so a rebinding attacker with a TTL-0 record could still race the window.
 * Eliminating that fully requires pinning the dial IP at the dispatcher, which
 * neither Bun nor undici exposes portably — this check collapses the attack
 * from "trivially" to "must win a per-request race with cooperative DNS".
 *
 * Development is exempt so the test suite's local receivers keep working —
 * same policy as the literal-IP validators.
 */

/** True when the address is loopback / private / link-local / reserved. */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 127) return true; // loopback
    if (a === 10) return true; // RFC1918
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
    if (a === 192 && b === 168) return true; // RFC1918
    if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata)
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT range
    if (a === 0) return true; // "this network"
    return false;
  }
  if (isIP(ip) === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true; // loopback / unspecified
    if (lower.startsWith("fe80")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
    // IPv4-mapped (::ffff:a.b.c.d) — judge by the embedded v4 address.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }
  return true; // not parseable as an IP → treat as unsafe
}

/**
 * Resolve `host` and throw a human-readable error if ANY resolved address is
 * private/loopback. IP literals short-circuit (callers already check those).
 * Only active when NODE_ENV === "production".
 */
export async function assertPublicResolution(host: string): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;
  if (isIP(host)) return; // literal address — literal checks cover it

  let addrs: { address: string; family: number }[];
  try {
    addrs = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error(`Host does not resolve: ${host}`);
  }
  if (!addrs.length) {
    throw new Error(`Host has no DNS records: ${host}`);
  }
  for (const { address } of addrs) {
    if (isPrivateAddress(address)) {
      throw new Error(
        `Host resolves to a private or loopback address (${address}) — refusing to connect`
      );
    }
  }
}
