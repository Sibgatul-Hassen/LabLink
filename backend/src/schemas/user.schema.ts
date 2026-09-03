import { z } from "zod";

export const roleEnum = z.enum([
  "STUDENT",
  "INSTRUCTOR",
  "LAB_ASSISTANT",
  "DEPT_STORE_HEAD",
  "CENTRAL_STORE_OFFICER",
  "OFFICE_ADMIN",
  "SYSTEM_ADMIN",
]);

export const SCOPED_ROLES = [
  "STUDENT",
  "INSTRUCTOR",
  "LAB_ASSISTANT",
  "DEPT_STORE_HEAD",
] as const;

const baseUserFields = {
  email: z.string().email("Invalid email").max(255),
  fullName: z.string().min(1, "Full name is required").max(255),
  role: roleEnum,
  departmentId: z.string().min(1).optional().nullable(),
};

export const createUserSchema = z
  .object({
    ...baseUserFields,
    password: z
      .string()
      .min(6, "Password must be at least 6 characters")
      .max(100),
  })
  .refine(
    (data) =>
      !SCOPED_ROLES.includes(data.role as (typeof SCOPED_ROLES)[number]) ||
      !!data.departmentId,
    {
      message: "Department is required for this role",
      path: ["departmentId"],
    },
  );

export const updateUserSchema = z
  .object({
    ...baseUserFields,
    isActive: z.boolean().optional(),
  })
  .partial();

export const changePasswordSchema = z.object({
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(100),
});

export const listUsersQuerySchema = z.object({
  search: z.string().optional(),
  role: roleEnum.optional(),
  departmentId: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateUserRequest = z.infer<typeof createUserSchema>;
export type UpdateUserRequest = z.infer<typeof updateUserSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
