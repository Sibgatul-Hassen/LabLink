# LabLink V6 authorization matrix

Source: `LabLink_v6_Proposal.md` section 6 and sections 7–11, `LabLink_v6_Build_Workflow.md`, and the requested V6 role model. Authority and scope are independent: **GLOBAL SCOPE DOES NOT MEAN GLOBAL AUTHORITY**.

## Baseline audit (before RBAC correction)

| Route / action | Method | Current allowed roles | Current scope enforcement | Expected roles | Expected scope | Problem | Severity |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Login / own profile | POST / GET | Public / all | JWT on profile | Same | Own identity | Login is intentionally public; token carries role and department | Low |
| User administration | CRUD | System Admin | Global | System Admin | Global system | Appropriate, but no audit read route | Medium |
| Department structure | CRUD | System Admin writes; all read | Global | System Admin writes; scoped read | Structural / department | Read detail and list are broadly visible | Low |
| Component catalogue and substitutes | CRUD | Central Store or System Admin writes; all read | No meaningful object scope | Central Store writes; relevant roles read | Global catalogue | System Admin can mutate operational catalogue | High |
| Stock, reorder point, adjustment, spare transfer | GET/PATCH/POST | All read; Central Store or System Admin write | Global stock | Central Store writes; constrained reads | Global central inventory | System Admin can change physical stock and spare allocations | Critical |
| Quota suggestions and edits | GET/POST/PATCH | All read; Central Store or System Admin write | Basic department middleware on reads | Central Store writes; scoped reads | Department / global | System Admin can operationally change quotas | High |
| Academic courses, sections, labs, routine, experiments | CRUD | System Admin writes; all read | Some query filtering; write IDs not department checked | Department Store Head writes; assigned instructor/lab reads | Department / section / lab | System Admin owns business CRUD; cross-department IDOR risk | Critical |
| Class sessions and experiment assignment | GET/POST/PATCH | System Admin creates; Instructor or System Admin assigns | Instructor check has System Admin bypass | Assigned instructor assigns; department manages schedule | Section / lab / department | System Admin can alter sessions; broad reads | High |
| Requisition draft, lines, submit, cancel | CRUD/actions | Many routes accept all roles | Service ownership has System Admin bypass; reads use department rather than instructor/lab assignments | Student own personal, instructor own live, lab assistant assigned lab | Own / section / lab / department | Operational bypass and cross-scope access | Critical |
| Issue and return | POST | Central Store or System Admin | Business state checked; weak role separation | Central Store issue; lab assistant assigned-lab reconcile | Global issue / assigned lab return | System Admin can issue and reconcile | Critical |
| Borrow create, approve, reject, handover, return | POST | Department Head, Central Store, Office Admin, System Admin on create; Department Head/Central/System on actions | Service compares department except broad unscoped roles | Lending Department Head approves; scoped actors handle lifecycle | Lending / borrowing department | Global roles can act as lender; route permits System Admin | Critical |
| Purchase create, queue, decision, receipt | POST/GET | Lab Assistant, Department Head, Central, System create; Department Head/Central/Office/System decide; Central/System receive | Current rung role only; no rung-1 department check | Department Head → Central → Office; Central receives | Department at rung 1 / global later | Ladder reversed; System Admin can receive; department heads can decide any department's request | Critical |
| Damage list and maintenance | GET/PATCH | Central Store and System Admin | Global | Assigned Lab Assistant acts; instructor reports own running session | Lab / section | Wrong actor owns maintenance; System Admin operational mutation | High |
| Penalties, rates, payment, waiver | GET/PUT/POST | All read; Office Admin/System Admin write | Student own list; department list; payment/waiver no actor scope | Department Head waives, Central pays; system config rates | Own / department / global | Wrong finance actors, no waiver department check | Critical |
| Suggestions generation and review | GET/POST/PATCH | Lab Assistant, Department Head, Central, System review; Central/System generate | Target role check allows System Admin bypass; payload department filter only | Exact target role and object scope | Section / lab / department / global | System Admin can review anyone's proposal; instructor cannot review item-list | Critical |
| Analytics | GET | Department Head, Central, Office, System | Department Head query forced to own department | Department, Central, Office; optional System read-only | Department / global | System Admin business analytics visibility needs justification | Medium |
| Notifications | GET/PATCH | All roles | Own user ID | All roles | Own | Existing ownership appears correct | Low |
| Frontend routes, nav, actions, dashboard | UI | Every signed-in role can open every route; sidebar partly filtered; generic dashboard | Browser only; backend guards vary | Seven distinct role menus, route guards, scoped actions and dashboards | Mirrors server | Direct URLs expose pages; System Admin sees business workflows; dashboard reveals global stock to all | High |

Cross-scope IDOR cases requiring explicit tests: a department head editing another department's course/section/routine, instructor assigning another instructor's session, lab assistant submitting or returning another lab's requisition, student opening another student's requisition or penalty, department head approving another department's borrow or purchase, and a suggestion reviewer acting on a foreign target.

