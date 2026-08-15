import { Role } from "@prisma/client";
import { Request } from "express";

export interface UserDTO {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  departmentId: string | null;
  departmentCode?: string;
}

export interface LoginResponseDTO {
  token: string;
  user: UserDTO;
}

export interface JWTPayload {
  sub: string;
  role: Role;
  departmentId: string | null;
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: Role;
    departmentId: string | null;
  };
  scope?: Record<string, unknown>;
}
