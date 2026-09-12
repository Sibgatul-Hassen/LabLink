# AGENTS.md — LabLink

Instructions for AI coding agents (GitHub Copilot, Copilot coding agent, or any
agent reading `AGENTS.md`) working in this repository.

> **Copy this file to `.github/copilot-instructions.md` as well** so Copilot Chat
> picks it up automatically in the editor.

---

## 1. Current objective — read this first

**Deadline: 16 August 2026 (6th lab class). Three days from now.**

This repository is a 16-week project, but **you are only building Milestone 1.**
Do not build anything outside the scope in section 6, even if you see it
described in the project documents.

### What Milestone 1 must demonstrate

| Requirement (from the instructor)                      | How this repo satisfies it                                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Front end, back end and database set up                | React + Vite frontend, Express + TypeScript backend, PostgreSQL via Prisma, all running under Docker Compose |
| Connection between all three                           | Frontend calls the API over HTTP; API reads and writes PostgreSQL through Prisma                             |
| One create, one read, one update, one delete operation | Full CRUD on the **Component** entity, exposed as REST and driven from the UI                                |
| Login page and dashboard set up properly               | JWT login, seven roles, a role-aware dashboard that renders different content per role                       |

**Nothing else is in scope for 16 August.** No resolver, no quotas, no
requisitions, no borrowing, no purchase ladder.

---

## 2. What LabLink is (context only — do not build this yet)

LabLink manages laboratory components at United International University. All
components live in one central office component room. Each department gets a
**quota** — a cap on how much it may hold at once, sized from that department's
peak simultaneous class load.

Different sections run different experiments, so an instructor orders what a
class actually needs at the moment it starts. Whatever the class does not take
stays in the **department pool** and any other class in that same department may
draw it automatically, with no approval. Sharing inside a department is free;
crossing a department boundary is what requires an approval.

A requisition is filled through five tiers: the department pool, a substitute
component, a central spare pool, another department's unused quota, and finally
a purchase request that climbs a three-rung approval ladder.

You are building the foundation that all of that will later sit on.

---

## 3. Hard rules

Violating any of these creates work for four people to undo.

1. **Never edit `prisma/schema.prisma` after Task 2 is merged.** The schema is
   frozen. If a later task appears to need a schema change, stop and say so in
   the PR instead of changing it.
2. **Never commit `.env`.** Only `.env.example`.
3. **Never use `any` in TypeScript.** Use `unknown` and narrow, or define the type.
4. **Every API route must have a role guard.** No exceptions, including routes
   that "obviously" everyone can call.
5. **Never build features outside section 6.** If a task seems to need something
   from a later milestone, stub it and leave a `// TODO(milestone-2):` comment.
6. **Never store passwords in plain text.** bcrypt with a cost factor of 10.
7. **Do not use `localStorage` for the JWT** — keep it in memory in a Zustand
   store. Losing the session on refresh is acceptable for Milestone 1.
8. **Every PR must pass `npm run lint`, `npx tsc --noEmit` and `npm test`.**

---

## 4. Technology

Use exactly these. Do not substitute.

### Backend — `/backend`

```
express            ^4
typescript         ^5
@prisma/client     ^5
prisma             ^5   (dev)
zod                ^3
jsonwebtoken       ^9
bcryptjs           ^2
cors               ^2
dotenv             ^16
ts-node-dev             (dev)
jest, ts-jest, supertest, @types/*   (dev)
```

### Frontend — `/frontend`

```
react              ^18
react-dom          ^18
react-router-dom   ^6
typescript         ^5
vite               ^5
tailwindcss        ^3
zustand            ^4
@tanstack/react-query  ^5
axios              ^1
```

### Infrastructure

PostgreSQL 16 · Docker Compose · GitHub Actions

---

## 5. Repository layout

Create exactly this structure.

```
/
├── AGENTS.md
├── docker-compose.yml
├── .github/
│   ├── copilot-instructions.md      (copy of this file)
│   └── workflows/ci.yml
├── backend/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   ├── jest.config.js
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   └── src/
│       ├── index.ts                 Express app entry
│       ├── config/env.ts            validated env via zod
│       ├── lib/prisma.ts            single PrismaClient instance
│       ├── middleware/
│       │   ├── auth.ts              requireAuth
│       │   ├── rbac.ts              requireRole
│       │   ├── scope.ts             departmentScope
│       │   └── error.ts             central error handler
│       ├── routes/
│       │   ├── auth.routes.ts
│       │   ├── component.routes.ts
│       │   └── health.routes.ts
│       ├── services/
│       │   ├── auth.service.ts
│       │   └── component.service.ts
│       ├── schemas/                 zod request schemas
│       │   ├── auth.schema.ts
│       │   └── component.schema.ts
│       └── types/index.ts           shared DTOs
└── frontend/
    ├── Dockerfile
    ├── .dockerignore
    ├── .env.example
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── api/
        │   ├── client.ts            axios instance + interceptor
        │   ├── auth.api.ts
        │   └── component.api.ts
        ├── store/authStore.ts       Zustand
        ├── components/
        │   ├── Layout.tsx
        │   ├── ProtectedRoute.tsx
        │   └── ui/                  Button, Input, Modal, Table
        ├── pages/
        │   ├── Login.tsx
        │   ├── Dashboard.tsx
        │   └── Components.tsx
        └── types/index.ts
```

