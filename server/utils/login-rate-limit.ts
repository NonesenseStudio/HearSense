import type { H3Event } from "h3";
import { getClientIdentifier } from "./access";

const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED_IDENTIFIERS = 2_000;

interface AttemptRecord {
  count: number;
  resetAt: number;
}

const attempts = new Map<string, AttemptRecord>();

function prune(now: number): void {
  for (const [identifier, record] of attempts) {
    if (record.resetAt <= now) attempts.delete(identifier);
  }
  if (attempts.size <= MAX_TRACKED_IDENTIFIERS) return;
  const oldest = [...attempts.entries()]
    .sort((left, right) => left[1].resetAt - right[1].resetAt)
    .slice(0, attempts.size - MAX_TRACKED_IDENTIFIERS);
  for (const [identifier] of oldest) attempts.delete(identifier);
}

export function getLoginRateLimit(event: H3Event): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  prune(now);
  const record = attempts.get(getClientIdentifier(event));
  if (!record || record.resetAt <= now)
    return { allowed: true, retryAfterSeconds: 0 };
  return {
    allowed: record.count < MAX_FAILED_ATTEMPTS,
    retryAfterSeconds: Math.max(1, Math.ceil((record.resetAt - now) / 1000)),
  };
}

export function recordLoginFailure(event: H3Event): void {
  const now = Date.now();
  prune(now);
  const identifier = getClientIdentifier(event);
  const record = attempts.get(identifier);
  if (!record || record.resetAt <= now) {
    attempts.set(identifier, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  record.count += 1;
}

export function recordLoginSuccess(event: H3Event): void {
  attempts.delete(getClientIdentifier(event));
}
