import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { getUser, type SessionUser } from "@/lib/auth/session";
import { AiLimitError, aiErrorMessage } from "@/lib/ai/run";
import { AiError } from "@/lib/ai/provider";
import { PlanLimitError } from "@/lib/billing/limits";

// Shared helpers for route handlers. Every API response that fails carries a
// plain-language message saying what happened and what to do next.

export interface ApiErrorBody {
  error: { code: string; message: string; upgrade?: boolean };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function fail(status: number, code: string, message: string, extra: Partial<ApiErrorBody["error"]> = {}) {
  return NextResponse.json<ApiErrorBody>({ error: { code, message, ...extra } }, { status });
}

export async function requireApiUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) throw new ApiError(401, "signed_out", "You've been signed out. Sign in again to continue.");
  return user;
}

export async function parseJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "bad_request", "The request was empty or not readable. Please try again.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ApiError(400, "invalid_input", first?.message && !first.message.startsWith("Invalid") ? first.message : "Some of the information sent wasn't valid. Check it and try again.");
  }
  return parsed.data;
}

/** Wraps a route handler: known errors become friendly JSON responses. */
export function handle<Args extends unknown[]>(fn: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) return fail(error.status, error.code, error.message);
  if (error instanceof PlanLimitError) return fail(402, error.code, error.message, { upgrade: true });
  if (error instanceof AiLimitError || error instanceof AiError) {
    const { status, message } = aiErrorMessage(error);
    return fail(status, error.code, message);
  }
  // Log the shape of the failure only, never request content.
  console.error("Unhandled API error", error instanceof Error ? error.name : typeof error);
  return fail(500, "server_error", "Something went wrong on our side. Please try again in a moment.");
}

export const notFound = (thing = "That item") => new ApiError(404, "not_found", `${thing} wasn't found. It may have been removed.`);