**Architectural rule:** files in `src/services/` must never import from
`express`. They take plain arguments and return plain data. Routes handle HTTP;
services handle logic. This is what makes the services unit-testable.

---

## 6. Task list — build in this order

Each task is one pull request into `develop`. Do not start a task whose
**Needs** are unmerged.

---

### TASK 1 · Backend scaffold

**Owner:** Pabel · **Needs:** nothing · **Branch:** `feature/backend-scaffold`

Create `/backend` with `package.json`, `tsconfig.json` (strict mode on),
`.env.example`, and a minimal Express app with a `GET /health` route returning
`{ status: "ok", service: "lablink-api" }`.

Add `src/config/env.ts` that validates `DATABASE_URL`, `JWT_SECRET`, `PORT` and
`NODE_ENV` with zod and throws on startup if any is missing.

**Scripts:** `dev`, `build`, `start`, `test`, `lint`, `db:migrate`, `db:seed`, `db:studio`

**Done when:** `npm run dev` starts and `curl localhost:5000/health` returns the JSON above.

---

### TASK 2 · Database schema

**Owner:** Pabel · **Needs:** Task 1 · **Branch:** `feature/db-schema`

Create `backend/prisma/schema.prisma` with the **complete** schema in section 7.
All 29 models and all enums, even though Milestone 1 only uses a few. Then run
`npx prisma migrate dev --name init`.

**Done when:** the migration applies cleanly, `npx prisma studio` opens and shows
every table, and the generated client compiles.

> After this PR merges, **the schema is frozen.**

---

### TASK 3 · Docker Compose

**Owner:** Azmain · **Needs:** Task 1 · **Branch:** `chore/docker`

Write `docker-compose.yml` with three services:

- `postgres` — `postgres:16-alpine`, db `lablink`, user `lablink`, password `lablink`, port 5432, named volume, healthcheck `pg_isready`
- `backend` — builds `./backend`, port 5000, `depends_on: postgres` with `condition: service_healthy`, source mounted for hot reload
- `frontend` — builds `./frontend`, port 5173, `depends_on: backend`, source mounted

Write both `Dockerfile`s (node:18-alpine) and both `.dockerignore` files.

**Done when:** `docker compose up` starts all three and `localhost:5000/health` responds from the host.

---

### TASK 4 · Seed script

**Owner:** Pabel · **Needs:** Task 2 · **Branch:** `feature/seed`

Write `backend/prisma/seed.ts` creating:

- **4 departments** — CSE, EEE, CIVIL, and OFFICE with `isOffice: true`
- **7 users**, one per role, all with password `Password123!`:

| Email                   | Role                    | Department |
| ----------------------- | ----------------------- | ---------- |
| `student@uiu.ac.bd`     | `STUDENT`               | CSE        |
| `instructor@uiu.ac.bd`  | `INSTRUCTOR`            | CSE        |
| `labasst@uiu.ac.bd`     | `LAB_ASSISTANT`         | CSE        |
| `storehead@uiu.ac.bd`   | `DEPT_STORE_HEAD`       | CSE        |
| `central@uiu.ac.bd`     | `CENTRAL_STORE_OFFICER` | OFFICE     |
| `officeadmin@uiu.ac.bd` | `OFFICE_ADMIN`          | OFFICE     |
| `sysadmin@uiu.ac.bd`    | `SYSTEM_ADMIN`          | —          |

- **12 components** with realistic data — Arduino Uno R3, Arduino Nano, ESP32
  DevKit, Digital Multimeter, Oscilloscope, Breadboard 830pt, Jumper Wire M-M,
  Red LED 5mm, Resistor 220Ω, Resistor 10kΩ, Servo SG90, Ultrasonic HC-SR04.
  Set `sizeClass` to `EXPENSIVE` for boards and instruments, `SMALL` for the rest.
- A `Stock` row per component with sensible `onHand`, `spareQty`, `reorderPoint`.

Make the script idempotent using `upsert` so it can be re-run safely.

