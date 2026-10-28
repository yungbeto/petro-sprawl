const ATTEMPTS = 3;

/** Upstream APIs are occasionally slow; retry with backoff before failing the run. */
export async function fetchJson(
  url: string,
  {
    source,
    timeoutMs = 30_000,
    bodyError,
  }: {
    source: string;
    timeoutMs?: number;
    /** Some APIs answer 200 with an error body; return a message to retry it like any other failure. */
    bodyError?: (body: unknown) => string | null;
  },
): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) throw new Error(`${source} responded ${response.status}`);
      const body: unknown = await response.json();
      const error = bodyError?.(body);
      if (error) throw new Error(`${source} error: ${error}`);
      return body;
    } catch (err) {
      lastError = withCause(err, source);
      if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, 2_000 * 2 ** attempt));
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
