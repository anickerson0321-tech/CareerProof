"use client";

// Browser-side fetch helper for our API routes. Errors come back as
// ApiClientError with the server's plain-language message.

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly upgrade = false,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export async function api<T>(
  url: string,
  options: { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? (options.body || options.form ? "POST" : "GET"),
      headers: options.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: options.form ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiClientError(0, "aborted", "Cancelled.");
    }
    throw new ApiClientError(0, "offline", "We couldn't reach CareerProof. Check your internet connection and try again.");
  }

  const data = (await response.json().catch(() => null)) as
    | (T & { error?: undefined })
    | { error: { code: string; message: string; upgrade?: boolean } }
    | null;

  if (!response.ok || (data && "error" in data && data.error)) {
    const err = data && "error" in data && data.error ? data.error : null;
    throw new ApiClientError(
      response.status,
      err?.code ?? "server_error",
      err?.message ?? "Something went wrong. Please try again.",
      err?.upgrade ?? false,
    );
  }
  return data as T;
}
