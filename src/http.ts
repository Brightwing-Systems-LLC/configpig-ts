/** HTTP transport with retry, logging, and timeout. */

const MAX_RETRIES = 2;
const INITIAL_BACKOFF = 500; // ms
const REQUEST_TIMEOUT = 15_000; // ms
const LOG_PREFIX = "CONFIGPIG_UNSENT_REQUEST";

function isRetryable(status: number): boolean {
  return [429, 500, 502, 503, 504].includes(status);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RequestOptions {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  params?: Record<string, string>;
}

export interface RequestResult {
  statusCode: number;
  data: unknown | null;
}

export async function requestWithRetry(
  options: RequestOptions
): Promise<RequestResult> {
  const { method, headers, body } = options;
  let url = options.url;

  if (options.params) {
    const qs = new URLSearchParams(options.params).toString();
    url = qs ? `${url}?${qs}` : url;
  }

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });

      if (isRetryable(resp.status) && attempt < MAX_RETRIES) {
        console.info(
          `Server returned ${resp.status}, retrying (${attempt + 1}/${MAX_RETRIES})`
        );
        await sleep(INITIAL_BACKOFF * 2 ** attempt);
        continue;
      }

      let data: unknown = null;
      try {
        data = await resp.json();
      } catch {
        // empty or non-JSON response
      }

      return { statusCode: resp.status, data };
    } catch (e) {
      lastError = e;
      if (attempt < MAX_RETRIES) {
        console.info(
          `Request failed (${e}), retrying (${attempt + 1}/${MAX_RETRIES})`
        );
        await sleep(INITIAL_BACKOFF * 2 ** attempt);
        continue;
      }
    }
  }

  console.warn(
    `${LOG_PREFIX} method=${method} url=${url} reason=unreachable:${lastError}`
  );
  return { statusCode: 0, data: null };
}
