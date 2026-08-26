import bcryptjs from "bcryptjs";
import cors from "cors";
import express from "express";
import request from "supertest";

import { prisma } from "../lib/prisma";
import authRouter from "./auth.routes";
import routineSlotRouter from "./routine-slot.routes";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", authRouter);
app.use("/api", routineSlotRouter);

const testDepartmentCodes = ["TEST-IMP-DEPT", "TEST-IMP-OTHER"];
const testCourseCode = "TEST-IMP-COURSE";
const testEmails = ["imp-admin@test.com", "imp-central@test.com"];

const SEMESTER = "Spring 2027";
const ROOM = "TEST-IMP-901";
const OTHER_ROOM = "TEST-IMP-902";

const HEADER =
  "courseCode,sectionName,semester,dayOfWeek,startTime,endTime,roomNo,effectiveFrom,effectiveTo";

/** Dates are relative so the effective window is always live at run time. */
function isoDate(offsetDays: number): string {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + offsetDays);
  return value.toISOString().slice(0, 10);
}

const FROM = isoDate(-10);
const TO = isoDate(60);
const PAST_FROM = isoDate(-30);
const PAST_TO = isoDate(-5);

function line(
  sectionName: string,
  dayOfWeek: number,
  startTime: string,
  endTime: string,
  roomNo = ROOM,
  from = FROM,
  to = TO,
): string {
  return `${testCourseCode},${sectionName},${SEMESTER},${dayOfWeek},${startTime},${endTime},${roomNo},${from},${to}`;
}

async function clearSlots() {
  await prisma.classSession.deleteMany({
    where: {
      routineSlot: {
        lab: { department: { code: { in: testDepartmentCodes } } },
      },
    },
  });
  await prisma.routineSlot.deleteMany({
    where: { lab: { department: { code: { in: testDepartmentCodes } } } },
  });
}

async function cleanupTestData() {
  await clearSlots();
  await prisma.section.deleteMany({
    where: { course: { code: testCourseCode } },
  });
  await prisma.course.deleteMany({ where: { code: testCourseCode } });
  await prisma.lab.deleteMany({
    where: { department: { code: { in: testDepartmentCodes } } },
  });
  await prisma.user.deleteMany({ where: { email: { in: testEmails } } });
  await prisma.department.deleteMany({
    where: { code: { in: testDepartmentCodes } },
  });
}

