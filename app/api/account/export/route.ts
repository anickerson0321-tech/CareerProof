import { NextResponse } from "next/server";
import { handle, requireApiUser } from "@/lib/api/respond";
import { exportAccountData } from "@/lib/account/service";

// "Download my data": the whole vault and every application as JSON.
export const GET = handle(async () => {
  const user = await requireApiUser();
  const data = await exportAccountData(user.id);
  const date = data.exported_at.slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="careerproof-data-${date}.json"`,
      "cache-control": "private, no-store",
    },
  });
});
