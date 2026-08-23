import { PrismaClient } from "@prisma/client";
import bcryptjs from "bcryptjs";

const prisma = new PrismaClient();

const COST_FACTOR = 10;

async function main() {
  console.log("Seeding database...");

  // Create departments
  const departments = await Promise.all([
    prisma.department.upsert({
      where: { code: "CSE" },
      update: {},
      create: {
        code: "CSE",
        name: "Computer Science and Engineering",
        isOffice: false,
        isActive: true,
      },
    }),
    prisma.department.upsert({
      where: { code: "EEE" },
      update: {},
      create: {
        code: "EEE",
        name: "Electrical and Electronics Engineering",
        isOffice: false,
        isActive: true,
      },
    }),
    prisma.department.upsert({
      where: { code: "CIVIL" },
      update: {},
      create: {
        code: "CIVIL",
        name: "Civil Engineering",
        isOffice: false,
        isActive: true,
      },
    }),
    prisma.department.upsert({
      where: { code: "OFFICE" },
      update: {},
      create: {
        code: "OFFICE",
        name: "Component Room Office",
        isOffice: true,
        isActive: true,
      },
    }),
  ]);
  console.log("Created", departments.length, "departments");

  // Create users
  const hashedPassword = await bcryptjs.hash("Password123!", COST_FACTOR);

  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: "student@uiu.ac.bd" },
      update: {},
      create: {
        email: "student@uiu.ac.bd",
        passwordHash: hashedPassword,
        fullName: "Student User",
        role: "STUDENT",
        departmentId: departments[0].id,
        isActive: true,
      },
    }),
    prisma.user.upsert({
      where: { email: "instructor@uiu.ac.bd" },
      update: {},
      create: {
        email: "instructor@uiu.ac.bd",
        passwordHash: hashedPassword,
        fullName: "Instructor User",
        role: "INSTRUCTOR",
        departmentId: departments[0].id,
        isActive: true,
      },
    }),
    prisma.user.upsert({
      where: { email: "labasst@uiu.ac.bd" },
      update: {},
      create: {
        email: "labasst@uiu.ac.bd",
        passwordHash: hashedPassword,
        fullName: "Lab Assistant User",
        role: "LAB_ASSISTANT",
        departmentId: departments[0].id,
        isActive: true,
      },
    }),
    prisma.user.upsert({
      where: { email: "storehead@uiu.ac.bd" },
      update: {},
      create: {
        email: "storehead@uiu.ac.bd",
        passwordHash: hashedPassword,
        fullName: "Department Store Head",
        role: "DEPT_STORE_HEAD",
        departmentId: departments[0].id,
        isActive: true,
      },
    }),
    prisma.user.upsert({
      where: { email: "central@uiu.ac.bd" },
      update: {},
      create: {
        email: "central@uiu.ac.bd",
        passwordHash: hashedPassword,
        fullName: "Central Store Officer",
        role: "CENTRAL_STORE_OFFICER",
        departmentId: departments[3].id,
        isActive: true,
      },
    }),
    prisma.user.upsert({
      where: { email: "officeadmin@uiu.ac.bd" },
      update: {},
      create: {
        email: "officeadmin@uiu.ac.bd",
        passwordHash: hashedPassword,
        fullName: "Office Admin",
        role: "OFFICE_ADMIN",
        departmentId: departments[3].id,
        isActive: true,
      },
    }),
    prisma.user.upsert({
      where: { email: "sysadmin@uiu.ac.bd" },
      update: {},
      create: {
        email: "sysadmin@uiu.ac.bd",
        passwordHash: hashedPassword,
        fullName: "System Admin",
        role: "SYSTEM_ADMIN",
        departmentId: null,
        isActive: true,
      },
    }),
  ]);
  console.log("Created", users.length, "users");

  // Create components
  const componentSpecs = [
    {
      code: "ARD-UNO-R3",
      name: "Arduino Uno R3",
      category: "Microcontroller",
      sizeClass: "EXPENSIVE" as const,
      unitCost: 25.0,
    },
    {
      code: "ARD-NANO",
      name: "Arduino Nano",
      category: "Microcontroller",
      sizeClass: "EXPENSIVE" as const,
      unitCost: 20.0,
    },
    {
      code: "ESP32-DEV",
      name: "ESP32 DevKit",
      category: "Microcontroller",
      sizeClass: "EXPENSIVE" as const,
      unitCost: 30.0,
    },
    {
      code: "MULTI-DIG",
      name: "Digital Multimeter",
      category: "Instrument",
      sizeClass: "EXPENSIVE" as const,
      unitCost: 150.0,
    },
    {
      code: "OSCIL-50MHZ",
      name: "Oscilloscope",
      category: "Instrument",
      sizeClass: "EXPENSIVE" as const,
      unitCost: 500.0,
    },
    {
      code: "BREAD-830PT",
      name: "Breadboard 830pt",
      category: "Component Holder",
      sizeClass: "SMALL" as const,
      unitCost: 5.0,
    },
    {
      code: "JUMP-MM",
      name: "Jumper Wire M-M",
      category: "Passive",
      sizeClass: "SMALL" as const,
      unitCost: 0.5,
    },
    {
      code: "LED-RED-5MM",
      name: "Red LED 5mm",
      category: "Passive",
      sizeClass: "SMALL" as const,
      unitCost: 0.1,
    },
    {
      code: "RES-220OHM",
      name: "Resistor 220Ω",
      category: "Passive",
      sizeClass: "SMALL" as const,
      unitCost: 0.05,
    },
    {
      code: "RES-10KOHM",
      name: "Resistor 10kΩ",
      category: "Passive",
      sizeClass: "SMALL" as const,
      unitCost: 0.05,
    },
    {
      code: "SERVO-SG90",
      name: "Servo SG90",
      category: "Motor",
      sizeClass: "SMALL" as const,
      unitCost: 10.0,
    },
    {
      code: "ULTRA-HC-SR04",
      name: "Ultrasonic HC-SR04",
      category: "Sensor",
      sizeClass: "SMALL" as const,
      unitCost: 8.0,
    },
  ];

  const components = await Promise.all(
    componentSpecs.map((spec) =>
      prisma.component.upsert({
        where: { code: spec.code },
        update: { unitCost: spec.unitCost, isActive: true },
        create: {
          code: spec.code,
          name: spec.name,
          category: spec.category,
          sizeClass: spec.sizeClass,
          unitCost: spec.unitCost,
          unit: "pcs",
          isReturnable: true,
          isActive: true,
        },
      }),
    ),
  );
  console.log("Created", components.length, "components");

  // Create stock entries
  await Promise.all(
    components.map(async (component) => {
      let onHand: number;
      let spareQty: number;
      let reorderPoint: number;

      if (component.sizeClass === "EXPENSIVE") {
        onHand = 4;
        spareQty = 1;
        reorderPoint = 2;
      } else {
        onHand = 75;
        spareQty = 10;
        reorderPoint = 20;
      }

      return prisma.stock.upsert({
        where: { componentId: component.id },
        update: { onHand, spareQty, reorderPoint },
        create: {
          componentId: component.id,
          onHand,
          spareQty,
          reorderPoint,
        },
      });
    }),
  );
  console.log("Created", components.length, "stock entries");

  // Create labs
  const labSpecs = [
    { name: "Digital Systems Lab", roomNo: "302", groupSize: 4 },
    { name: "Embedded Systems Lab", roomNo: "303", groupSize: 4 },
    { name: "Logic Design Lab", roomNo: "304", groupSize: 4 },
  ];

  const labs = await Promise.all(
    labSpecs.map((spec) =>
      prisma.lab.upsert({
        where: {
          departmentId_roomNo: {
            departmentId: departments[0].id,
            roomNo: spec.roomNo,
          },
        },
        update: {
          name: spec.name,
          groupSize: spec.groupSize,
          labAssistantId: users[2].id,
          isActive: true,
        },
        create: {
          name: spec.name,
          roomNo: spec.roomNo,
          groupSize: spec.groupSize,
          departmentId: departments[0].id,
          labAssistantId: users[2].id,
          isActive: true,
        },
      }),
    ),
  );
  console.log("Created", labs.length, "labs");

  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error("Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
