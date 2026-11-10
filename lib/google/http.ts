import "server-only";

/** A Google call that failed. `revoked` = the person removed our access, so the connection is no longer usable. */
export class GoogleError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly revoked = false
  ) {
    super(message);
  }
}

const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * fetch with a timeout and retries for rate limits (429) and Google hiccups (5xx): 3 tries, waiting as long as
 * Google's Retry-After says (capped at 5 s) or 400 ms, 800 ms otherwise.
 */
export async function googleFetch(url: string, init: RequestInit = {}, tries = 3): Promise<Response> {
  let last: unknown;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000), cache: "no-store" });
      if (!RETRY_STATUS.has(res.status) || attempt === tries - 1) return res;
      const wait = Number(res.headers.get("retry-after")) * 1000 || 400 * 2 ** attempt;
      await sleep(Math.min(wait, 5000));
    } catch (e) {
      last = e;
      if (attempt === tries - 1) break;
      await sleep(400 * 2 ** attempt);
    }
  }
  throw new GoogleError(last instanceof Error ? last.message : "Couldn't reach Google.", 0);
}
