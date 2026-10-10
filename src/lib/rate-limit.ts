/**
 * Simple in-memory limiter for failed logins (per process). Good for a single shop server;
 * use a shared store such as Redis if you run several app servers.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map<string, { count: number; first: number }>();

export function loginBlocked(key: string): number {
  const f = failures.get(key);
  if (!f) return 0;
  if (Date.now() - f.first > WINDOW_MS) {
    failures.delete(key);
    return 0;
  }
  return f.count >= MAX_FAILURES ? Math.ceil((f.first + WINDOW_MS - Date.now()) / 60000) : 0;
}

export function recordLoginFailure(key: string) {
  const f = failures.get(key);
  if (!f || Date.now() - f.first > WINDOW_MS) failures.set(key, { count: 1, first: Date.now() });
  else f.count++;
}

export function clearLoginFailures(key: string) {
  failures.delete(key);
}
