import { Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma";
import { AcademicActor, sectionReadScope } from "./academic-read-scope";
import {
  CreateSectionRequest,
  ListSectionsQuery,
  UpdateSectionRequest,
} from "../schemas/section.schema";

export type SectionWithRelations = Prisma.SectionGetPayload<{
  include: {
    course: {
      select: {
        id: true;
        code: true;
        title: true;
        departmentId: true;
      };
    };
    instructor: {
      select: {
        id: true;
        fullName: true;
        email: true;
        role: true;
      };
    };
    labAssistant: {
      select: {
        id: true;
        fullName: true;
        email: true;
        role: true;
      };
    };
  };
}>;

export interface PaginatedSectionsResponse {
  data: SectionWithRelations[];
  total: number;
  page: number;
  limit: number;
}

export type SectionAssignee = Prisma.UserGetPayload<{
  select: {
    id: true;
    fullName: true;
    email: true;
    role: true;
  };
}>;

export class SectionService {
  static async listAssignees(
    role: "INSTRUCTOR" | "LAB_ASSISTANT",
    departmentId?: string | null,
  ): Promise<SectionAssignee[]> {
    return prisma.user.findMany({
      where: {
        role,
        isActive: true,
        ...(departmentId !== undefined ? { departmentId: departmentId ?? "__none__" } : {}),
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
      },
      orderBy: {
        fullName: "asc",
      },
    });
  }

  private static async ensureActiveCourse(courseId: string): Promise<void> {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course || !course.isActive) {
      throw new Error("Course not found");
    }
  }

  private static async ensureValidInstructor(
    instructorId: string,
  ): Promise<void> {
    const instructor = await prisma.user.findUnique({
      where: { id: instructorId },
    });

    if (!instructor || !instructor.isActive) {
      throw new Error("Instructor not found");
    }

    if (instructor.role !== "INSTRUCTOR") {
      throw new Error("User must have INSTRUCTOR role");
    }
  }

  private static async ensureValidLabAssistant(
    labAssistantId: string,
  ): Promise<void> {
    const labAssistant = await prisma.user.findUnique({
      where: { id: labAssistantId },
    });

    if (!labAssistant || !labAssistant.isActive) {
      throw new Error("Lab assistant not found");
    }

    if (labAssistant.role !== "LAB_ASSISTANT") {
      throw new Error("User must have LAB_ASSISTANT role");
    }
  }

  private static async ensureUniqueSection(
    courseId: string,
    name: string,
    semester: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await prisma.section.findFirst({
      where: {
        courseId,
        name,
        semester,
        ...(excludeId
          ? {
              id: {
                not: excludeId,
              },
            }
          : {}),
      },
    });

    if (existing) {
      throw new Error(
        "Section with this course, name, and semester already exists",
      );
    }
  }

  static async createSection(
    data: CreateSectionRequest,
  ): Promise<SectionWithRelations> {
    await this.ensureActiveCourse(data.courseId);

    if (data.instructorId) {
      await this.ensureValidInstructor(data.instructorId);
    }

    if (data.labAssistantId) {
      await this.ensureValidLabAssistant(data.labAssistantId);
    }

    await this.ensureUniqueSection(
      data.courseId,
      data.name,
      data.semester,
    );

    return prisma.section.create({
      data: {
        courseId: data.courseId,
        name: data.name,
        semester: data.semester,
        studentCount: data.studentCount,
        instructorId: data.instructorId ?? null,
        labAssistantId: data.labAssistantId ?? null,
      },
      include: {
        course: {
          select: {
            id: true,
            code: true,
            title: true,
            departmentId: true,
          },
        },
        instructor: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          },
        },
        labAssistant: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }

  static async listSections(
    query: ListSectionsQuery,
    actor?: AcademicActor,
  ): Promise<PaginatedSectionsResponse> {
    const {
      search,
      courseId,
      semester,
      instructorId,
      labAssistantId,
    } = query;

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const where: Prisma.SectionWhereInput = actor ? { AND: [sectionReadScope(actor)] } : {};

    if (search) {
      where.OR = [
        {
          name: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          semester: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          course: {
            code: {
              contains: search,
              mode: "insensitive",
            },
          },
        },
        {
          course: {
            title: {
              contains: search,
              mode: "insensitive",
            },
          },
        },
      ];
    }

    if (courseId) {
      where.courseId = courseId;
    }

    if (semester) {
      where.semester = {
        contains: semester,
        mode: "insensitive",
      };
    }

    if (instructorId) {
      where.instructorId = instructorId;
    }

    if (labAssistantId) {
      where.labAssistantId = labAssistantId;
    }

    const [sections, total] = await Promise.all([
      prisma.section.findMany({
        where,
        include: {
          course: {
            select: {
              id: true,
              code: true,
              title: true,
              departmentId: true,
            },
          },
          instructor: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
            },
          },
          labAssistant: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
            },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [
          {
            semester: "desc",
          },
          {
            course: {
              code: "asc",
            },
          },
          {
            name: "asc",
          },
        ],
      }),
      prisma.section.count({ where }),
    ]);

    return {
      data: sections,
      total,
      page,
      limit,
    };
  }

  static async getSectionById(id: string, actor?: AcademicActor): Promise<SectionWithRelations> {
    const section = await prisma.section.findUnique({
      where: { id },
      include: {
        course: {
          select: {
            id: true,
            code: true,
            title: true,
            departmentId: true,
          },
        },
        instructor: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          },
        },
        labAssistant: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (!section) {
      throw new Error("Section not found");
    }

    if (actor && !(await prisma.section.count({ where: { id, AND: [sectionReadScope(actor)] } }))) throw new Error("Forbidden");
    return section;
  }

  static async updateSection(
    id: string,
    data: UpdateSectionRequest,
  ): Promise<SectionWithRelations> {
    const section = await prisma.section.findUnique({
      where: { id },
    });

    if (!section) {
      throw new Error("Section not found");
    }

    if (data.courseId) {
      await this.ensureActiveCourse(data.courseId);
    }

    if (data.instructorId) {
      await this.ensureValidInstructor(data.instructorId);
    }

    if (data.labAssistantId) {
      await this.ensureValidLabAssistant(data.labAssistantId);
    }

    const nextCourseId = data.courseId ?? section.courseId;
    const nextName = data.name ?? section.name;
    const nextSemester = data.semester ?? section.semester;

    await this.ensureUniqueSection(
      nextCourseId,
      nextName,
      nextSemester,
      id,
    );

    return prisma.section.update({
      where: { id },
      data: {
        courseId: data.courseId,
        name: data.name,
        semester: data.semester,
        studentCount: data.studentCount,
        instructorId: data.instructorId,
        labAssistantId: data.labAssistantId,
      },
      include: {
        course: {
          select: {
            id: true,
            code: true,
            title: true,
            departmentId: true,
          },
        },
        instructor: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          },
        },
        labAssistant: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }

  static async deleteSection(id: string): Promise<void> {
    const section = await prisma.section.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            routineSlots: true,
          },
        },
      },
    });

    if (!section) {
      throw new Error("Section not found");
    }

    if (section._count.routineSlots > 0) {
      throw new Error("Section has routine slots and cannot be deleted");
    }

    await prisma.section.delete({
      where: { id },
    });
  }
}
