import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, isResponse, requireUser } from "@/lib/api";
import { db } from "@/lib/db";

const clinicProfileSchema = z.object({
  clinicNameEn: z.string().trim().min(1).max(160),
  clinicNameAr: z.string().trim().min(1).max(160),
  logoDataUrl: z.union([
    z.string().regex(/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/).max(1_400_000),
    z.literal(""),
  ]),
  address: z.string().trim().max(300),
  phoneNumber: z.string().trim().max(40),
  departmentName: z.string().trim().max(120),
  headNurseName: z.string().trim().max(120),
}).superRefine((profile, context) => {
  if (!validLogoData(profile.logoDataUrl)) {
    context.addIssue({ code: "custom", path: ["logoDataUrl"], message: "Invalid PNG or JPEG logo." });
  }
});

const validLogoData = (value: string) => {
  if (!value) return true;
  const match = /^(data:image\/(png|jpeg);base64),([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return false;
  const bytes = Buffer.from(match[3], "base64");
  return match[2] === "png"
    ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
};

const profileSelect = {
  id: true,
  clinicNameEn: true,
  clinicNameAr: true,
  logoDataUrl: true,
  address: true,
  phoneNumber: true,
  departmentName: true,
  headNurseName: true,
} as const;

async function ensureProfile() {
  return db.clinicProfile.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
    select: profileSelect,
  });
}

export async function GET(request: Request) {
  const user = await requireUser(request);
  if (isResponse(user)) return user;
  try {
    const profile = await ensureProfile();
    return NextResponse.json({ profile });
  } catch (error) {
    return apiError(error, "Read clinic profile");
  }
}

export async function PATCH(request: Request) {
  const user = await requireUser(request, ["ADMIN"]);
  if (isResponse(user)) return user;
  const parsed = clinicProfileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Provide valid clinic details and a PNG or JPEG logo under 1 MB." }, { status: 400 });
  }
  try {
    const profile = await db.clinicProfile.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        ...parsed.data,
        logoDataUrl: parsed.data.logoDataUrl || null,
        updatedById: user.id,
      },
      update: {
        ...parsed.data,
        logoDataUrl: parsed.data.logoDataUrl || null,
        updatedById: user.id,
      },
      select: profileSelect,
    });
    return NextResponse.json({ profile });
  } catch (error) {
    return apiError(error, "Update clinic profile");
  }
}
