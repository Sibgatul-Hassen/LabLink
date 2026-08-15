export type Role =
  | "STUDENT"
  | "INSTRUCTOR"
  | "LAB_ASSISTANT"
  | "DEPT_STORE_HEAD"
  | "CENTRAL_STORE_OFFICER"
  | "OFFICE_ADMIN"
  | "SYSTEM_ADMIN";

export interface User {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  departmentId: string | null;
  departmentCode?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface Component {
  id: string;
  code: string;
  name: string;
  category: string;
  sizeClass: "EXPENSIVE" | "SMALL";
  unitCost: string | number;
  unit: string;
  isReturnable: boolean;
  isActive: boolean;
}

export interface ComponentListResponse {
  data: Component[];
  total: number;
  page: number;
  limit: number;
}
