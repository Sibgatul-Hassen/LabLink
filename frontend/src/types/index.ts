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

export interface PeakSessionSummary {
  id: string;
  date: string;
  startsAt: string;
  endsAt: string;
  courseCode: string;
  sectionName: string;
  labName: string;
  roomNo: string;
  studentCount: number;
  groupSize: number;
  groups: number;
}

export interface DepartmentPeak {
  department: CourseDepartment;
  totalSessions: number;
  peak: number;
  peakAt: string | null;
  peakSessions: PeakSessionSummary[];
  peakGroups: number;
  peakGroupsAt: string | null;
}

export interface PeakClassesResponse {
  data: DepartmentPeak[];
  from: string | null;
  to: string | null;
}
export type ImportRowStatus = "created" | "skipped" | "failed";

export interface ImportRowResult {
  line: number;
  status: ImportRowStatus;
  courseCode?: string;
  sectionName?: string;
  roomNo?: string;
  message?: string;
  warning?: string;
}

export interface ImportRoutineSlotsResult {
  total: number;
  created: number;
  skipped: number;
  failed: number;
  warnings: number;
  rows: ImportRowResult[];
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

export interface SubstituteComponent {
  id: string;
  code: string;
  name: string;
}

export interface ComponentSubstitute {
  id: string;
  originalId: string;
  substituteId: string;
  ratio: number;
  notes: string | null;
  approvedById: string | null;
  createdAt: string;
  substitute: SubstituteComponent;
}

export interface CreateComponentSubstituteRequest {
  substituteId: string;
  ratio?: number;
  notes?: string | null;
}

export type UpdateComponentSubstituteRequest = Partial<
  Pick<CreateComponentSubstituteRequest, "ratio" | "notes">
>;

export interface ComponentSubstituteListResponse {
  data: ComponentSubstitute[];
}

export interface UpdateReorderPointRequest {
  reorderPoint: number;
}

export interface DepartmentQuota {
  id: string;
  departmentId: string;
  componentId: string;
  qty: number;
  suggestedQty: number;
  confirmedAt: string | null;
  updatedAt: string;
  department: Department;
  component: Component;
}

export interface DepartmentQuotaListResponse {
  data: DepartmentQuota[];
  total: number;
  page: number;
  limit: number;
}

export interface QuotaHistoryChangedBy {
  id: string;
  fullName: string;
  email: string;
  role: User["role"];
}

export interface QuotaHistoryEntry {
  id: string;
  departmentId: string;
  componentId: string;
  oldQty: number;
  newQty: number;
  reason: string;
  changedById: string;
  createdAt: string;
  changedBy: QuotaHistoryChangedBy | null;
}

export interface QuotaHistoryListResponse {
  data: QuotaHistoryEntry[];
  total: number;
  page: number;
  limit: number;
}

export interface UpdateQuotaRequest {
  qty?: number;
  suggestedQty?: number;
  reason?: string;
}

export interface UserAccountDepartment {
  id: string;
  code: string;
  name: string;
}

export interface UserAccount {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  departmentId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  department: UserAccountDepartment | null;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  fullName: string;
  role: Role;
  departmentId?: string | null;
}

export type UpdateUserRequest = Partial<Omit<CreateUserRequest, "password">> & {
  isActive?: boolean;
};

export interface ChangePasswordRequest {
  password: string;
}

export interface UserListResponse {
  data: UserAccount[];
  total: number;
  page: number;
  limit: number;
}

export type RequisitionType = "CLASS" | "PERSONAL" | "MAINTENANCE";

export type RequisitionOrigin =
  | "AUTO_DRAFT"
  | "LAB_ASSISTANT"
  | "INSTRUCTOR_LIVE";

export type RequisitionStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "READY"
  | "AWAITING_BORROW"
  | "AWAITING_PURCHASE"
  | "ISSUED"
  | "RETURNED"
  | "REJECTED"
  | "CANCELLED";

export interface RequisitionLineComponent {
  id: string;
  code: string;
  name: string;
  unit: string;
  sizeClass: "EXPENSIVE" | "SMALL";
}

export interface RequisitionLine {
  id: string;
  requisitionId: string;
  componentId: string;
  qtyNeeded: number;
  // Written by the resolver in task 3.4 — zero until then.
  qtyOwnQuota: number;
  qtySubstitute: number;
  qtySpare: number;
  qtyBorrowed: number;
  qtyShort: number;
  // Written by issue and return in Stage 4.
  qtyIssued: number;
  qtyReturnedGood: number;
  qtyDamaged: number;
  qtyLost: number;
  qtyUsedUp: number;
  component: RequisitionLineComponent;
}

export interface RequisitionClassSession {
  id: string;
  date: string;
  startsAt: string;
  endsAt: string;
  routineSlot: {
    lab: { id: string; name: string; roomNo: string; groupSize: number };
    section: {
      id: string;
      name: string;
      studentCount: number;
      course: ExperimentCourse;
    };
  };
  experiment: SessionExperiment | null;
}

export interface Requisition {
  id: string;
  type: RequisitionType;
  origin: RequisitionOrigin;
  classSessionId: string | null;
  requestedById: string;
  departmentId: string;
  neededFrom: string;
  neededTo: string;
  status: RequisitionStatus;
  createdAt: string;
  updatedAt: string;
  requestedBy: SectionUser;
  department: CourseDepartment;
  classSession: RequisitionClassSession | null;
  lines: RequisitionLine[];
}

export interface CreateRequisitionLineInput {
  componentId: string;
  qtyNeeded: number;
}

export interface CreateRequisitionRequest {
  type: RequisitionType;
  classSessionId?: string;
  neededFrom?: string;
  neededTo?: string;
  lines?: CreateRequisitionLineInput[];
}

export interface UpdateRequisitionRequest {
  neededFrom?: string;
  neededTo?: string;
}

export interface ReturnRequisitionItemInput {
  componentId: string;
  goodQty?: number;
  damagedQty?: number;
  lostQty?: number;
  usedUpQty?: number;
}

export interface ReturnRequisitionRequest {
  items: ReturnRequisitionItemInput[];
}

export interface RequisitionListResponse {
  data: Requisition[];
  total: number;
  page: number;
  limit: number;
}

// ─────────────── requisition resolution breakdown (task 4.3) ───────────────

export interface ResolutionBreakdownLine {
  lineId: string;
  componentId: string;
  componentCode: string;
  componentName: string;
  qtyNeeded: number;
  qtyFromOwn: number;
  qtyFromOffice: number;
  qtyFromBorrow: number;
  qtyToPurchase: number;
  qtyShort: number;
}

export interface ResolutionBreakdown {
  requisitionId: string;
  status: RequisitionStatus;
  lines: ResolutionBreakdownLine[];
}

// ─────────────── purchasing (task 5.14) ───────────────

export type PurchaseStatus =
  | "PENDING"
  | "APPROVED"
  | "RECEIVED"
  | "REJECTED"
  | "CANCELLED";

export type Urgency = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";

export type ApprovalDecision = "PENDING" | "APPROVED" | "REJECTED" | "ESCALATED";

export interface PurchaseRequestComponent {
  id: string;
  code: string;
  name: string;
  unit: string;
}

export interface PurchaseRequestRequisition {
  id: string;
  type: RequisitionType;
  status: RequisitionStatus;
  departmentId: string;
  neededTo: string;
}

export interface ApprovalStep {
  id: string;
  purchaseRequestId: string;
  level: number;
  approverRole: Role;
  approverId: string | null;
  decision: ApprovalDecision;
  decidedAt: string | null;
  dueAt: string;
  remarks: string | null;
}

export interface PurchaseRequest {
  id: string;
  requisitionId: string | null;
  componentId: string;
  qtyNeeded: number;
  urgency: Urgency;
  status: PurchaseStatus;
  currentLevel: number;
  raisedById: string;
  poNumber: string | null;
  receivedQty: number;
  createdAt: string;
  component: PurchaseRequestComponent;
  requisition: PurchaseRequestRequisition | null;
  steps: ApprovalStep[];
}

export interface PurchaseRequestListResponse {
  data: PurchaseRequest[];
  total: number;
  page: number;
  limit: number;
}

export interface CreatePurchaseRequestRequest {
  componentId: string;
  qtyRequested: number;
  reason: string;
  requisitionId?: string;
}

export interface DecidePurchaseRequestRequest {
  action: "APPROVE" | "REJECT";
  remarks?: string;
}

export interface ReceiveGoodsRequest {
  poNumber: string;
  qtyReceived: number;
}

// ─────────────── issue preview (task 6.2) ───────────────

export interface IssuePreviewLine {
  lineId: string;
  componentId: string;
  componentCode: string;
  componentName: string;
  qtyNeeded: number;
  currentStock: number;
}

export interface IssuePreview {
  requisitionId: string;
  status: RequisitionStatus;
  lines: IssuePreviewLine[];
}

// ─────────────── return preview (task 6.3) ───────────────

export interface ReturnPreviewLine {
  lineId: string;
  componentId: string;
  componentCode: string;
  componentName: string;
  qtyIssued: number;
}

export interface ReturnPreview {
  requisitionId: string;
  status: RequisitionStatus;
  lines: ReturnPreviewLine[];
}
