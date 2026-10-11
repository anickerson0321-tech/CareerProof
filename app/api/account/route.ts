import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handle, parseJson, requireApiUser } from "@/lib/api/respond";
import { deleteAccount } from "@/lib/account/service";
import { createClient } from "@/lib/supabase/server";
import { DELETE_CONFIRMATION } from "@/lib/account/profile";

const bodySchema = z.object({
  confirm: z.literal(DELETE_CONFIRMATION, { error: `Type ${DELETE_CONFIRMATION} to confirm.` }),
});

// Deletes the account and everything in it. Needs the typed confirmation.
export const DELETE = handle(async (request: NextRequest) => {
  const user = await requireApiUser();
  await parseJson(request, bodySchema);
  await deleteAccount(user.id);
  // The user no longer exists; clear this browser's session cookies.
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  return NextResponse.json({ deleted: true });
});
