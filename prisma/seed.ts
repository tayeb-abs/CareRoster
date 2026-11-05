import "dotenv/config";
import { NurseLevel, RoleName, ShiftType } from "@prisma/client";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/password";
import { buildMonthlySchedule, saveMonthlySchedule } from "../src/lib/scheduling/persistence";
import type { Assignment } from "../src/lib/scheduling/engine";

const starterNurses = [
  { id: "10000000-0000-4000-8000-000000000001", name: "Avery Brooks", email: "avery.brooks@example.local", color: "#2c9c84", level: NurseLevel.SENIOR },
  { id: "10000000-0000-4000-8000-000000000002", name: "Jordan Lee", email: "jordan.lee@example.local", color: "#6584dc", level: NurseLevel.SENIOR },
  { id: "10000000-0000-4000-8000-000000000003", name: "Morgan Ellis", email: "morgan.ellis@example.local", color: "#ca8d54", level: NurseLevel.REGULAR },
  { id: "10000000-0000-4000-8000-000000000004", name: "Riley Chen", email: "riley.chen@example.local", color: "#bc6d81", level: NurseLevel.REGULAR },
  { id: "10000000-0000-4000-8000-000000000005", name: "Casey Patel", email: "casey.patel@example.local", color: "#7d71ba", level: NurseLevel.REGULAR },
  { id: "10000000-0000-4000-8000-000000000006", name: "Taylor Morgan", email: "taylor.morgan@example.local", color: "#4b8da4", level: NurseLevel.REGULAR },
];

function sampleLeaveDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

async function seedAccount(input: {
  username: string;
  email: string;
  name: string;
  password: string;
  roleId: string;
}) {
  const passwordHash = await hashPassword(input.password);
  const account = {
    username: input.username,
    email: input.email,
    name: input.name,
    roleId: input.roleId,
  };
  return db.user.upsert({
    where: { username: input.username },
    create: { ...account, passwordHash },
    update: { ...account, passwordHash, isActive: true },
  });
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("The demo seed contains weak test passwords and must never be run in production.");
  }
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) {
    throw new Error("Set AUTH_SECRET to at least 32 characters before seeding.");
  }

  const roles = await Promise.all([
    db.role.upsert({ where: { name: RoleName.ADMIN }, create: { name: RoleName.ADMIN }, update: {} }),
    db.role.upsert({ where: { name: RoleName.HEAD_NURSE }, create: { name: RoleName.HEAD_NURSE }, update: {} }),
  ]);
  const roleIds = new Map(roles.map((role) => [role.name, role.id]));

  const admin = await seedAccount({
    username: "admin",
    email: "admin@clinic.local",
    name: "Clinic Administrator",
    password: "admin",
    roleId: roleIds.get(RoleName.ADMIN)!,
  });
  await db.clinicProfile.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
  await seedAccount({
    username: "headnurse",
    email: "headnurse@clinic.local",
    name: "Head Nurse",
    password: "headnurse",
    roleId: roleIds.get(RoleName.HEAD_NURSE)!,
  });

  for (const nurse of starterNurses) {
    await db.nurse.upsert({
      where: { id: nurse.id },
      create: { ...nurse, title: "Registered Nurse", createdById: admin.id },
      update: { level: nurse.level },
    });
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const existingPeriod = await db.monthlySchedule.findUnique({
    where: { year_month: { year, month } },
    select: { id: true },
  });

  if (!existingPeriod) {
    const assignments: Assignment[] = [
      {
        nurseId: starterNurses[0].id,
        date: sampleLeaveDate(year, month, 10),
        type: ShiftType.SICK,
        isManual: true,
        overrideReason: "SICK_LEAVE",
        note: "Sample sick leave",
      },
      {
        nurseId: starterNurses[1].id,
        date: sampleLeaveDate(year, month, 20),
        type: ShiftType.EMERGENCY,
        isManual: true,
        overrideReason: "EMERGENCY_LEAVE",
        note: "Sample emergency leave",
      },
    ];
    const schedule = await buildMonthlySchedule(year, month, assignments);
    await saveMonthlySchedule(year, month, schedule, admin.id);
    console.info(`Created sample schedule for ${year}-${String(month).padStart(2, "0")} with two leave examples.`);
  } else {
    console.info(`Schedule for ${year}-${String(month).padStart(2, "0")} already exists; existing schedule was left unchanged.`);
  }

  console.info("Seeded development accounts:");
  console.info("  admin@clinic.local (username: admin, password: admin)");
  console.info("  headnurse@clinic.local (username: headnurse, password: headnurse)");
  console.info("These test accounts are development-only.");
}

main()
  .catch((error: unknown) => {
    console.error("Database seed failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