## Final role and endpoint policy

Abbreviations: S = Student, I = Instructor, L = Lab Assistant, D = Department Store Head, C = Central Store Officer, O = Office Admin, A = System Admin. A read permission never implies a write or approval permission. Protected routes require a live, active account; the server reloads the role and department on every request.

| Route family / action | Method | Allowed role(s) | Object scope and state | Everyone else |
| --- | --- | --- | --- | --- |
| `/auth/login`, `/auth/me` | POST, GET | Public login; all roles own profile | Active account; bearer token on profile | 401 |
| `/users` and `/users/:id`, password | CRUD | A | Account and assignment administration; self-lockout blocked | 403 |
| `/audit-logs` | GET | A | Global, paginated audit metadata | 403 |
| `/departments` | GET; write | All read; A write | Structural records; active state and uniqueness | 403 on write |
| `/components`, `/components/:id`, substitute links | GET; write | All read; C write | Global catalogue; active records and valid substitute pairing | 403 on write |
| `/availability` | GET | All roles | S sees only personal spare-pool and physical availability, without teaching-quota fields; I/L/D see own department; C/O/A may query departments | 403 for invalid target |
| `/stocks`, movements | GET | C/O/A | Global stock read; no mutation through GET | 403 |
| `/stocks` reorder, adjust, transfer | PATCH/POST | C | Physical quantities, spare balance, and transfer constraints | 403 |
| `/quotas`, history | GET | D/C/O/A | D own department; C/O/A global read | 403 |
| `/quotas/suggestions`, `/quotas/:departmentId/:componentId` | POST/PATCH | C | Active department/component; confirmed change records reason/history | 403 |
| `/courses`, `/sections`, `/routine-slots`, `/experiments` and experiment items | GET; write | I/L/D/C/O/A read; D write | I assigned sections; L assigned sections/labs; D own department; C/O/A read only global. Write target IDs are resolved server side. | 403 |
| `/labs` | GET; write | L/D/C/O/A read; A write | L assigned lab; D own department; C/O/A read global. Lab structure is system configuration. | 403 |
| `/sections/assignees` | GET | D/A | D own department; A global account assignment support | 403 |
| `/routine-slots/import` | POST | D | Every imported row prevalidated to own department; conflicts reported per row | 403 |
| `/sessions`, `/sessions/:id` | GET | I/L/D/C/O/A | I assigned section; L assigned section/lab; D department; C/O/A global read | 403 |
| `/sessions/generate` | POST | C | Scheduled generation; no administrative override | 403 |
| `/sessions/:id/experiment`, `/sessions/:id/live-order` | PATCH/POST | I | Assigned section, experiment in same course; live order for own class session | 403 |
| `/sessions/:id/draft-requisition` | POST | L | Assigned section or lab; one draft per session | 403 |
| `/requisitions` and detail | GET | S/I/L/D/C/O/A | S own personal; I assigned class; L assigned lab class/own maintenance; D own department; C/O/A global read | 403 |
| `/requisitions` create, edit, lines, submit, cancel | POST/PATCH/DELETE | S own personal; L assigned class/own maintenance | Owner, assignment, draft/status, and penalty threshold checks | 403 |
| `/requisitions/:id/issue*` | GET/POST | C | Ready state and allocation/stock checks | 403 |
| `/requisitions/:id/return*` | GET/POST | C or assigned L | Issued state, quantity reconciliation, lab assignment | 403 |
| `/borrow-requests` create, incoming/outgoing, detail | POST/GET | D writes; D/C/O read | D borrower/lender department; C/O global read. Lender search excludes own department. | 403 |
| `/borrow-requests/:id/{approve,reject,handover,return}` | POST | D | Exact lending/borrowing department as action requires; valid state | 403 |
| `/purchase-requests` create/list/detail | POST/GET | L/D/C create; L/D/C/O read | L own submitted; D department; C/O global read | 403 |
| `/purchase-requests/aggregate` | POST | C | Reconcile within same component, urgency, department, and rung | 403 |
| `/purchase-requests/queue`, `/:id/decide` | GET/POST | D rung 1, C rung 2, O rung 3 | Pending current step, exact role; D requesting department only. Departmentless office reorder starts at rung 2. | 403 |
| `/purchase-requests/:id/receive` | POST | C | Fully approved, not yet received; receipt increases stock | 403 |
| `/damage-reports` list/status | GET/PATCH | L/D/C read; L alone changes status | L assigned class lab; D department read; C global read. Valid maintenance transition. | 403 |
| `/penalties`, rates, block status | GET | S/D/C/O/A penalties; all block status | S own; D own department; C/O/A global read; own balance on block status | 403 |
| `/penalty-rates` | PUT | A | System configuration, including block threshold | 403 |
| `/penalties/:id/pay`, `/:id/waive` | POST | C pays; D waives | Personal return atomically creates configured late/loss/damage penalties; D may waive only own department | 403 |
| `/suggestions` | GET | S/I/L/D/C | Target role and evidence scope; S sees only slot hints explicitly tagged with own `studentId` | 403 |
| `/suggestions/generate`, `/:id/decision` | POST/PATCH | C generates; exact target I/L/D/C decides | Assigned section/lab/department or global operational target; pending state | 403 |
| `/analytics/*` | GET | D/C/O/A | D department; C/O global; A support read only | 403 |
| `/notifications`, `/:id/read` | GET/PATCH | All roles | Own recipient only | 403 |

