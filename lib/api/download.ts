"use client";

import { ApiClientError } from "./client";

export interface DownloadError {
  message: string;
  /** Strict one-page resumes that don't fit: the lines that would need to go. */
  cuts?: { id: string; text: string }[];
}

/** Fetch a file from our API and hand it to the browser as a download. */
export async function downloadFile(url: string, fallbackName: string): Promise<{ pages: number | null }> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new ApiClientError(0, "offline", "We couldn't reach CareerProof. Check your internet connection and try again.");
  }
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: { code: string; message: string }; cuts?: DownloadError["cuts"] } | null;
    const error = new ApiClientError(response.status, data?.error?.code ?? "server_error", data?.error?.message ?? "The download didn't work. Please try again.");
    throw Object.assign(error, { cuts: data?.cuts });
  }
  const blob = await response.blob();
  const name = filenameFrom(response.headers.get("content-disposition")) ?? fallbackName;
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
  const pages = response.headers.get("x-page-count");
  return { pages: pages ? Number(pages) : null };
}

function filenameFrom(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      // fall through to the plain name
    }
  }
  return /filename="([^"]+)"/i.exec(header)?.[1] ?? null;
}
