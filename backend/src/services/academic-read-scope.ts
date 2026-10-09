import { Prisma, Role } from "@prisma/client";

export type AcademicActor = { id: string; role: Role; departmentId: string | null };

export function courseReadScope(actor: AcademicActor): Prisma.CourseWhereInput {
  switch (actor.role) {
    case "INSTRUCTOR": return { sections: { some: { instructorId: actor.id } } };
    case "LAB_ASSISTANT": return { sections: { some: { OR: [
      { labAssistantId: actor.id }, { routineSlots: { some: { lab: { labAssistantId: actor.id } } } },
    ] } } };
    case "DEPT_STORE_HEAD": return { departmentId: actor.departmentId ?? "__none__" };
    case "CENTRAL_STORE_OFFICER":
    case "OFFICE_ADMIN":
    case "SYSTEM_ADMIN": return {};
    default: return { id: "__none__" };
  }
}

export function sectionReadScope(actor: AcademicActor): Prisma.SectionWhereInput {
  switch (actor.role) {
    case "INSTRUCTOR": return { instructorId: actor.id };
    case "LAB_ASSISTANT": return { OR: [
      { labAssistantId: actor.id }, { routineSlots: { some: { lab: { labAssistantId: actor.id } } } },
    ] };
    case "DEPT_STORE_HEAD": return { course: { departmentId: actor.departmentId ?? "__none__" } };
    case "CENTRAL_STORE_OFFICER":
    case "OFFICE_ADMIN":
    case "SYSTEM_ADMIN": return {};
    default: return { id: "__none__" };
  }
}

export function labReadScope(actor: AcademicActor): Prisma.LabWhereInput {
  switch (actor.role) {
    case "LAB_ASSISTANT": return { labAssistantId: actor.id };
    case "DEPT_STORE_HEAD": return { departmentId: actor.departmentId ?? "__none__" };
    case "CENTRAL_STORE_OFFICER":
    case "OFFICE_ADMIN":
    case "SYSTEM_ADMIN": return {};
    default: return { id: "__none__" };
  }
}

export function routineReadScope(actor: AcademicActor): Prisma.RoutineSlotWhereInput {
  switch (actor.role) {
    case "INSTRUCTOR": return { section: { instructorId: actor.id } };
    case "LAB_ASSISTANT": return { OR: [
      { section: { labAssistantId: actor.id } }, { lab: { labAssistantId: actor.id } },
    ] };
    case "DEPT_STORE_HEAD": return { section: { course: { departmentId: actor.departmentId ?? "__none__" } } };
    case "CENTRAL_STORE_OFFICER":
    case "OFFICE_ADMIN":
    case "SYSTEM_ADMIN": return {};
    default: return { id: "__none__" };
  }
}

export function experimentReadScope(actor: AcademicActor): Prisma.ExperimentWhereInput {
  return { course: courseReadScope(actor) };
}
