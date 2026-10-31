// AUDIT-AI-6 (2026-11-01) — one shared netuid gate. Six routes used to
// disagree (0-255 vs 1-1024 vs 0-1024 vs unbounded), so the same subnet was
// accepted by one route and rejected by the next. Bittensor supports up to
// 1024 subnets → the canonical range is 0..1023 (netuid 0 = root subnet;
// flows that cannot target root pass { min: 1 }).

export function parseNetuid(
  value: unknown,
  opts?: { min?: number; max?: number }
): number | null {
  const min = opts?.min ?? 0;
  const max = opts?.max ?? 1023;
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) {
    return null;
  }
  return n;
}
