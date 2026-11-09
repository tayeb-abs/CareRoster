import "dotenv/config";
import { RoleName } from "@prisma/client";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/password";

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

  await seedAccount({
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

  console.info("Seeded development accounts and roles; no nurses or schedules were created:");
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