describe("Routine CSV Import API Integration Tests", () => {
  let systemAdminToken: string;
  let centralStoreToken: string;

  beforeAll(async () => {
    await cleanupTestData();

    const department = await prisma.department.create({
      data: { code: testDepartmentCodes[0], name: "Import Test Department" },
    });

    const otherDepartment = await prisma.department.create({
      data: {
        code: testDepartmentCodes[1],
        name: "Import Test Other Department",
      },
    });

    await prisma.lab.create({
      data: {
        name: "Import Test Lab",
        roomNo: ROOM,
        groupSize: 4,
        departmentId: department.id,
      },
    });

    // Exists, but in a department that does not own the course. Proves the
    // room lookup is scoped rather than global.
    await prisma.lab.create({
      data: {
        name: "Import Test Other Lab",
        roomNo: OTHER_ROOM,
        groupSize: 4,
        departmentId: otherDepartment.id,
      },
    });

    const course = await prisma.course.create({
      data: {
        code: testCourseCode,
        title: "Import Test Course",
        departmentId: department.id,
      },
    });

    await prisma.section.create({
      data: {
        courseId: course.id,
        name: "A",
        semester: SEMESTER,
        studentCount: 40,
      },
    });

    await prisma.section.create({
      data: {
        courseId: course.id,
        name: "B",
        semester: SEMESTER,
        studentCount: 36,
      },
    });

    const hashedPassword = await bcryptjs.hash("test123", 10);

    await prisma.user.create({
      data: {
        email: "imp-admin@test.com",
        passwordHash: hashedPassword,
        fullName: "Import Test Admin",
        role: "SYSTEM_ADMIN",
        departmentId: null,
      },
    });

    await prisma.user.create({
      data: {
        email: "imp-central@test.com",
        passwordHash: hashedPassword,
        fullName: "Import Test Central Officer",
        role: "CENTRAL_STORE_OFFICER",
        departmentId: department.id,
      },
    });

    const adminLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "imp-admin@test.com", password: "test123" });
    expect(adminLogin.status).toBe(200);
    systemAdminToken = adminLogin.body.token;

    const centralLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "imp-central@test.com", password: "test123" });
    expect(centralLogin.status).toBe(200);
    centralStoreToken = centralLogin.body.token;
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  function importCsv(csv: string, token = systemAdminToken) {
    return request(app)
      .post("/api/routine-slots/import")
      .set("Authorization", `Bearer ${token}`)
      .send({ csv });
  }

  describe("Access control", () => {
    it("should reject unauthenticated import requests", async () => {
      const res = await request(app)
        .post("/api/routine-slots/import")
        .send({ csv: `${HEADER}\n${line("A", 1, "08:00", "10:00")}` });

      expect(res.status).toBe(401);
    });

    it("should deny import for CENTRAL_STORE_OFFICER", async () => {
      const res = await importCsv(
        `${HEADER}\n${line("A", 1, "08:00", "10:00")}`,
        centralStoreToken,
      );

      expect(res.status).toBe(403);
    });
  });

  describe("File level failures", () => {
    it("should reject an empty CSV", async () => {
      const res = await importCsv("   ");
      expect(res.status).toBe(400);
    });

    it("should reject a CSV with a header but no data rows", async () => {
      const res = await importCsv(HEADER);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("no data rows");
    });

    it("should reject a CSV with the wrong header", async () => {
      const res = await importCsv(`course,section,day\nTEST,A,1`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("header must be exactly");
    });
  });

  describe("Row level failures", () => {
    beforeEach(clearSlots);

    it("should fail a row with an unknown course", async () => {
      const res = await importCsv(
        `${HEADER}\nNO-SUCH-COURSE,A,${SEMESTER},1,08:00,10:00,${ROOM},${FROM},${TO}`,
      );

      expect(res.status).toBe(200);
      expect(res.body.data.failed).toBe(1);
      expect(res.body.data.rows[0].message).toContain("not found");
    });

    it("should fail a row with an unknown section", async () => {
      const res = await importCsv(
        `${HEADER}\n${line("Z", 1, "08:00", "10:00")}`,
      );

      expect(res.body.data.failed).toBe(1);
      expect(res.body.data.rows[0].message).toContain("Section");
    });

    it("should fail a row with an unknown room", async () => {
      const res = await importCsv(
        `${HEADER}\n${line("A", 1, "08:00", "10:00", "NO-SUCH-ROOM")}`,
      );

      expect(res.body.data.failed).toBe(1);
      expect(res.body.data.rows[0].message).toContain(
        "not found in the department",
      );
    });

    it("should fail a row whose room belongs to another department", async () => {
      const res = await importCsv(
        `${HEADER}\n${line("A", 1, "08:00", "10:00", OTHER_ROOM)}`,
      );

      expect(res.body.data.failed).toBe(1);
      expect(res.body.data.rows[0].message).toContain(
        "not found in the department",
      );
    });

    it("should fail a row with the wrong number of columns", async () => {
      const res = await importCsv(
        `${HEADER}\n${testCourseCode},A,${SEMESTER},1`,
      );

      expect(res.body.data.failed).toBe(1);
      expect(res.body.data.rows[0].message).toContain("Expected 9 columns");
    });

    it("should fail a row with an out of range day of week", async () => {
      const res = await importCsv(
        `${HEADER}\n${line("A", 7, "08:00", "10:00")}`,
      );

      expect(res.body.data.failed).toBe(1);
      expect(res.body.data.rows[0].message).toContain("Day of week");
    });

    it("should fail a row with a non padded time", async () => {
      const res = await importCsv(
        `${HEADER}\n${line("A", 1, "8:00", "10:00")}`,
      );

      expect(res.body.data.failed).toBe(1);
      expect(res.body.data.rows[0].message).toContain("HH:MM");
    });

    it("should fail a row whose start time is not before its end time", async () => {
      const res = await importCsv(
        `${HEADER}\n${line("A", 1, "14:00", "10:00")}`,
      );

      expect(res.body.data.failed).toBe(1);
      expect(res.body.data.rows[0].message).toContain("before end time");
    });

    it("should fail a row with a malformed date", async () => {
      const res = await importCsv(
        `${HEADER}\n${line("A", 1, "08:00", "10:00", ROOM, "15-01-2027", TO)}`,
      );

      expect(res.body.data.failed).toBe(1);
      expect(res.body.data.rows[0].message).toContain("YYYY-MM-DD");
    });
  });

  describe("Conflicts", () => {
    beforeEach(clearSlots);

    it("should fail a row that double books a lab against an existing slot", async () => {
      const first = await importCsv(
        `${HEADER}\n${line("A", 1, "08:00", "11:00")}`,
      );
      expect(first.body.data.created).toBe(1);

      const second = await importCsv(
        `${HEADER}\n${line("B", 1, "09:00", "12:00")}`,
      );

      expect(second.body.data.failed).toBe(1);
      expect(second.body.data.rows[0].message).toContain("already booked");
    });

    it("should fail the second of two rows booking the same lab in one file", async () => {
      const res = await importCsv(
        [
          HEADER,
          line("A", 2, "08:00", "11:00"),
          line("B", 2, "09:00", "12:00"),
        ].join("\n"),
      );

      expect(res.body.data.created).toBe(1);
      expect(res.body.data.failed).toBe(1);
      expect(res.body.data.rows[1].message).toContain("already booked");
    });

    it("should skip the second of two identical rows in one file", async () => {
      const res = await importCsv(
        [
          HEADER,
          line("A", 3, "08:00", "10:00"),
          line("A", 3, "08:00", "10:00"),
        ].join("\n"),
      );

      expect(res.body.data.created).toBe(1);
      expect(res.body.data.skipped).toBe(1);
      expect(res.body.data.rows[1].status).toBe("skipped");
    });

    it("should allow a back to back slot in the same lab", async () => {
      const res = await importCsv(
        [
          HEADER,
          line("A", 4, "08:00", "11:00"),
          line("B", 4, "11:00", "13:00"),
        ].join("\n"),
      );

      expect(res.body.data.created).toBe(2);
      expect(res.body.data.failed).toBe(0);
    });
  });

  describe("Re-importing", () => {
    beforeEach(clearSlots);

    it("should skip rows that already exist unchanged", async () => {
      const csv = `${HEADER}\n${line("A", 1, "08:00", "10:00")}`;

      const first = await importCsv(csv);
      expect(first.body.data.created).toBe(1);

      const second = await importCsv(csv);
      expect(second.body.data.created).toBe(0);
      expect(second.body.data.skipped).toBe(1);
    });

    it("should fail rather than silently discard a changed end time", async () => {
      const first = await importCsv(
        `${HEADER}\n${line("A", 1, "08:00", "10:00")}`,
      );
      expect(first.body.data.created).toBe(1);

      const second = await importCsv(
        `${HEADER}\n${line("A", 1, "08:00", "11:00")}`,
      );

      expect(second.body.data.skipped).toBe(0);
      expect(second.body.data.failed).toBe(1);
      expect(second.body.data.rows[0].message).toContain("different values");
    });

    it("should fail rather than silently discard changed effective dates", async () => {
      const first = await importCsv(
        `${HEADER}\n${line("A", 1, "08:00", "10:00")}`,
      );
      expect(first.body.data.created).toBe(1);

      const second = await importCsv(
        `${HEADER}\n${line("A", 1, "08:00", "10:00", ROOM, FROM, isoDate(90))}`,
      );

      expect(second.body.data.failed).toBe(1);
      expect(second.body.data.rows[0].message).toContain("different values");
    });
  });

  describe("Encoding", () => {
    beforeEach(clearSlots);

    it("should parse a CSV that begins with a byte order mark", async () => {
      const res = await importCsv(
        `\uFEFF${HEADER}\n${line("A", 1, "08:00", "10:00")}`,
      );

      expect(res.status).toBe(200);
      expect(res.body.data.created).toBe(1);
    });

    it("should parse a CSV with Windows line endings", async () => {
      const res = await importCsv(
        `${HEADER}\r\n${line("A", 2, "08:00", "10:00")}\r\n`,
      );

      expect(res.status).toBe(200);
      expect(res.body.data.created).toBe(1);
    });
  });

  describe("Effective window warnings", () => {
    beforeEach(clearSlots);

    it("should warn when a slot's effective period has already ended", async () => {
      const res = await importCsv(
        `${HEADER}\n${line("A", 1, "08:00", "10:00", ROOM, PAST_FROM, PAST_TO)}`,
      );

      expect(res.body.data.created).toBe(1);
      expect(res.body.data.warnings).toBe(1);
      expect(res.body.data.rows[0].warning).toContain(
        "no class sessions will be generated",
      );
    });

    it("should not warn for a live effective period", async () => {
      const res = await importCsv(
        `${HEADER}\n${line("A", 2, "08:00", "10:00")}`,
      );

      expect(res.body.data.created).toBe(1);
      expect(res.body.data.warnings).toBe(0);
      expect(res.body.data.rows[0].warning).toBeUndefined();
    });
  });

  describe("Mixed results", () => {
    beforeEach(clearSlots);

    it("should report each row independently with its line number", async () => {
      const csv = [
        HEADER,
        line("A", 1, "08:00", "10:00"), // line 2 — created
        line("A", 1, "08:00", "10:00"), // line 3 — skipped, identical
        line("A", 2, "08:00", "10:00", "NO-SUCH-ROOM"), // line 4 — failed
      ].join("\n");

      const res = await importCsv(csv);

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(3);
      expect(res.body.data.created).toBe(1);
      expect(res.body.data.skipped).toBe(1);
      expect(res.body.data.failed).toBe(1);

      expect(res.body.data.rows[0]).toMatchObject({
        line: 2,
        status: "created",
      });
      expect(res.body.data.rows[1]).toMatchObject({
        line: 3,
        status: "skipped",
      });
      expect(res.body.data.rows[2]).toMatchObject({
        line: 4,
        status: "failed",
      });
    });

    it("should skip blank lines without disturbing line numbers", async () => {
      const csv = [
        HEADER,
        "",
        line("A", 3, "08:00", "10:00"), // line 3 in the file
      ].join("\n");

      const res = await importCsv(csv);

      expect(res.body.data.total).toBe(1);
      expect(res.body.data.rows[0].line).toBe(3);
    });
  });
});
