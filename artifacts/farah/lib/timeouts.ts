/**
 * Shared abort/timeout helpers for mutations.
 *
 * Usage:
 *   const ctrl = makeTimeout(30_000);
 *   try {
 *     await someAsyncOp(ctrl.signal);
 *   } finally {
 *     ctrl.cleanup();
 *   }
 *
 * Or wrap a promise:
 *   await withTimeout(supabase.from('x').insert(...), 30_000);
 */

export const DEFAULT_MUTATION_TIMEOUT_MS = 30_000;

export class TimeoutError extends Error {
  constructor(message = "Request timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}

export function makeTimeout(ms = DEFAULT_MUTATION_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return {
    signal: ctrl.signal,
    cleanup: () => clearTimeout(timer),
    abort: () => ctrl.abort(),
  };
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms = DEFAULT_MUTATION_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError()), ms);
  });
  try {
    return (await Promise.race([promise, timeout])) as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
