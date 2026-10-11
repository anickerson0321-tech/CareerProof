import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handle, parseJson, requireApiUser } from "@/lib/api/respond";
import { createCheckout } from "@/lib/billing/checkout";

const bodySchema = z.object({ interval: z.enum(["monthly", "yearly"]) });

export const POST = handle(async (request: NextRequest) => {
  const user = await requireApiUser();
  const { interval } = await parseJson(request, bodySchema);
  return NextResponse.json({ url: await createCheckout(user, interval) });
});
