import { NextResponse, type NextRequest } from "next/server";
import { getUser, homePathFor } from "@/lib/auth/session";

// Signed-in landing point: onboarding until the vault has facts, then the
// applications list.
export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.nextUrl.origin));
  return NextResponse.redirect(new URL(await homePathFor(user.id), request.nextUrl.origin));
}