## Frontend policy

| Role | Main workspace | Business actions surfaced |
| --- | --- | --- |
| S | Own requests, penalties, catalogue, slot suggestions | Own personal request and return tracking |
| I | Assigned sessions, sections, experiments, live orders | Assign experiment and place live class order |
| L | Assigned labs, sessions, class requests, damage | Draft class request, reconcile assigned return, update damage |
| D | Department academics, borrow, purchase rung 1, penalties | Department schedule edits, lender approval, rung 1, own-department waiver |
| C | Inventory dashboard, stock, quotas, issue/return, purchasing | Stock changes, issue, rung 2, receipt, penalty payment |
| O | University analytics, operational read views, purchase rung 3 | Final purchase approval only |
| A | Users, departments, audit logs, penalty configuration | Account/structure/configuration writes only; business pages are read only where enabled |

The route guard rejects a direct URL outside the role's page map and returns to the dashboard. Buttons are separately hidden or disabled according to role and business state. API guards and object checks enforce the same policy independently of the UI.

System Admin's normal sidebar and command search show only Dashboard, Users, Departments, Labs, Penalty Configuration, and Audit Logs. The backend still allows read-only support access to component catalogue, global stocks and movements, quotas and history, courses, sections and assignees, routine slots, experiments, labs, sessions, requisitions, penalties and rates, analytics, and department availability. These views help diagnose records and account assignments; their write endpoints retain operational role guards. The direct frontend routes for those support views remain available where `pageRoles` permits them, but are absent from normal System Admin navigation.

## Resolved workflow ambiguity — central low-stock purchase

A department-caused purchase has a requesting department and follows Department Store Head → Central Store Officer → Office Admin. A pure office-wide low-stock reorder has no requesting department, so there is no department head who can own rung 1. It starts at Central Store Officer's rung 2 and proceeds to Office Admin's rung 3. This is an explicit workflow resolution, not a claim that the original V6 proposal specified a departmentless rung.

## Scope rules and known limits

- Object IDs are resolved in the service or middleware before mutation. Caller supplied department IDs cannot promote an instructor, lab assistant, or department head into another scope. Cross-scope access returns 403; absent IDs return 404 where distinct.
- Borrow approval belongs to the lender's department head. Purchase rung 1 belongs to the requesting department head. Rungs 2 and 3 belong to Central and Office respectively; System Admin has no approval rung.
- A personal requisition's successful return creates late, loss, and damage penalties inside the same transaction when the corresponding rates are configured. Missing rates or missing component unit costs cannot yield a monetary charge; a fresh installation should configure these before use. Skipped charges are not assessed retroactively. There is no manual assessment endpoint. Central can record payments; the owning department head can waive with a reason.
- Personal requisitions reserve only central spare stock, limited by simultaneous physical stock. They cannot allocate department teaching quota, substitutes from teaching quota, interdepartment borrowing, or automatically raise a department purchase. An uncovered personal request remains submitted with its shortfall shown. Student availability uses the same spare and physical limits.
- Return reconciliation and central receipt share one atomic endpoint today. An assigned Lab Assistant may reconcile a class return; Central may receive and reconcile globally. This records good, damaged, lost, and used-up quantities together, with one return state transition. Neither role gains issue, maintenance, or other permissions from this shared return action. A separate receipt step would require a later state-machine change.
- A personal return can create a damage report without a class lab assignment. Lab Assistants cannot mutate that report under the assigned-lab maintenance rule, and Central remains read only. A separate personal-item maintenance owner or central receipt operation requires a later workflow decision; this pass does not widen maintenance authority.
- The schema has no student-to-section enrollment relation. The current slot generator does not tag a `studentId`, so students see no slot hints until such a link exists. Department-wide slot hints are never exposed as an individual student's own data.
- No schema or endpoint was added for an instructor to submit a stand-alone damage report during a running class. Current damage rows arise from return reconciliation. This V6 possibility needs a separate workflow decision rather than an invented write path.
- Successful authenticated API writes create metadata-only audit entries after the response. This audit is asynchronous and is not an atomic part of the business transaction. Login failures and background jobs are not recorded by this middleware.
- Browser automation uses a mock API. The backend integration suite runs against a fresh migrated local PostgreSQL database; a browser journey against that real API/database is still a separate validation step.
