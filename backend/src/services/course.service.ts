import { Course, Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma";
import { AcademicActor, courseReadScope } from "./academic-read-scope";
import {
  CreateCourseRequest,
  ListCoursesQuery,
  UpdateCourseRequest,
} from "../schemas/course.schema";

export type CourseWithDepartment = Prisma.CourseGetPayload<{
  include: {
    department: {
      select: {
        id: true;
        code: true;
        name: true;
      };
    };
  };
}>;

export interface PaginatedCoursesResponse {
  data: CourseWithDepartment[];
  total: number;
  page: number;
  limit: number;
}

export class CourseService {
  private static async ensureActiveDepartment(
    departmentId: string,
  ): Promise<void> {
    const department = await prisma.department.findUnique({
      where: { id: departmentId },
    });

    if (!department || !department.isActive) {
      throw new Error("Department not found");
    }
  }

  static async createCourse(
    data: CreateCourseRequest,
  ): Promise<CourseWithDepartment> {
    await this.ensureActiveDepartment(data.departmentId);

    const existing = await prisma.course.findUnique({
      where: { code: data.code },
    });

    if (existing && existing.isActive) {
      throw new Error("Course with this code already exists");
    }

    if (existing && !existing.isActive) {
      throw new Error("Course code already exists (soft-deleted)");
    }

    return prisma.course.create({
      data: {
        code: data.code,
        title: data.title,
        departmentId: data.departmentId,
        isActive: true,
      },
      include: {
        department: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });
  }

  static async listCourses(
    query: ListCoursesQuery,
    actor?: AcademicActor,
  ): Promise<PaginatedCoursesResponse> {
    const { search, departmentId } = query;
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const where: Prisma.CourseWhereInput = {
      isActive: true,
      ...(actor ? { AND: [courseReadScope(actor)] } : {}),
    };

    if (search) {
      where.OR = [
        {
          code: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          title: {
            contains: search,
            mode: "insensitive",
          },
        },
      ];
    }

    if (departmentId) {
      where.departmentId = departmentId;
    }

    const [courses, total] = await Promise.all([
      prisma.course.findMany({
        where,
        include: {
          department: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: {
          code: "asc",
        },
      }),
      prisma.course.count({
        where,
      }),
    ]);

    return {
      data: courses,
      total,
      page,
      limit,
    };
  }

  static async getCourseById(id: string, actor?: AcademicActor): Promise<CourseWithDepartment> {
    const course = await prisma.course.findUnique({
      where: { id },
      include: {
        department: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });

    if (!course || !course.isActive) {
      throw new Error("Course not found");
    }

    if (actor && !(await prisma.course.count({ where: { id, ...courseReadScope(actor) } }))) throw new Error("Forbidden");
    return course;
  }

  static async updateCourse(
    id: string,
    data: UpdateCourseRequest,
  ): Promise<CourseWithDepartment> {
    const course: Course | null = await prisma.course.findUnique({
      where: { id },
    });

    if (!course || !course.isActive) {
      throw new Error("Course not found");
    }

    if (data.departmentId) {
      await this.ensureActiveDepartment(data.departmentId);
    }

    if (data.code && data.code !== course.code) {
      const existing = await prisma.course.findUnique({
        where: {
          code: data.code,
        },
      });

      if (existing && existing.id !== id) {
        if (existing.isActive) {
          throw new Error("Course with this code already exists");
        }

        throw new Error("Course code already exists (soft-deleted)");
      }
    }

    return prisma.course.update({
      where: { id },
      data: {
        code: data.code,
        title: data.title,
        departmentId: data.departmentId,
      },
      include: {
        department: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });
  }

  static async deleteCourse(id: string): Promise<void> {
    const course = await prisma.course.findUnique({
      where: { id },
    });

    if (!course || !course.isActive) {
      throw new Error("Course not found");
    }

    await prisma.course.update({
      where: { id },
      data: {
        isActive: false,
      },
    });
  }
}
