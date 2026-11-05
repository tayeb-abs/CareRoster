import { NextResponse } from "next/server";
import { isResponse, requireUser } from "@/lib/api";

export async function GET(request: Request) {
  const user = await requireUser(request);
  if (isResponse(user)) return user;
  const now = new Date();
  return NextResponse.json({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    today: now.toISOString().slice(0, 10),
  });
}