**Done when:** `npm run db:seed` runs twice with no errors and no duplicates.

---

### TASK 5 · Authentication

**Owner:** Saiful · **Needs:** Task 4 · **Branch:** `feature/auth`

`POST /api/auth/login` — body `{ email, password }`, validated with zod.
Returns `{ token, user: { id, fullName, email, role, departmentId, departmentCode } }`.
Wrong credentials return **401** with `{ error: "Invalid email or password" }` —
never reveal which field was wrong.

`GET /api/auth/me` — requires a bearer token, returns the same user object.

JWT: HS256, 8-hour expiry, payload `{ sub, role, departmentId }`.

Write `src/middleware/auth.ts` exporting `requireAuth`, which verifies the token
and attaches `req.user`. Missing or invalid token → **401**.

**Done when:** all seven seeded users log in successfully and a bad password returns 401.

---

### TASK 6 · Role guard and department scope

**Owner:** Saiful · **Needs:** Task 5 · **Branch:** `feature/rbac`

`src/middleware/rbac.ts`:

```ts
export function requireRole(...allowed: Role[]) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (!allowed.includes(req.user.role))
      return res.status(403).json({ error: "Forbidden" });
    next();
  };
}
```

`src/middleware/scope.ts` — attaches `req.scope`:

```ts
const UNSCOPED: Role[] = [
  "CENTRAL_STORE_OFFICER",
  "OFFICE_ADMIN",
  "SYSTEM_ADMIN",
];
// unscoped roles get {}, everyone else gets { departmentId: req.user.departmentId }
```

**Do not implement roles as a numeric rank.** `CENTRAL_STORE_OFFICER` has
university-wide data scope but low approval authority; `OFFICE_ADMIN` must not
inherit operational powers. Always use explicit role lists.

Write Jest tests: each role hitting a route it is not allowed on returns 403.

**Done when:** at least 5 RBAC unit tests pass.

---

### TASK 7 · Component CRUD API

**Owner:** Sibgatul · **Needs:** Task 6 · **Branch:** `feature/component-api`

This is the CRUD the instructor is marking. All four operations must work.

| Method   | Path                  | Roles                                   | Returns                            |
| -------- | --------------------- | --------------------------------------- | ---------------------------------- |
| `POST`   | `/api/components`     | `CENTRAL_STORE_OFFICER`, `SYSTEM_ADMIN` | 201 + created component            |
| `GET`    | `/api/components`     | all authenticated                       | 200 + paginated list               |
| `GET`    | `/api/components/:id` | all authenticated                       | 200 + one component, 404 if absent |
| `PATCH`  | `/api/components/:id` | `CENTRAL_STORE_OFFICER`, `SYSTEM_ADMIN` | 200 + updated component            |
| `DELETE` | `/api/components/:id` | `SYSTEM_ADMIN`                          | 204                                |

`GET /api/components` supports `?search=`, `?category=`, `?page=`, `?limit=`
(default 20). Return `{ data: Component[], total, page, limit }`.

Validate every body with zod. Duplicate `code` → **409** with a clear message.
`DELETE` is a soft delete: set `isActive = false`, and exclude inactive rows from
the list by default.

Put the logic in `src/services/component.service.ts` with **no Express imports**.

**Done when:** all five endpoints work via curl or Postman, and Supertest
integration tests cover create → read → update → delete.

---

### TASK 8 · Frontend scaffold

**Owner:** Azmain · **Needs:** Task 3 · **Branch:** `feature/frontend-scaffold`

`npm create vite@latest frontend -- --template react-ts`, then Tailwind, React
Router, TanStack Query, Zustand, axios.

Routes: `/login` (public), `/dashboard` and `/components` (protected).
`ProtectedRoute` redirects to `/login` when there is no token.

`src/api/client.ts` — axios instance with `baseURL` from `import.meta.env.VITE_API_URL`,
a request interceptor attaching `Authorization: Bearer <token>`, and a response
interceptor that clears the auth store and redirects to `/login` on 401.

**Done when:** `npm run dev` serves on 5173 and an unauthenticated visit to
`/dashboard` redirects to `/login`.

---

### TASK 9 · Login page

**Owner:** Saiful · **Needs:** Tasks 5, 8 · **Branch:** `feature/login-page`

`src/pages/Login.tsx` — centred card, LabLink heading, email and password
fields, submit button, inline error, loading state on the button.

`src/store/authStore.ts` — Zustand store holding `token`, `user`, `login()`,
`logout()`. In memory only, no `localStorage`.

On success, navigate to `/dashboard`. On failure, show the API's error message.

Client-side validation: email format, password non-empty. Disable submit while
the request is in flight.

