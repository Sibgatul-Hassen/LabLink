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
  const labByRoom = Object.fromEntries(labs.map((lab) => [lab.roomNo, lab]));

  // Create courses
  const courseSpecs = [
    { code: "CSE 3216", title: "Microprocessor and Microcontroller Lab" },
    { code: "CSE 4108", title: "Embedded Systems Lab" },
    { code: "CSE 2216", title: "Digital Logic Design Lab" },
  ];

  const courses = await Promise.all(
    courseSpecs.map((spec) =>
      prisma.course.upsert({
        where: { code: spec.code },
        update: { title: spec.title, isActive: true },
        create: {
          code: spec.code,
          title: spec.title,
          departmentId: departments[0].id,
          isActive: true,
        },
      }),
    ),
  );
  console.log("Created", courses.length, "courses");

  const courseByCode = Object.fromEntries(
    courses.map((course) => [course.code, course]),
  );

  // Create sections
  const SEMESTER = "Spring 2026";

  const sectionSpecs = [
    { course: "CSE 3216", name: "A", studentCount: 45 },
    { course: "CSE 3216", name: "B", studentCount: 42 },
    { course: "CSE 4108", name: "A", studentCount: 38 },
    { course: "CSE 4108", name: "B", studentCount: 36 },
    { course: "CSE 2216", name: "A", studentCount: 48 },
    { course: "CSE 2216", name: "B", studentCount: 44 },
  ];

  const sections = await Promise.all(
    sectionSpecs.map((spec) =>
      prisma.section.upsert({
        where: {
          courseId_name_semester: {
            courseId: courseByCode[spec.course].id,
            name: spec.name,
            semester: SEMESTER,
          },
        },
        update: {
          studentCount: spec.studentCount,
          instructorId: users[1].id,
          labAssistantId: users[2].id,
        },
        create: {
          courseId: courseByCode[spec.course].id,
          name: spec.name,
          semester: SEMESTER,
          studentCount: spec.studentCount,
          instructorId: users[1].id,
          labAssistantId: users[2].id,
        },
      }),
    ),
  );
  console.log("Created", sections.length, "sections");

  const sectionByKey: Record<string, (typeof sections)[number]> = {};
  sectionSpecs.forEach((spec, index) => {
    sectionByKey[`${spec.course}|${spec.name}`] = sections[index];
  });

  // Create routine slots
  // SEED_DATA.md fixes these at 2026-01-15 → 2026-05-30, but a routine whose
  // window has already closed generates no sessions at all, so the demo would
  // look broken. Anchoring to the current date keeps generateSessions()
  // meaningful whenever the seed is run.
  const seedNow = new Date();
  const EFFECTIVE_FROM = new Date(
    Date.UTC(
      seedNow.getUTCFullYear(),
      seedNow.getUTCMonth(),
      seedNow.getUTCDate() - 60,
    ),
  );
  const EFFECTIVE_TO = new Date(
    Date.UTC(
      seedNow.getUTCFullYear(),
      seedNow.getUTCMonth(),
      seedNow.getUTCDate() + 120,
    ),
  );

  const routineSlotSpecs = [
    {
      course: "CSE 3216",
      section: "A",
      dayOfWeek: 2,
      startTime: "08:30",
      endTime: "11:30",
      room: "302",
    },
    {
      course: "CSE 3216",
      section: "B",
      dayOfWeek: 0,
      startTime: "08:30",
      endTime: "11:30",
      room: "302",
    },
    {
      course: "CSE 4108",
      section: "A",
      dayOfWeek: 2,
      startTime: "08:30",
      endTime: "11:30",
      room: "303",
    },
    {
      course: "CSE 4108",
      section: "B",
      dayOfWeek: 2,
      startTime: "14:00",
      endTime: "17:00",
      room: "303",
    },
    {
      course: "CSE 2216",
      section: "A",
      dayOfWeek: 2,
      startTime: "08:30",
      endTime: "11:30",
      room: "304",
    },
    {
      course: "CSE 2216",
      section: "B",
      dayOfWeek: 0,
      startTime: "14:00",
      endTime: "17:00",
      room: "304",
    },
  ];

  // RoutineSlot has no natural unique key, so upsert is unavailable. Match on
  // section + lab + day + start time instead, and run sequentially so a
  // find-then-create pair cannot race itself into a duplicate. Existing rows
  // are updated so re-seeding refreshes the effective window.
  for (const spec of routineSlotSpecs) {
    const section = sectionByKey[`${spec.course}|${spec.section}`];
    const lab = labByRoom[spec.room];

    const existing = await prisma.routineSlot.findFirst({
      where: {
        sectionId: section.id,
        labId: lab.id,
        dayOfWeek: spec.dayOfWeek,
        startTime: spec.startTime,
      },
    });

    if (existing) {
      await prisma.routineSlot.update({
        where: { id: existing.id },
        data: {
          endTime: spec.endTime,
          effectiveFrom: EFFECTIVE_FROM,
          effectiveTo: EFFECTIVE_TO,
        },
      });
    } else {
      await prisma.routineSlot.create({
        data: {
          sectionId: section.id,
          labId: lab.id,
          dayOfWeek: spec.dayOfWeek,
          startTime: spec.startTime,
          endTime: spec.endTime,
          effectiveFrom: EFFECTIVE_FROM,
          effectiveTo: EFFECTIVE_TO,
        },
      });
    }
  }

  console.log("Created", routineSlotSpecs.length, "routine slots");

  const compByCode = Object.fromEntries(
    components.map((component) => [component.code, component]),
  );

  // Create experiments and their item lists
  const experimentSpecs = [
    {
      course: "CSE 3216",
      number: 1,
      title: "Blinking LED and Digital Output",
      items: [
        { code: "ARD-UNO-R3", qtyPerGroup: 1 },
        { code: "BREAD-830PT", qtyPerGroup: 1 },
        { code: "LED-RED-5MM", qtyPerGroup: 4 },
        { code: "RES-220OHM", qtyPerGroup: 4 },
        { code: "JUMP-MM", qtyPerGroup: 1 },
      ],
    },
    {
      course: "CSE 3216",
      number: 2,
      title: "Analog Input and Sensors",
      items: [
        { code: "ARD-UNO-R3", qtyPerGroup: 1 },
        { code: "BREAD-830PT", qtyPerGroup: 1 },
        { code: "RES-10KOHM", qtyPerGroup: 2 },
        { code: "JUMP-MM", qtyPerGroup: 1 },
      ],
    },
    {
      course: "CSE 3216",
      number: 3,
      title: "Serial Communication",
      items: [
        { code: "ARD-UNO-R3", qtyPerGroup: 1 },
        { code: "ARD-NANO", qtyPerGroup: 1 },
        { code: "BREAD-830PT", qtyPerGroup: 1 },
      ],
    },
    {
      // The demonstration experiment from SEED_DATA.md section 12.
      course: "CSE 3216",
      number: 4,
      title: "PWM and Servo Control",
      items: [
        { code: "ARD-UNO-R3", qtyPerGroup: 2 },
        { code: "SERVO-SG90", qtyPerGroup: 1 },
        { code: "BREAD-830PT", qtyPerGroup: 1 },
        { code: "LED-RED-5MM", qtyPerGroup: 5 },
        { code: "RES-220OHM", qtyPerGroup: 5 },
        { code: "JUMP-MM", qtyPerGroup: 1 },
      ],
    },
    {
      course: "CSE 4108",
      number: 1,
      title: "ESP32 GPIO and Interrupts",
      items: [
        { code: "ESP32-DEV", qtyPerGroup: 1 },
        { code: "BREAD-830PT", qtyPerGroup: 1 },
        { code: "LED-RED-5MM", qtyPerGroup: 3 },
        { code: "RES-220OHM", qtyPerGroup: 3 },
      ],
    },
    {
      course: "CSE 4108",
      number: 2,
      title: "Ultrasonic Distance Measurement",
      items: [
        { code: "ESP32-DEV", qtyPerGroup: 1 },
        { code: "ULTRA-HC-SR04", qtyPerGroup: 1 },
        { code: "BREAD-830PT", qtyPerGroup: 1 },
      ],
    },
    {
      course: "CSE 4108",
      number: 3,
      title: "Wi-Fi Data Logging",
      items: [
        { code: "ESP32-DEV", qtyPerGroup: 1 },
        { code: "BREAD-830PT", qtyPerGroup: 1 },
      ],
    },
    {
      course: "CSE 2216",
      number: 1,
      title: "Basic Logic Gates",
      items: [
        { code: "BREAD-830PT", qtyPerGroup: 1 },
        { code: "LED-RED-5MM", qtyPerGroup: 4 },
        { code: "RES-220OHM", qtyPerGroup: 4 },
      ],
    },
    {
      course: "CSE 2216",
      number: 2,
      title: "Flip-Flops and Latches",
      items: [
        { code: "BREAD-830PT", qtyPerGroup: 1 },
        { code: "LED-RED-5MM", qtyPerGroup: 4 },
        { code: "OSCIL-50MHZ", qtyPerGroup: 1 },
      ],
    },
    {
      course: "CSE 2216",
      number: 3,
      title: "Counters and Registers",
      items: [
        { code: "BREAD-830PT", qtyPerGroup: 1 },
        { code: "LED-RED-5MM", qtyPerGroup: 8 },
      ],
    },
  ];

  for (const spec of experimentSpecs) {
    const course = courseByCode[spec.course];

    const experiment = await prisma.experiment.upsert({
      where: {
        courseId_number: { courseId: course.id, number: spec.number },
      },
      update: { title: spec.title },
      create: {
        courseId: course.id,
        number: spec.number,
        title: spec.title,
      },
    });

    for (const item of spec.items) {
      const component = compByCode[item.code];

      await prisma.experimentItem.upsert({
        where: {
          experimentId_componentId: {
            experimentId: experiment.id,
            componentId: component.id,
          },
        },
        update: { qtyPerGroup: item.qtyPerGroup },
        create: {
          experimentId: experiment.id,
          componentId: component.id,
          qtyPerGroup: item.qtyPerGroup,
        },
      });
    }
  }
  console.log("Created", experimentSpecs.length, "experiments");

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
