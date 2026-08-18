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
  unitCost: string | number | null;
  unit: string;
  description?: string | null;
  isReturnable: boolean;
  isActive: boolean;

  stock?: {
    onHand: number;
    spareQty: number;
    reorderPoint: number;
  } | null;
}

export interface CreateComponentRequest {
  code: string;
  name: string;
  category: string;
  sizeClass: "EXPENSIVE" | "SMALL";
  unit: string;
  unitCost?: number | null;
  description?: string | null;
  isReturnable: boolean;
}

export type UpdateComponentRequest = Partial<CreateComponentRequest>;

export interface ComponentListResponse {
  data: Component[];
  total: number;
  page: number;
  limit: number;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  isOffice: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDepartmentRequest {
  code: string;
  name: string;
  isOffice: boolean;
}

export type UpdateDepartmentRequest = Partial<CreateDepartmentRequest>;

export interface DepartmentListResponse {
  data: Department[];
  total: number;
  page: number;
  limit: number;
}
