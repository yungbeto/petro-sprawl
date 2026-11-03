/** Wait before the next attempt: doubling from 4 s, capped at maxBackoffMs. */
export function backoffMs(attempt: number, maxBackoffMs: number): number {
  return Math.min(2_000 * 2 ** attempt, maxBackoffMs);
}

/** Upstream APIs are occasionally slow; retry with backoff before failing the run. */
export async function fetchJson(
  url: string,
  {
    source,
    timeoutMs = 30_000,
    attempts = 3,
    maxBackoffMs = 30_000,
    bodyError,
    init,
    deadline,
  }: {
    source: string;
    timeoutMs?: number;
    attempts?: number;
    maxBackoffMs?: number;
    /** Some APIs answer 200 with an error body; return a message to retry it like any other failure. */
    bodyError?: (body: unknown) => string | null;
    /** Method, headers and body, for a POST. */
    init?: Omit<RequestInit, 'signal'>;
    /** Epoch ms after which no attempt starts and no wait runs past, so a job ends inside its step's cap. */
    deadline?: number;
  },
): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const left = deadline === undefined ? Infinity : deadline - Date.now();
    if (left <= 0) throw lastError ?? new Error(`${source}: out of time before the first attempt`);
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(Math.min(timeoutMs, left)) });
      if (!response.ok) throw new Error(`${source} responded ${response.status}`);
      const body: unknown = await response.json();
      const error = bodyError?.(body);
      if (error) throw new Error(`${source} error: ${error}`);
      return body;
    } catch (err) {
      lastError = withCause(err, source);
      const wait = backoffMs(attempt, maxBackoffMs);
      if (deadline !== undefined && Date.now() + wait >= deadline) break;
      if (attempt < attempts) await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastError;
}

/** Node's fetch reports network errors as a bare "fetch failed"; name the cause so meta and logs say what broke. */
export function withCause(err: unknown, source: string): unknown {
  if (!(err instanceof Error) || err.message !== 'fetch failed') return err;
  const cause = err.cause as { code?: string; message?: string } | undefined;
  return new Error(`${source} unreachable: ${cause?.code ?? cause?.message ?? 'network error'}`);
}
