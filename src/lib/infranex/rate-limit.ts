// ---------------------------------------------------------------------------
// AUDIT-SEC-4 — shared in-memory rate limiter for expensive routes.
//
// Same semantics as the inline limiter in devops/agent/route.ts, generalized:
// per-key (usually "<route>:<uid>") sliding interval + rolling daily cap.
// In-memory is acceptable for this single-instance deployment; a restart
// clears counters (fail-open by design — availability over strictness).
// ---------------------------------------------------------------------------

interface Bucket {
  lastAt: number;
  day: string;
  count: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  /** Defined only when ok === false — user-facing retry message. */
  message?: string;
  /** Seconds until the interval clears (0 when not limited by interval). */
  retryInS: number;
}

export function rateLimit(
  key: string,
  minIntervalMs: number,
  dailyCap: number
): RateLimitResult {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const rec = buckets.get(key);

  if (!rec || rec.day !== today) {
    // fresh day — caller must invoke rateLimitRecord() when the action runs
    return { ok: true, retryInS: 0 };
  }
  if (now - rec.lastAt < minIntervalMs) {
    const waitS = Math.ceil((minIntervalMs - (now - rec.lastAt)) / 1000);
    return {
      ok: false,
      retryInS: waitS,
      message: `Rate limit — try again in ${waitS}s.`,
    };
  }
  if (rec.count >= dailyCap) {
    return {
      ok: false,
      retryInS: 0,
      message: `Daily cap reached (${dailyCap}/day). Try again tomorrow.`,
    };
  }
  return { ok: true, retryInS: 0 };
}

/** Record one executed action for `key` (call only after the action passed). */
export function rateLimitRecord(key: string): void {
  const today = new Date().toISOString().slice(0, 10);
  const rec = buckets.get(key);
  if (!rec || rec.day !== today) {
    buckets.set(key, { lastAt: Date.now(), day: today, count: 1 });
    return;
  }
  rec.lastAt = Date.now();
  rec.count += 1;
}
