import { Prisma, Role } from "@prisma/client";
import bcryptjs from "bcryptjs";

import { prisma } from "../lib/prisma";
import {
  CreateUserRequest,
  ListUsersQuery,
  SCOPED_ROLES,
  UpdateUserRequest,
} from "../schemas/user.schema";

const BCRYPT_COST = 10;

const userSelect = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  departmentId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  department: {
    select: { id: true, code: true, name: true },
  },
} satisfies Prisma.UserSelect;

export type SafeUser = Prisma.UserGetPayload<{ select: typeof userSelect }>;

export interface PaginatedUsersResponse {
  data: SafeUser[];
  total: number;
  page: number;
  limit: number;
}

function isScopedRole(role: Role): boolean {
  return (SCOPED_ROLES as readonly Role[]).includes(role);
}

export class UserService {
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

  private static ensureDepartmentForRole(
    role: Role,
    departmentId: string | null | undefined,
  ): void {
    if (isScopedRole(role) && !departmentId) {
      throw new Error("Department is required for this role");
    }
  }

  static async createUser(data: CreateUserRequest): Promise<SafeUser> {
    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existing) {
      throw new Error("User with this email already exists");
    }

    this.ensureDepartmentForRole(data.role, data.departmentId);

    if (data.departmentId) {
      await this.ensureActiveDepartment(data.departmentId);
    }

    const passwordHash = await bcryptjs.hash(data.password, BCRYPT_COST);

    return prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        fullName: data.fullName,
        role: data.role,
        departmentId: data.departmentId ?? null,
        isActive: true,
      },
      select: userSelect,
    });
  }

  static async listUsers(
    query: ListUsersQuery,
  ): Promise<PaginatedUsersResponse> {
    const { search, role, departmentId } = query;
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const where: Prisma.UserWhereInput = {};

    if (search) {
      where.OR = [
        { email: { contains: search, mode: "insensitive" } },
        { fullName: { contains: search, mode: "insensitive" } },
      ];
    }

    if (role) {
      where.role = role;
    }

    if (departmentId) {
      where.departmentId = departmentId;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: userSelect,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.count({ where }),
    ]);

    return { data: users, total, page, limit };
  }

  static async getUserById(id: string): Promise<SafeUser> {
    const user = await prisma.user.findUnique({
      where: { id },
      select: userSelect,
    });

    if (!user) {
      throw new Error("User not found");
    }

    return user;
  }

  static async updateUser(
    id: string,
    data: UpdateUserRequest,
    requestingUserId: string,
  ): Promise<SafeUser> {
    const user = await prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new Error("User not found");
    }

    const isSelf = id === requestingUserId;

    if (isSelf && data.isActive === false) {
      throw new Error("SELF_LOCKOUT_DEACTIVATE");
    }

    if (
      isSelf &&
      user.role === "SYSTEM_ADMIN" &&
      data.role &&
      data.role !== "SYSTEM_ADMIN"
    ) {
      throw new Error("SELF_LOCKOUT_ROLE");
    }

    if (data.email && data.email !== user.email) {
      const existing = await prisma.user.findUnique({
        where: { email: data.email },
      });

      if (existing && existing.id !== id) {
        throw new Error("User with this email already exists");
      }
    }

    const nextRole = data.role ?? user.role;
    const nextDepartmentId =
      data.departmentId !== undefined ? data.departmentId : user.departmentId;

    this.ensureDepartmentForRole(nextRole, nextDepartmentId);

    if (data.departmentId) {
      await this.ensureActiveDepartment(data.departmentId);
    }

    return prisma.user.update({
      where: { id },
      data: {
        email: data.email,
        fullName: data.fullName,
        role: data.role,
        departmentId: data.departmentId,
        isActive: data.isActive,
      },
      select: userSelect,
    });
  }

  static async changePassword(id: string, password: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new Error("User not found");
    }

    const passwordHash = await bcryptjs.hash(password, BCRYPT_COST);

    await prisma.user.update({
      where: { id },
      data: { passwordHash },
    });
  }

  static async deleteUser(
    id: string,
    requestingUserId: string,
  ): Promise<void> {
    if (id === requestingUserId) {
      throw new Error("SELF_LOCKOUT_DEACTIVATE");
    }

    const user = await prisma.user.findUnique({ where: { id } });

    if (!user || !user.isActive) {
      throw new Error("User not found");
    }

    await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
