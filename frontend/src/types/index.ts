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

export interface ExperimentCourse {
  id: string;
  code: string;
  title: string;
}

export interface ExperimentItemComponent {
  id: string;
  code: string;
  name: string;
  unit: string;
  sizeClass: "EXPENSIVE" | "SMALL";
}

export interface ExperimentItem {
  id: string;
  experimentId: string;
  componentId: string;
  qtyPerGroup: number;
  component: ExperimentItemComponent;
}

export interface Experiment {
  id: string;
  courseId: string;
  number: number;
  title: string;
  course: ExperimentCourse;
  items: ExperimentItem[];
}

export interface CreateExperimentRequest {
  courseId: string;
  number: number;
  title: string;
}

export type UpdateExperimentRequest = Partial<CreateExperimentRequest>;

export interface CreateExperimentItemRequest {
  componentId: string;
  qtyPerGroup: number;
}

export type UpdateExperimentItemRequest = Partial<CreateExperimentItemRequest>;

export interface ExperimentListResponse {
  data: Experiment[];
  total: number;
  page: number;
  limit: number;
}

export type SessionStatus = "SCHEDULED" | "RUNNING" | "COMPLETED" | "CANCELLED";

export interface SessionLab {
  id: string;
  name: string;
  roomNo: string;
}

export interface SessionSection {
  id: string;
  name: string;
  semester: string;
  studentCount: number;
  instructorId: string | null;
  course: ExperimentCourse;
}

export interface SessionRoutineSlot {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  lab: SessionLab;
  section: SessionSection;
}

export interface SessionExperiment {
  id: string;
  number: number;
  title: string;
}

export interface ClassSession {
  id: string;
  routineSlotId: string;
  date: string;
  startsAt: string;
  endsAt: string;
  experimentId: string | null;
  status: SessionStatus;
  routineSlot: SessionRoutineSlot;
  experiment: SessionExperiment | null;
}

export interface GenerateSessionsResult {
  created: number;
  horizonDays: number;
  from: string;
  to: string;
}

export interface SessionListResponse {
  data: ClassSession[];
  total: number;
  page: number;
  limit: number;
}

export type MovementType =
  | "PURCHASE"
  | "TRANSFER"
  | "ISSUE"
  | "RETURN"
  | "USED_UP"
  | "DAMAGED"
  | "LOST"
  | "REPAIRED"
  | "ADJUST";

export interface Stock {
  id: string;
  componentId: string;
  onHand: number;
  spareQty: number;
  reorderPoint: number;
  updatedAt: string;
  component: Component;
}

export interface StockListResponse {
  data: Stock[];
  total: number;
  page: number;
  limit: number;
}

export interface StockMovementPerformedBy {
  id: string;
  fullName: string;
  email: string;
  role: User["role"];
}

export interface StockMovement {
  id: string;
  componentId: string;
  qty: number;
  type: MovementType;
  fromDeptId: string | null;
  toDeptId: string | null;
  refType: string | null;
  refId: string | null;
  performedById: string;
  note: string | null;
  createdAt: string;
  performedBy: StockMovementPerformedBy;
}

export interface StockMovementListResponse {
  data: StockMovement[];
  total: number;
  page: number;
  limit: number;
}

export interface AdjustStockRequest {
  qty: number;
  note?: string;
}

export interface AdjustStockResponse {
  stock: Stock;
  movement: StockMovement;
}

export interface UpdateReorderPointRequest {
  reorderPoint: number;
}
