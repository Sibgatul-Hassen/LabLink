import { prisma } from "../lib/prisma";
import { RoutineSlotService } from "./routine-slot.service";

const EXPECTED_HEADERS = [
  "courseCode",
  "sectionName",
  "semester",
  "dayOfWeek",
  "startTime",
  "endTime",
  "roomNo",
  "effectiveFrom",
  "effectiveTo",
] as const;

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type ImportRowStatus = "created" | "skipped" | "failed";

export interface ImportRowResult {
  line: number;
  status: ImportRowStatus;
  courseCode?: string;
  sectionName?: string;
  roomNo?: string;
  message?: string;
  warning?: string;
}

export interface ImportRoutineSlotsResult {
  total: number;
  created: number;
  skipped: number;
  failed: number;
  warnings: number;
  rows: ImportRowResult[];
}

interface ParsedRow {
  line: number;
  courseCode: string;
  sectionName: string;
  semester: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  roomNo: string;
  effectiveFrom: Date;
  effectiveTo: Date;
}

/** Thrown for problems with the file itself, which fail the whole request. */
export class CsvFormatError extends Error {}

function utcDateOnly(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function sameDate(a: Date, b: Date): boolean {
  return utcDateOnly(a).getTime() === utcDateOnly(b).getTime();
}

function parseIsoDate(value: string): Date | null {
  if (!DATE_PATTERN.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Splits the file into trimmed cells, keeping the original line numbers so a
 * failure can point at the right row in the user's spreadsheet.
 *
 * Excel's "CSV UTF-8" export prefixes the file with a byte-order mark, which
 * would otherwise turn the first header into "\uFEFFcourseCode" and produce a
 * baffling error. `trim()` already removes U+FEFF, but stripping it up front
 * makes the intent explicit rather than incidental.
 *
 * Quoted fields and embedded commas are not supported. A row with the wrong
 * number of cells fails as a row rather than being silently mis-parsed.
 */
function splitLines(csv: string): { line: number; cells: string[] }[] {
  const withoutBom = csv.replace(/^\uFEFF/, "");

  return withoutBom
    .split(/\r?\n/)
    .map((raw, index) => ({
      line: index + 1,
      cells: raw.split(",").map((cell) => cell.trim()),
    }))
    .filter((entry) => entry.cells.some((cell) => cell.length > 0));
}

function validateHeader(cells: string[]): void {
  const actual = cells.map((cell) => cell.toLowerCase());
  const expected = EXPECTED_HEADERS.map((header) => header.toLowerCase());

  const matches =
    actual.length === expected.length &&
    expected.every((header, index) => actual[index] === header);

  if (!matches) {
    throw new CsvFormatError(
      `CSV header must be exactly: ${EXPECTED_HEADERS.join(",")}`,
    );
  }
}

function parseRow(line: number, cells: string[]): ParsedRow | ImportRowResult {
  function fail(message: string): ImportRowResult {
    return {
      line,
      status: "failed",
      courseCode: cells[0],
      sectionName: cells[1],
      roomNo: cells[6],
      message,
    };
  }

  if (cells.length !== EXPECTED_HEADERS.length) {
    return fail(
      `Expected ${EXPECTED_HEADERS.length} columns but found ${cells.length}. Values containing commas are not supported.`,
    );
  }

  const [
    courseCode,
    sectionName,
    semester,
    dayOfWeekRaw,
    startTime,
    endTime,
    roomNo,
    effectiveFromRaw,
    effectiveToRaw,
  ] = cells;

  if (!courseCode || !sectionName || !semester || !roomNo) {
    return fail(
      "Course code, section name, semester and room number are required.",
    );
  }

  const dayOfWeek = Number(dayOfWeekRaw);

  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return fail(
      "Day of week must be a whole number from 0 (Sunday) to 6 (Saturday).",
    );
  }

  if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) {
    return fail("Times must be in 24-hour HH:MM format, for example 08:30.");
  }

  if (startTime >= endTime) {
    return fail("Start time must be before end time.");
  }

  const effectiveFrom = parseIsoDate(effectiveFromRaw);
  const effectiveTo = parseIsoDate(effectiveToRaw);

  if (!effectiveFrom || !effectiveTo) {
    return fail("Effective dates must be in YYYY-MM-DD format.");
  }

  if (effectiveFrom > effectiveTo) {
    return fail(
      "Effective from date must be on or before the effective to date.",
    );
  }

  return {
    line,
    courseCode,
    sectionName,
    semester,
    dayOfWeek,
    startTime,
    endTime,
    roomNo,
    effectiveFrom,
    effectiveTo,
  };
}

export class RoutineImportService {
  static async importRoutineSlots(
    csv: string,
    departmentId?: string | null,
  ): Promise<ImportRoutineSlotsResult> {
    const entries = splitLines(csv);

    if (entries.length === 0) {
      throw new CsvFormatError("The CSV is empty.");
    }

    validateHeader(entries[0].cells);

    const dataRows = entries.slice(1);

    if (dataRows.length === 0) {
      throw new CsvFormatError("The CSV has a header row but no data rows.");
    }

    if (departmentId !== undefined) {
      const codes = dataRows.map((entry) => parseRow(entry.line, entry.cells))
        .filter((row): row is ParsedRow => !("status" in row))
        .map((row) => row.courseCode);
      const courses = await prisma.course.findMany({
        where: { code: { in: codes } }, select: { departmentId: true },
      });
      if (!departmentId || courses.some((course) => course.departmentId !== departmentId)) {
        throw new Error("Forbidden");
      }
    }

    const today = utcDateOnly(new Date());
    const rows: ImportRowResult[] = [];

    // Sequential on purpose: a later row must see slots created by an earlier
    // one, so two rows booking the same room in a single file collide.
    for (const entry of dataRows) {
      const parsed = parseRow(entry.line, entry.cells);

      if ("status" in parsed) {
        rows.push(parsed);
        continue;
      }

      rows.push(await this.importRow(parsed, today));
    }

    return {
      total: rows.length,
      created: rows.filter((row) => row.status === "created").length,
      skipped: rows.filter((row) => row.status === "skipped").length,
      failed: rows.filter((row) => row.status === "failed").length,
      warnings: rows.filter((row) => row.warning).length,
      rows,
    };
  }

  private static async importRow(
    row: ParsedRow,
    today: Date,
  ): Promise<ImportRowResult> {
    const identity = {
      line: row.line,
      courseCode: row.courseCode,
      sectionName: row.sectionName,
      roomNo: row.roomNo,
    };

    const course = await prisma.course.findUnique({
      where: { code: row.courseCode },
    });

    if (!course || !course.isActive) {
      return {
        ...identity,
        status: "failed",
        message: `Course "${row.courseCode}" not found.`,
      };
    }

    const section = await prisma.section.findFirst({
      where: {
        courseId: course.id,
        name: row.sectionName,
        semester: row.semester,
      },
    });

    if (!section) {
      return {
        ...identity,
        status: "failed",
        message: `Section "${row.sectionName}" for ${row.courseCode} in ${row.semester} not found.`,
      };
    }

    // roomNo is only unique per department, so it is resolved inside the
    // department that owns the course. This stops a CSE course being scheduled
    // into another department's identically numbered room.
    const lab = await prisma.lab.findFirst({
      where: {
        roomNo: row.roomNo,
        departmentId: course.departmentId,
        isActive: true,
      },
    });

    if (!lab) {
      return {
        ...identity,
        status: "failed",
        message: `Room "${row.roomNo}" not found in the department that owns ${row.courseCode}.`,
      };
    }

    const existing = await prisma.routineSlot.findFirst({
      where: {
        sectionId: section.id,
        labId: lab.id,
        dayOfWeek: row.dayOfWeek,
        startTime: row.startTime,
      },
    });

    if (existing) {
      // Only an exact match on every column counts as "already imported".
      // Matching the key but differing elsewhere means the CSV carries an edit
      // that this importer will not apply silently.
      const identical =
        existing.endTime === row.endTime &&
        sameDate(existing.effectiveFrom, row.effectiveFrom) &&
        sameDate(existing.effectiveTo, row.effectiveTo);

      if (identical) {
        return {
          ...identity,
          status: "skipped",
          message: "This routine slot already exists.",
        };
      }

      return {
        ...identity,
        status: "failed",
        message:
          "A slot already exists for this section, lab, day and start time with different values. Delete it first or correct the CSV.",
      };
    }

    try {
      // Reuses the same path as the manual form, so imported slots obey
      // identical conflict rules and the error wording stays consistent.
      await RoutineSlotService.createRoutineSlot({
        sectionId: section.id,
        labId: lab.id,
        dayOfWeek: row.dayOfWeek,
        startTime: row.startTime,
        endTime: row.endTime,
        effectiveFrom: row.effectiveFrom,
        effectiveTo: row.effectiveTo,
      });
    } catch (error) {
      return {
        ...identity,
        status: "failed",
        message:
          error instanceof Error
            ? error.message
            : "Could not create this routine slot.",
      };
    }

    const result: ImportRowResult = { ...identity, status: "created" };

    // A slot whose window has closed imports fine but is invisible to
    // generateSessions(), which filters on effectiveTo >= today. Without this
    // the row would report success and quietly produce nothing.
    if (utcDateOnly(row.effectiveTo) < today) {
      result.warning =
        "This slot's effective period has already ended — no class sessions will be generated from it.";
    }

    return result;
  }
}
