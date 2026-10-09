import bcryptjs from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const input = z.object({
  ADMIN_EMAIL: z.string().email(),
  ADMIN_FULL_NAME: z.string().trim().min(2),
  ADMIN_PASSWORD: z.string().min(12),
}).parse(process.env);

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const existing = await prisma.user.findFirst({
    where: { role: "SYSTEM_ADMIN", isActive: true },
    select: { id: true },
  });
  if (existing) throw new Error("An active system administrator already exists");
  await prisma.user.create({
    data: {
      email: input.ADMIN_EMAIL.toLowerCase(),
      fullName: input.ADMIN_FULL_NAME,
      passwordHash: await bcryptjs.hash(input.ADMIN_PASSWORD, 10),
      role: "SYSTEM_ADMIN",
    },
  });
  console.log("System administrator created");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