**Done when:** logging in as each of the seven seeded users lands on the dashboard,
and a wrong password shows an inline error without navigating.

---

### TASK 10 · Dashboard

**Owner:** Azmain · **Needs:** Task 9 · **Branch:** `feature/dashboard`

`src/components/Layout.tsx` — top bar with the LabLink name, the signed-in user's
name and role, and a logout button. Left sidebar whose links depend on role:

| Role                    | Sidebar                                         |
| ----------------------- | ----------------------------------------------- |
| `STUDENT`               | Dashboard, Components                           |
| `INSTRUCTOR`            | Dashboard, Components                           |
| `LAB_ASSISTANT`         | Dashboard, Components                           |
| `DEPT_STORE_HEAD`       | Dashboard, Components                           |
| `CENTRAL_STORE_OFFICER` | Dashboard, Components, Manage Components        |
| `OFFICE_ADMIN`          | Dashboard, Components                           |
| `SYSTEM_ADMIN`          | Dashboard, Components, Manage Components, Users |

`src/pages/Dashboard.tsx` — greeting with the user's name, their role and
department as badges, and four stat cards: total components, expensive
components, small components, low-stock count. Fetch these with TanStack Query
from `GET /api/components`. Show skeletons while loading.

**The role-aware sidebar is what proves RBAC works in the demo. Make the
difference between roles visible at a glance.**

**Done when:** logging in as three different roles shows three visibly different
sidebars.

---

### TASK 11 · Component CRUD screens

**Owner:** Sibgatul · **Needs:** Tasks 7, 10 · **Branch:** `feature/component-ui`

`src/pages/Components.tsx`:

- **Read** — a table of code, name, category, size class, unit cost, with a
  search box and a category filter. Paginated. Empty state when no results.
- **Create** — "Add Component" button (visible only to `CENTRAL_STORE_OFFICER`
  and `SYSTEM_ADMIN`) opening a modal form.
- **Update** — an edit icon per row opening the same modal pre-filled.
- **Delete** — a delete icon per row (visible only to `SYSTEM_ADMIN`) with a
  confirmation dialog.

Use TanStack Query mutations and invalidate the list query on success so the
table refreshes without a page reload. Show a toast or inline banner on success
and on error.

**Done when:** all four operations work from the browser and the table updates
immediately after each.

---

### TASK 12 · CI pipeline

**Owner:** Sibgatul · **Needs:** Tasks 1, 8 · **Branch:** `chore/ci`

`.github/workflows/ci.yml` running on every PR: a `postgres:16` service
container, then for both `backend` and `frontend` — `npm ci`, `npm run lint`,
`npx tsc --noEmit`, `npm test`, `npm run build`.

**Done when:** the workflow is green on a test PR. Then enable "Require status
checks" on the `main` and `develop` rulesets — this has been pending since repo
setup.

---

### TASK 13 · Integration check and demo rehearsal

**Owner:** all four · **Needs:** Tasks 1–12 · **Branch:** `chore/integration`

