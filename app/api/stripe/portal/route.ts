import { NextResponse } from "next/server";
import { handle, requireApiUser } from "@/lib/api/respond";
import { createPortal } from "@/lib/billing/checkout";

export const POST = handle(async () => {
  const user = await requireApiUser();
  return NextResponse.json({ url: await createPortal(user.id) });
});
