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

export interface CourseDepartment {
  id: string;
  code: string;
  name: string;
}

export interface Course {
  id: string;
  code: string;
  title: string;
  departmentId: string;
  isActive: boolean;
  department: CourseDepartment;
}

export interface CreateCourseRequest {
  code: string;
  title: string;
  departmentId: string;
}

export type UpdateCourseRequest = Partial<CreateCourseRequest>;

export interface CourseListResponse {
  data: Course[];
  total: number;
  page: number;
  limit: number;
}

export interface SectionCourse {
  id: string;
  code: string;
  title: string;
  departmentId: string;
}

export interface SectionUser {
  id: string;
  fullName: string;
  email: string;
  role: Role;
}

export interface Section {
  id: string;
  courseId: string;
  name: string;
  semester: string;
  studentCount: number;
  instructorId: string | null;
  labAssistantId: string | null;
  course: SectionCourse;
  instructor: SectionUser | null;
  labAssistant: SectionUser | null;
}

export interface CreateSectionRequest {
  courseId: string;
  name: string;
  semester: string;
  studentCount: number;
  instructorId?: string | null;
  labAssistantId?: string | null;
}

export type UpdateSectionRequest = Partial<CreateSectionRequest>;

export interface SectionListResponse {
  data: Section[];
  total: number;
  page: number;
  limit: number;
}

export interface Lab {
  id: string;
  name: string;
  roomNo: string;
  groupSize: number;
  departmentId: string;
  labAssistantId: string | null;
  isActive: boolean;
  department: CourseDepartment;
  labAssistant: SectionUser | null;
}

export interface CreateLabRequest {
  name: string;
  roomNo: string;
  groupSize: number;
  departmentId: string;
  labAssistantId?: string | null;
}

export type UpdateLabRequest = Partial<CreateLabRequest>;

export interface LabListResponse {
  data: Lab[];
  total: number;
  page: number;
  limit: number;
}

export interface RoutineSlotCourse {
  id: string;
  code: string;
  title: string;
}

export interface RoutineSlotSection {
  id: string;
  name: string;
  semester: string;
  course: RoutineSlotCourse;
}

export interface RoutineSlotLab {
  id: string;
  name: string;
  roomNo: string;
  department: CourseDepartment;
}

export interface RoutineSlot {
  id: string;
  sectionId: string;
  labId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  effectiveFrom: string;
  effectiveTo: string;
  section: RoutineSlotSection;
  lab: RoutineSlotLab;
}

export interface CreateRoutineSlotRequest {
  sectionId: string;
  labId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  effectiveFrom: string;
  effectiveTo: string;
}

export type UpdateRoutineSlotRequest = Partial<CreateRoutineSlotRequest>;

export interface RoutineSlotListResponse {
  data: RoutineSlot[];
  total: number;
  page: number;
  limit: number;
}