Fresh clone into an empty directory, then:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
docker compose up -d
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npm run db:seed
```

Walk the full demo path in a browser and fix anything that breaks. Update
`README.md` with exactly these steps.

---

## 7. Database schema

Write this into `backend/prisma/schema.prisma` verbatim in Task 2. Milestone 1
uses only `Department`, `User`, `Component` and `Stock` — the rest exist so the
schema never has to change again.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─────────────── enums ───────────────

enum Role {
  STUDENT
  INSTRUCTOR
  LAB_ASSISTANT
  DEPT_STORE_HEAD
  CENTRAL_STORE_OFFICER
  OFFICE_ADMIN
  SYSTEM_ADMIN
}

enum SizeClass { EXPENSIVE SMALL }

enum MovementType {
  PURCHASE TRANSFER ISSUE RETURN USED_UP DAMAGED LOST REPAIRED ADJUST
}

enum RequisitionType { CLASS PERSONAL MAINTENANCE }

// how a requisition came into existence — auto-drafted overnight from the
// routine, raised by a lab assistant, or ordered live by an instructor at the
// moment a class starts
enum RequisitionOrigin { AUTO_DRAFT LAB_ASSISTANT INSTRUCTOR_LIVE }

enum RequisitionStatus {
  DRAFT SUBMITTED READY AWAITING_BORROW AWAITING_PURCHASE
  ISSUED RETURNED REJECTED CANCELLED
}

enum AllocationSource { OWN_QUOTA SUBSTITUTE SPARE BORROW }
enum AllocationStatus { HELD ISSUED RELEASED }

enum BorrowStatus { REQUESTED APPROVED REJECTED HANDED_OVER RETURNED CANCELLED }

enum PurchaseStatus { PENDING APPROVED RECEIVED REJECTED CANCELLED }
enum Decision       { PENDING APPROVED REJECTED ESCALATED }
enum Urgency        { LOW NORMAL HIGH CRITICAL }

enum DamageStatus  { REPORTED UNDER_MAINTENANCE REPAIRED WRITTEN_OFF }
enum SessionStatus { SCHEDULED RUNNING COMPLETED CANCELLED }

enum PenaltyType   { LATE LOST DAMAGED }
enum PenaltyStatus { OUTSTANDING PAID WAIVED }

enum SuggestionType {
  SUBSTITUTE REORDER_POINT QUOTA ITEM_LIST
  SHORTAGE_ALERT COLLECTION_RISK SLOT
}
enum SuggestionStatus { PENDING ACCEPTED DISMISSED EXPIRED }

// ─────────────── organisation ───────────────

model Department {
  id        String  @id @default(cuid())
  code      String  @unique          // "CSE", "EEE", "CIVIL", "OFFICE"
  name      String
  isOffice  Boolean @default(false)  // true only for the component room
  isActive  Boolean @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  users        User[]
  labs         Lab[]
  courses      Course[]
  quotas       DepartmentQuota[]
  requisitions Requisition[]
  lentBorrows     BorrowRequest[] @relation("Lender")
  borrowedBorrows BorrowRequest[] @relation("Borrower")
}

model Lab {
  id             String  @id @default(cuid())
  name           String
  roomNo         String
  groupSize      Int     @default(4)
  departmentId   String
  labAssistantId String?
  isActive       Boolean @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  department   Department @relation(fields: [departmentId], references: [id])
  labAssistant User?      @relation("LabAssistantOf", fields: [labAssistantId], references: [id])
  routineSlots RoutineSlot[]

  @@unique([departmentId, roomNo])
}

model User {
  id           String  @id @default(cuid())
  email        String  @unique
  passwordHash String
  fullName     String
  role         Role
  departmentId String?
  isActive     Boolean @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  department Department? @relation(fields: [departmentId], references: [id])

  labsAssisted     Lab[]         @relation("LabAssistantOf")
  sectionsTaught   Section[]     @relation("Instructor")
  sectionsAssisted Section[]     @relation("SectionLabAssistant")
  requisitions     Requisition[] @relation("RequestedBy")
  notifications    Notification[]
  penalties        Penalty[]     @relation("PenaltyOwner")
  movements        StockMovement[]
  damageReports    DamageReport[] @relation("DamageReporter")

  @@index([role])
}

// ─────────────── catalogue ───────────────

model Component {
  id           String    @id @default(cuid())
  code         String    @unique      // "ARD-UNO-R3"
  name         String
  category     String                 // "Microcontroller", "Passive", "Instrument"
  unit         String    @default("pcs")
  isReturnable Boolean   @default(true)
  sizeClass    SizeClass @default(SMALL)
  unitCost     Decimal?  @db.Decimal(10, 2)
  description  String?
  isActive     Boolean   @default(true)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  stock            Stock?
  quotas           DepartmentQuota[]
  movements        StockMovement[]
  experimentItems  ExperimentItem[]
  requisitionLines RequisitionLine[]
  borrowLines      BorrowLine[]
  purchaseRequests PurchaseRequest[]
  damageReports    DamageReport[]
  penalties        Penalty[]
  substituteFor    ComponentSubstitute[] @relation("Original")
  substituteOf     ComponentSubstitute[] @relation("Substitute")

  @@index([category])
  @@index([isActive])
}

model ComponentSubstitute {
  id           String  @id @default(cuid())
  originalId   String
  substituteId String
  ratio        Int     @default(1)
  notes        String?
  approvedById String?
  createdAt    DateTime @default(now())

  original   Component @relation("Original",   fields: [originalId],   references: [id])
  substitute Component @relation("Substitute", fields: [substituteId], references: [id])

  @@unique([originalId, substituteId])
}

// ─────────────── stock ───────────────

model Stock {
  id           String @id @default(cuid())
  componentId  String @unique
  onHand       Int    @default(0)   // total physically at the office
  spareQty     Int    @default(0)   // held outside every department quota
  reorderPoint Int    @default(0)
  updatedAt    DateTime @updatedAt

  component Component @relation(fields: [componentId], references: [id])
}

model StockMovement {
  id            String       @id @default(cuid())
  componentId   String
  qty           Int
  type          MovementType
  fromDeptId    String?      // null = external or write-off
  toDeptId      String?
  refType       String?      // "REQUISITION" | "BORROW" | "PURCHASE" | "ADJUST"
  refId         String?
  performedById String
  note          String?
  createdAt     DateTime     @default(now())

  component   Component @relation(fields: [componentId], references: [id])
  performedBy User      @relation(fields: [performedById], references: [id])

  @@index([componentId, createdAt])
  @@index([refType, refId])
}

// ─────────────── quota ───────────────

model DepartmentQuota {
  id           String @id @default(cuid())
  departmentId String
  componentId  String
  qty          Int    @default(0)
  suggestedQty Int    @default(0)
  confirmedAt  DateTime?
  updatedAt    DateTime @updatedAt

  department Department @relation(fields: [departmentId], references: [id])
  component  Component  @relation(fields: [componentId], references: [id])

  @@unique([departmentId, componentId])
}

model QuotaHistory {
  id           String @id @default(cuid())
  departmentId String
  componentId  String
  oldQty       Int
  newQty       Int
  reason       String
  changedById  String
  createdAt    DateTime @default(now())

  @@index([departmentId, componentId])
}

// ─────────────── academic ───────────────

model Course {
  id           String @id @default(cuid())
  code         String @unique        // "CSE 3216"
  title        String
  departmentId String
  isActive     Boolean @default(true)

  department  Department   @relation(fields: [departmentId], references: [id])
  sections    Section[]
  experiments Experiment[]
}

model Section {
  id             String @id @default(cuid())
  courseId       String
  name           String              // "A"
  semester       String              // "Spring 2026"
  studentCount   Int
  instructorId   String?
  labAssistantId String?

  course       Course        @relation(fields: [courseId], references: [id])
  instructor   User?         @relation("Instructor",          fields: [instructorId],   references: [id])
  labAssistant User?         @relation("SectionLabAssistant", fields: [labAssistantId], references: [id])
  routineSlots RoutineSlot[]

  @@unique([courseId, name, semester])
}

model RoutineSlot {
  id            String   @id @default(cuid())
  sectionId     String
  labId         String
  dayOfWeek     Int                  // 0 = Sunday .. 6 = Saturday
  startTime     String               // "08:30"
  endTime       String               // "11:30"
  effectiveFrom DateTime
  effectiveTo   DateTime

  section  Section        @relation(fields: [sectionId], references: [id])
  lab      Lab            @relation(fields: [labId],     references: [id])
  sessions ClassSession[]

  @@index([labId, dayOfWeek])
}

model ClassSession {
  id            String        @id @default(cuid())
  routineSlotId String
  date          DateTime      @db.Date
  startsAt      DateTime
  endsAt        DateTime
  experimentId  String?
  status        SessionStatus @default(SCHEDULED)

  routineSlot RoutineSlot  @relation(fields: [routineSlotId], references: [id])
  experiment  Experiment?  @relation(fields: [experimentId],  references: [id])
  requisition Requisition?

  @@unique([routineSlotId, date])
  @@index([startsAt])
}

model Experiment {
  id       String @id @default(cuid())
  courseId String
  number   Int
  title    String

  course   Course           @relation(fields: [courseId], references: [id])
  items    ExperimentItem[]
  sessions ClassSession[]

  @@unique([courseId, number])
}

model ExperimentItem {
  id           String @id @default(cuid())
  experimentId String
  componentId  String
  qtyPerGroup  Int

  experiment Experiment @relation(fields: [experimentId], references: [id], onDelete: Cascade)
  component  Component  @relation(fields: [componentId],  references: [id])

  @@unique([experimentId, componentId])
}

// ─────────────── requisition ───────────────

model Requisition {
  id             String            @id @default(cuid())
  type           RequisitionType
  origin         RequisitionOrigin @default(AUTO_DRAFT)
  classSessionId String?           @unique
  requestedById  String
  departmentId   String
  neededFrom     DateTime
  neededTo       DateTime
  status         RequisitionStatus @default(DRAFT)
  issuedAt       DateTime?
  issuedById     String?
  returnedAt     DateTime?
  returnedById   String?
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt

  classSession ClassSession? @relation(fields: [classSessionId], references: [id])
  requestedBy  User          @relation("RequestedBy", fields: [requestedById], references: [id])
  department   Department    @relation(fields: [departmentId], references: [id])

  lines            RequisitionLine[]
  borrowRequests   BorrowRequest[]
  purchaseRequests PurchaseRequest[]
  penalties        Penalty[]

  @@index([status, neededFrom])
}

model RequisitionLine {
  id            String @id @default(cuid())
  requisitionId String
  componentId   String
  qtyNeeded     Int

  qtyOwnQuota   Int @default(0)
  qtySubstitute Int @default(0)
  qtySpare      Int @default(0)
  qtyBorrowed   Int @default(0)
  qtyShort      Int @default(0)

  qtyIssued       Int @default(0)
  qtyReturnedGood Int @default(0)
  qtyDamaged      Int @default(0)
  qtyLost         Int @default(0)
  qtyUsedUp       Int @default(0)

  requisition Requisition  @relation(fields: [requisitionId], references: [id], onDelete: Cascade)
  component   Component    @relation(fields: [componentId],   references: [id])
  allocations Allocation[]

  @@unique([requisitionId, componentId])
}

model Allocation {
  id                String           @id @default(cuid())
  requisitionLineId String
  sourceDeptId      String?          // null when drawn from the spare pool
  qty               Int
  source            AllocationSource
  status            AllocationStatus @default(HELD)
  createdAt         DateTime         @default(now())

  requisitionLine RequisitionLine @relation(fields: [requisitionLineId], references: [id], onDelete: Cascade)

  @@index([sourceDeptId, status])
}

// ─────────────── borrowing ───────────────

model BorrowRequest {
  id             String       @id @default(cuid())
  requisitionId  String
  lenderDeptId   String
  borrowerDeptId String
  status         BorrowStatus @default(REQUESTED)
  returnBy       DateTime
  decidedById    String?
  decidedAt      DateTime?
  remarks        String?
  createdAt      DateTime     @default(now())

  requisition Requisition  @relation(fields: [requisitionId],  references: [id])
  lender      Department   @relation("Lender",   fields: [lenderDeptId],   references: [id])
  borrower    Department   @relation("Borrower", fields: [borrowerDeptId], references: [id])
  lines       BorrowLine[]

  @@index([status, returnBy])
}

model BorrowLine {
  id              String @id @default(cuid())
  borrowRequestId String
  componentId     String
  qtyRequested    Int
  qtyApproved     Int    @default(0)
  qtyReturned     Int    @default(0)

  borrowRequest BorrowRequest @relation(fields: [borrowRequestId], references: [id], onDelete: Cascade)
  component     Component     @relation(fields: [componentId],     references: [id])
}

// ─────────────── purchasing ───────────────

model PurchaseRequest {
  id            String         @id @default(cuid())
  requisitionId String?
  componentId   String
  qtyNeeded     Int
  urgency       Urgency        @default(NORMAL)
  status        PurchaseStatus @default(PENDING)
  currentLevel  Int            @default(1)
  raisedById    String
  poNumber      String?
  receivedQty   Int            @default(0)
  createdAt     DateTime       @default(now())

  requisition Requisition?   @relation(fields: [requisitionId], references: [id])
  component   Component      @relation(fields: [componentId],   references: [id])
  steps       ApprovalStep[]

  @@index([status, urgency])
}

model ApprovalStep {
  id                String    @id @default(cuid())
  purchaseRequestId String
  level             Int
  approverRole      Role
  approverId        String?
  decision          Decision  @default(PENDING)
  decidedAt         DateTime?
  dueAt             DateTime
  remarks           String?

  purchaseRequest PurchaseRequest @relation(fields: [purchaseRequestId], references: [id], onDelete: Cascade)

  @@unique([purchaseRequestId, level])
}

// ─────────────── condition ───────────────

model DamageReport {
  id            String       @id @default(cuid())
  componentId   String
  qty           Int
  requisitionId String?
  reportedById  String
  status        DamageStatus @default(REPORTED)
  inspectedById String?
  inspectedAt   DateTime?
  notes         String?
  createdAt     DateTime     @default(now())

  component  Component @relation(fields: [componentId],  references: [id])
  reportedBy User      @relation("DamageReporter", fields: [reportedById], references: [id])

  @@index([status])
}

// ─────────────── accountability ───────────────

model Penalty {
  id            String        @id @default(cuid())
  userId        String
  requisitionId String?
  componentId   String?
  type          PenaltyType
  qty           Int           @default(1)
  amount        Decimal       @db.Decimal(10, 2)
  status        PenaltyStatus @default(OUTSTANDING)
  paidAt        DateTime?
  paidRecordedById String?
  receiptRef    String?
  waivedById    String?
  waivedReason  String?
  createdAt     DateTime      @default(now())

  user        User         @relation("PenaltyOwner", fields: [userId], references: [id])
  requisition Requisition? @relation(fields: [requisitionId], references: [id])
  component   Component?   @relation(fields: [componentId],   references: [id])

  @@index([userId, status])
}

model PenaltyRate {
  id            String      @id @default(cuid())
  type          PenaltyType @unique
  ratePerDay    Decimal?    @db.Decimal(10, 2)
  capAmount     Decimal?    @db.Decimal(10, 2)
  costFraction  Decimal?    @db.Decimal(4, 2)
  blockThreshold Decimal    @default(0) @db.Decimal(10, 2)
  updatedAt     DateTime    @updatedAt
}

// ─────────────── intelligence ───────────────

model Suggestion {
  id         String           @id @default(cuid())
  type       SuggestionType
  payload    Json
  evidence   Json
  targetRole Role
  status     SuggestionStatus @default(PENDING)
  decidedById String?
  decidedAt  DateTime?
  createdAt  DateTime         @default(now())

  feedback SuggestionFeedback[]

  @@index([type, status])
}

model SuggestionFeedback {
  id           String   @id @default(cuid())
  suggestionId String
  accepted     Boolean
  note         String?
  createdAt    DateTime @default(now())

  suggestion Suggestion @relation(fields: [suggestionId], references: [id], onDelete: Cascade)
}

// ─────────────── system ───────────────

model Notification {
  id        String   @id @default(cuid())
  userId    String
  title     String
  body      String
  refType   String?
  refId     String?
  isRead    Boolean  @default(false)
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id])

  @@index([userId, isRead])
}

model AuditLog {
  id         String   @id @default(cuid())
  actorId    String
  action     String
  entityType String
  entityId   String
  before     Json?
  after      Json?
  createdAt  DateTime @default(now())

  @@index([entityType, entityId])
}
```

