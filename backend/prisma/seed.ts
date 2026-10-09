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
  // Component substitute pairs
  const ardUno = await prisma.component.findFirst({
    where: { code: "ARD-UNO-R3" },
  });
  const ardNano = await prisma.component.findFirst({
    where: { code: "ARD-NANO" },
  });

  if (ardUno && ardNano) {
    await prisma.componentSubstitute.upsert({
      where: {
        originalId_substituteId: {
          originalId: ardUno.id,
          substituteId: ardNano.id,
        },
      },
      update: {},
      create: {
        originalId: ardUno.id,
        substituteId: ardNano.id,
        ratio: 1,
      },
    });
    console.log("Seeded: ARD-UNO-R3 → ARD-NANO substitute pair");
  }

  // ─── Department Quotas (Task 6.13) ──────────────────────────────────────────
  const quotaSpecs = [
    // CSE Quotas
    { dept: "CSE", code: "ARD-UNO-R3", qty: 35 },
    { dept: "CSE", code: "ARD-NANO", qty: 25 },
    { dept: "CSE", code: "ESP32-DEV", qty: 30 },
    { dept: "CSE", code: "MULTI-DIG", qty: 15 },
    { dept: "CSE", code: "OSCIL-50MHZ", qty: 10 },
    { dept: "CSE", code: "BREAD-830PT", qty: 60 },
    { dept: "CSE", code: "LED-RED-5MM", qty: 250 },
    { dept: "CSE", code: "RES-220OHM", qty: 250 },
    { dept: "CSE", code: "RES-10KOHM", qty: 150 },
    { dept: "CSE", code: "SERVO-SG90", qty: 25 },
    { dept: "CSE", code: "ULTRA-HC-SR04", qty: 25 },
    // EEE Quotas
    { dept: "EEE", code: "ARD-UNO-R3", qty: 20 },
    { dept: "EEE", code: "MULTI-DIG", qty: 30 },
    { dept: "EEE", code: "OSCIL-50MHZ", qty: 20 },
    { dept: "EEE", code: "BREAD-830PT", qty: 50 },
    { dept: "EEE", code: "LED-RED-5MM", qty: 200 },
    { dept: "EEE", code: "RES-220OHM", qty: 200 },
    { dept: "EEE", code: "RES-10KOHM", qty: 200 },
    // CIVIL Quotas
    { dept: "CIVIL", code: "MULTI-DIG", qty: 10 },
    { dept: "CIVIL", code: "ULTRA-HC-SR04", qty: 15 },
  ];

  const deptByCode = Object.fromEntries(departments.map((d) => [d.code, d]));

  for (const q of quotaSpecs) {
    const dept = deptByCode[q.dept];
    const comp = compByCode[q.code];
    if (dept && comp) {
      await prisma.departmentQuota.upsert({
        where: {
          departmentId_componentId: {
            departmentId: dept.id,
            componentId: comp.id,
          },
        },
        update: { qty: q.qty, suggestedQty: q.qty },
        create: {
          departmentId: dept.id,
          componentId: comp.id,
          qty: q.qty,
          suggestedQty: q.qty,
          confirmedAt: new Date(),
        },
      });
    }
  }
  console.log("Seeded:", quotaSpecs.length, "department quotas");

  // ─── 8 Weeks of Historical Class Sessions & Requisitions (Task 6.13) ────────
  const allRoutineSlots = await prisma.routineSlot.findMany({
    include: {
      section: {
        include: {
          course: {
            include: {
              experiments: {
                include: { items: true },
                orderBy: { number: "asc" },
              },
            },
          },
        },
      },
      lab: true,
    },
  });

  const now = new Date();
  const cseRequisitionsWithShortage: string[] = [];

  for (const slot of allRoutineSlots) {
    const exps = slot.section.course.experiments;
    if (exps.length === 0) continue;

    const groupSize = slot.lab.groupSize || 4;
    const groups = Math.ceil(slot.section.studentCount / groupSize);

    // Generate past 8 weeks (weeksAgo 8 down to 1)
    for (let weeksAgo = 8; weeksAgo >= 1; weeksAgo--) {
      const utc = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
      const currentDayOfWeek = utc.getUTCDay();
      const dayDiff = (currentDayOfWeek - slot.dayOfWeek + 7) % 7;
      const targetTime =
        utc.getTime() - (dayDiff + (weeksAgo - 1) * 7 + 7) * 24 * 60 * 60 * 1000;
      const sessionDate = new Date(targetTime);

      const [startH, startM] = slot.startTime.split(":").map(Number);
      const [endH, endM] = slot.endTime.split(":").map(Number);
      const startsAt = new Date(sessionDate.getTime());
      startsAt.setUTCHours(startH, startM, 0, 0);
      const endsAt = new Date(sessionDate.getTime());
      endsAt.setUTCHours(endH, endM, 0, 0);

      const exp = exps[(8 - weeksAgo) % exps.length];

      const session = await prisma.classSession.upsert({
        where: {
          routineSlotId_date: {
            routineSlotId: slot.id,
            date: sessionDate,
          },
        },
        update: {
          startsAt,
          endsAt,
          experimentId: exp.id,
          status: "COMPLETED",
        },
        create: {
          routineSlotId: slot.id,
          date: sessionDate,
          startsAt,
          endsAt,
          experimentId: exp.id,
          status: "COMPLETED",
        },
      });

      const requisition = await prisma.requisition.upsert({
        where: { classSessionId: session.id },
        update: {
          status: "RETURNED",
          issuedAt: startsAt,
          returnedAt: endsAt,
        },
        create: {
          type: "CLASS",
          origin: "AUTO_DRAFT",
          classSessionId: session.id,
          requestedById: slot.section.instructorId || users[1].id,
          departmentId: slot.section.course.departmentId,
          neededFrom: startsAt,
          neededTo: endsAt,
          status: "RETURNED",
          issuedAt: startsAt,
          issuedById: users[2].id,
          returnedAt: endsAt,
          returnedById: users[2].id,
        },
      });

      let reqHadShortage = false;

      for (const item of exp.items) {
        const comp =
          compByCode[
            Object.keys(compByCode).find(
              (k) => compByCode[k].id === item.componentId,
            ) ?? ""
          ];
        const compCode = comp ? comp.code : "";
        const qtyNeeded = item.qtyPerGroup * groups;

        let qtyShort = 0;
        let qtyDamaged = 0;
        let qtyLost = 0;

        // Controlled shortage patterns
        if (compCode === "ARD-UNO-R3" && [3, 5, 7].includes(weeksAgo)) {
          qtyShort = Math.min(qtyNeeded, weeksAgo === 3 ? 6 : 4);
        } else if (compCode === "ESP32-DEV" && [2, 4, 6].includes(weeksAgo)) {
          qtyShort = Math.min(qtyNeeded, weeksAgo === 2 ? 4 : 3);
        } else if (compCode === "SERVO-SG90" && [1, 5].includes(weeksAgo)) {
          qtyShort = Math.min(qtyNeeded, 2);
        } else if (compCode === "ULTRA-HC-SR04" && [2, 6].includes(weeksAgo)) {
          qtyShort = Math.min(qtyNeeded, 3);
        } else if (compCode === "OSCIL-50MHZ" && [3, 7].includes(weeksAgo)) {
          qtyShort = Math.min(qtyNeeded, 2);
        } else if (compCode === "BREAD-830PT" && [1, 4].includes(weeksAgo)) {
          qtyShort = Math.min(qtyNeeded, 5);
        }

        const qtyIssued = qtyNeeded - qtyShort;

        // Controlled damage & loss patterns on returned items
        if (qtyIssued > 0) {
          if (compCode === "LED-RED-5MM") {
            qtyDamaged = slot.section.name === "A" ? 2 : 1;
            qtyLost = slot.section.name === "A" ? 3 : 1;
          } else if (compCode === "RES-220OHM" && [2, 4, 6].includes(weeksAgo)) {
            qtyLost = 2;
          } else if (compCode === "RES-10KOHM" && [3, 7].includes(weeksAgo)) {
            qtyLost = 1;
          } else if (compCode === "JUMP-MM" && [1, 3, 5, 7].includes(weeksAgo)) {
            qtyLost = 1;
          } else if (
            compCode === "BREAD-830PT" &&
            weeksAgo === 4 &&
            slot.section.course.code === "CSE 2216"
          ) {
            qtyDamaged = 1;
          } else if (compCode === "SERVO-SG90" && weeksAgo === 4) {
            qtyDamaged = 1;
          } else if (compCode === "ULTRA-HC-SR04" && weeksAgo === 3) {
            qtyDamaged = 1;
          } else if (
            compCode === "ARD-UNO-R3" &&
            weeksAgo === 5 &&
            slot.section.name === "A"
          ) {
            qtyDamaged = 1;
          }
        }

        const qtyReturnedGood = Math.max(0, qtyIssued - qtyDamaged - qtyLost);

        await prisma.requisitionLine.upsert({
          where: {
            requisitionId_componentId: {
              requisitionId: requisition.id,
              componentId: item.componentId,
            },
          },
          update: {
            qtyNeeded,
            qtyIssued,
            qtyReturnedGood,
            qtyDamaged,
            qtyLost,
            qtyShort,
            qtyOwnQuota: qtyIssued,
          },
          create: {
            requisitionId: requisition.id,
            componentId: item.componentId,
            qtyNeeded,
            qtyIssued,
            qtyReturnedGood,
            qtyDamaged,
            qtyLost,
            qtyShort,
            qtyOwnQuota: qtyIssued,
          },
        });

        if (qtyShort > 0) {
          reqHadShortage = true;
        }
      }

      if (reqHadShortage) {
        cseRequisitionsWithShortage.push(requisition.id);
      }
    }
  }
  console.log("Seeded: 8 weeks of historical ClassSessions and Requisitions");

  // ─── Inter-Department Borrowing Network (Task 6.13) ─────────────────────────
  const eeeRequisition = await prisma.requisition.upsert({
    where: { id: "seed-req-eee-borrow-anchor" },
    update: { status: "RETURNED" },
    create: {
      id: "seed-req-eee-borrow-anchor",
      type: "MAINTENANCE",
      origin: "LAB_ASSISTANT",
      requestedById: users[2].id,
      departmentId: departments[1].id, // EEE
      neededFrom: new Date(now.getTime() - 25 * 24 * 60 * 60 * 1000),
      neededTo: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
      status: "RETURNED",
    },
  });

  const civilRequisition = await prisma.requisition.upsert({
    where: { id: "seed-req-civil-borrow-anchor" },
    update: { status: "RETURNED" },
    create: {
      id: "seed-req-civil-borrow-anchor",
      type: "CLASS",
      origin: "LAB_ASSISTANT",
      requestedById: users[2].id,
      departmentId: departments[2].id, // CIVIL
      neededFrom: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000),
      neededTo: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
      status: "RETURNED",
    },
  });

  const cseAnchorReqId =
    cseRequisitionsWithShortage[0] ||
    (
      await prisma.requisition.findFirst({
        where: { departmentId: departments[0].id },
      })
    )?.id;

  if (cseAnchorReqId) {
    const borrowSpecs = [
      // CSE borrows from EEE (3 requests)
      {
        ref: "BORROW-CSE-EEE-1",
        reqId: cseAnchorReqId,
        lender: departments[1].id, // EEE
        borrower: departments[0].id, // CSE
        compCode: "ARD-UNO-R3",
        qty: 12,
        status: "RETURNED" as const,
        daysAgo: 35,
      },
      {
        ref: "BORROW-CSE-EEE-2",
        reqId: cseAnchorReqId,
        lender: departments[1].id, // EEE
        borrower: departments[0].id, // CSE
        compCode: "ARD-UNO-R3",
        qty: 8,
        status: "RETURNED" as const,
        daysAgo: 21,
      },
      {
        ref: "BORROW-CSE-EEE-3",
        reqId: cseAnchorReqId,
        lender: departments[1].id, // EEE
        borrower: departments[0].id, // CSE
        compCode: "ESP32-DEV",
        qty: 6,
        status: "RETURNED" as const,
        daysAgo: 14,
      },
      // EEE borrows from CSE (2 requests)
      {
        ref: "BORROW-EEE-CSE-1",
        reqId: eeeRequisition.id,
        lender: departments[0].id, // CSE
        borrower: departments[1].id, // EEE
        compCode: "OSCIL-50MHZ",
        qty: 4,
        status: "RETURNED" as const,
        daysAgo: 28,
      },
      {
        ref: "BORROW-EEE-CSE-2",
        reqId: eeeRequisition.id,
        lender: departments[0].id, // CSE
        borrower: departments[1].id, // EEE
        compCode: "MULTI-DIG",
        qty: 10,
        status: "RETURNED" as const,
        daysAgo: 18,
      },
      // CIVIL borrows from EEE (2 requests)
      {
        ref: "BORROW-CIVIL-EEE-1",
        reqId: civilRequisition.id,
        lender: departments[1].id, // EEE
        borrower: departments[2].id, // CIVIL
        compCode: "MULTI-DIG",
        qty: 5,
        status: "RETURNED" as const,
        daysAgo: 12,
      },
      {
        ref: "BORROW-CIVIL-EEE-2",
        reqId: civilRequisition.id,
        lender: departments[1].id, // EEE
        borrower: departments[2].id, // CIVIL
        compCode: "ULTRA-HC-SR04",
        qty: 6,
        status: "RETURNED" as const,
        daysAgo: 7,
      },
      // CIVIL borrows from CSE (1 request)
      {
        ref: "BORROW-CIVIL-CSE-1",
        reqId: civilRequisition.id,
        lender: departments[0].id, // CSE
        borrower: departments[2].id, // CIVIL
        compCode: "BREAD-830PT",
        qty: 15,
        status: "HANDED_OVER" as const,
        daysAgo: 4,
      },
    ];

    for (const b of borrowSpecs) {
      const comp = compByCode[b.compCode];
      if (!comp) continue;

      const borrowDate = new Date(
        now.getTime() - b.daysAgo * 24 * 60 * 60 * 1000,
      );
      const returnDate = new Date(
        borrowDate.getTime() + 5 * 24 * 60 * 60 * 1000,
      );

      const existingBorrow = await prisma.borrowRequest.findFirst({
        where: { remarks: b.ref },
      });

      let borrowId = existingBorrow?.id;

      if (existingBorrow) {
        await prisma.borrowRequest.update({
          where: { id: existingBorrow.id },
          data: {
            status: b.status,
            lenderDeptId: b.lender,
            borrowerDeptId: b.borrower,
            returnBy: returnDate,
          },
        });
      } else {
        const created = await prisma.borrowRequest.create({
          data: {
            requisitionId: b.reqId,
            lenderDeptId: b.lender,
            borrowerDeptId: b.borrower,
            status: b.status,
            returnBy: returnDate,
            remarks: b.ref,
            createdAt: borrowDate,
          },
        });
        borrowId = created.id;
      }

      if (borrowId) {
        await prisma.borrowLine.deleteMany({
          where: { borrowRequestId: borrowId },
        });

        await prisma.borrowLine.create({
          data: {
            borrowRequestId: borrowId,
            componentId: comp.id,
            qtyRequested: b.qty,
            qtyApproved: b.qty,
            qtyReturned: b.status === "RETURNED" ? b.qty : 0,
          },
        });
      }
    }
    console.log(
      "Seeded:",
      borrowSpecs.length,
      "inter-department borrow requests with lines",
    );
  }

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
