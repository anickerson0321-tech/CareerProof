import { NextResponse, type NextRequest } from "next/server";
import { handle, parseJson, requireApiUser } from "@/lib/api/respond";
import { profileSchema } from "@/lib/account/profile";
import { ApiError } from "@/lib/api/respond";
import { createClient } from "@/lib/supabase/server";

// Name and contact details printed on resumes and cover letters.
export const PATCH = handle(async (request: NextRequest) => {
  const user = await requireApiUser();
  const input = await parseJson(request, profileSchema);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update(input)
    .eq("user_id", user.id)
    .select("full_name, email, phone, location")
    .single();
  if (error) throw new ApiError(500, "save_failed", "We couldn't save your details. Please try again.");
  return NextResponse.json(data);
});