---

## 8. Conventions

**Branches** — `feature/<area>`, `fix/<area>`, `chore/<area>`, cut from `develop`.

**Commits** — `feat:` `fix:` `refactor:` `test:` `docs:` `chore:`
Example: `feat: add component CRUD endpoints`

**API responses**

```jsonc
// success
{ "data": { /* ... */ } }
{ "data": [ /* ... */ ], "total": 42, "page": 1, "limit": 20 }

// error
{ "error": "Human-readable message", "details": { /* zod issues */ } }
```

**Status codes** — 200 read/update · 201 create · 204 delete · 400 validation ·
401 unauthenticated · 403 wrong role · 404 not found · 409 conflict · 500 unhandled

**Naming** — `camelCase` variables and functions · `PascalCase` components and
types · `kebab-case.ts` files except React components which are `PascalCase.tsx`

---

## 9. Definition of done — 16 August 2026

Tick every box before the lab class.

**Instructor's requirements**

- [ ] Front end runs and is reachable in a browser
- [ ] Back end runs and answers requests
- [ ] Database runs, migrated, seeded
- [ ] Front end successfully calls the back end, which reads and writes the database
- [ ] **Create** — a new component can be added from the UI and persists after refresh
- [ ] **Read** — the component list loads from the database with search and filter
- [ ] **Update** — an existing component can be edited and the change persists
- [ ] **Delete** — a component can be removed and disappears from the list
- [ ] Login page works for all seven seeded users
- [ ] Dashboard renders with role-appropriate content

