const ATTEMPTS = 3;

/** Upstream APIs are occasionally slow; retry with backoff before failing the run. */
export async function fetchJson(url: string, { source, timeoutMs = 30_000 }: { source: string; timeoutMs?: number }): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) throw new Error(`${source} responded ${response.status}`);
      return await response.json();
    } catch (err) {
      lastError = err;
      if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, 2_000 * 2 ** attempt));
    }
  }
  throw lastError;
}
