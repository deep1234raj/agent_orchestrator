/**
 * Fetch wrapper.
 *
 * One function — `api()` — handles every backend call. Uniform error
 * shape, no manual JSON parsing at call sites, full TS narrowing of
 * response types via generics.
 *
 * Why not openapi-fetch? It's great for fully-generated codebases but
 * adds verbosity for our scale. A 40-line wrapper gives ergonomic call
 * sites and one place to change behavior (auth, retries, logging).
 */

interface ApiError {
  detail: string;
  code: string;
  errors?: unknown;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export class ApiException extends Error {
  status: number;
  code: string;
  detail: string;
  errors?: unknown;

  constructor(status: number, body: ApiError) {
    super(body.detail);
    this.status = status;
    this.code = body.code;
    this.detail = body.detail;
    this.errors = body.errors;
    this.name = "ApiException";
  }
}

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface ApiOptions {
  method?: Method;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

export async function api<T = unknown>(
  path: string,
  opts: ApiOptions = {},
): Promise<T> {
  const { method = "GET", body, query, signal } = opts;

  let url = `${API_URL}${path}`;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
    }
    const q = qs.toString();
    if (q) url += `?${q}`;
  }

  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    signal,
    // Default to no caching — this is a live tool, not content.
    cache: "no-store",
  };
  if (body !== undefined) init.body = JSON.stringify(body);

  const resp = await fetch(url, init);

  // 204 No Content
  if (resp.status === 204) return undefined as T;

  const text = await resp.text();
  const data = text ? (JSON.parse(text) as unknown) : undefined;

  if (!resp.ok) {
    const errBody = (data ?? {
      detail: resp.statusText,
      code: "unknown",
    }) as ApiError;
    throw new ApiException(resp.status, errBody);
  }

  return data as T;
}

export { API_URL };