**Repository health**

- [ ] `docker compose up` works from a fresh clone
- [ ] CI green on `develop`
- [ ] Required status checks enabled on `main` and `develop`
- [ ] `README.md` documents the setup steps
- [ ] `.env` is not committed anywhere in history
- [ ] Every team member has at least one merged pull request

> The last box matters: the instructor requires all members present, and
> absentees do not receive marks for the update. Visible commit history per
> person is the evidence.

**Demo script — rehearse this once**

1. `docker compose up` — show all three containers healthy
2. Log in as `sysadmin@uiu.ac.bd` — dashboard shows the admin sidebar
3. Open Components — the seeded table loads from PostgreSQL
4. Add "Arduino Mega 2560" — it appears in the table immediately
5. Edit its unit cost — the change persists
6. Search for "Arduino" — the filter narrows the table
7. Delete the component just created — it disappears
8. Log out, log in as `student@uiu.ac.bd` — a visibly smaller sidebar, no add or delete buttons
9. Open Prisma Studio and show the row in the `Component` table

Step 8 is the one that proves RBAC. Do not skip it.

---

## 10. After 16 August — do not start these yet

For context only, so you understand where the schema is heading. The full plan
is in `LabLink_v6_Proposal.md` and `LabLink_v6_Build_Workflow.md`.

| Next        | What                                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Milestone 2 | Stock ledger, `moveStock()`, department quotas, class routine, `availableToDept()`                                                    |
| Milestone 3 | Requisitions, instructor live ordering, the five-tier resolver, the department pool, borrowing, the purchase ladder, issue and return |
| Milestone 4 | Screens, analytics, penalties, the intelligent layer, tests, deployment                                                               |

If a Milestone 1 task appears to require any of the above, it has been
misunderstood. Stop and ask.
