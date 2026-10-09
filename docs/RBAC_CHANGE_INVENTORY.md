# Changed file inventory

This inventory records the dirty worktree before the RBAC and frontend changes were integrated. Earlier frontend modernization was already present when the RBAC task began. Classification is at file level; `BOTH` received hunk-level review in the preserved separation plan. No schema, migration, dependency, or deployment edits were made during the RBAC correction itself. The later instruction to push all project changes to `develop` superseded the proposed separate-branch plan below.

| File | Classification | Reason |
| --- | --- | --- |
| `backend/src/index.ts` | RBAC REQUIRED | Registers the audit middleware and route. |
| `backend/src/jobs/scheduled.ts` | RBAC REQUIRED | Assigned-lab drafting and central-only stock alerts. |
| `backend/src/middleware/academicScope.ts` | RBAC REQUIRED | Live identity, department object scope, or write audit. |
| `backend/src/middleware/audit.ts` | RBAC REQUIRED | Live identity, department object scope, or write audit. |
| `backend/src/middleware/auth.ts` | RBAC REQUIRED | Live identity, department object scope, or write audit. |
| `backend/src/routes/audit.routes.ts` | RBAC REQUIRED | Explicit route guard, actor scope, or audit endpoint. |
| `backend/src/routes/authorization.policy.test.ts` | RBAC REQUIRED | Updated role fixtures, forbidden action assertions, or browser role journeys. |
| `backend/src/routes/availability.routes.test.ts` | RBAC REQUIRED | Authorization correction and focused verification. |
| `backend/src/routes/availability.routes.ts` | RBAC REQUIRED | Authorization correction and focused verification. |
| `backend/src/routes/borrow.routes.test.ts` | RBAC REQUIRED | Updated role fixtures, forbidden action assertions, or browser role journeys. |
| `backend/src/routes/borrow.routes.ts` | RBAC REQUIRED | Explicit route guard, actor scope, or audit endpoint. |
| `backend/src/routes/component.routes.test.ts` | RBAC REQUIRED | Updated role fixtures, forbidden action assertions, or browser role journeys. |
| `backend/src/routes/component.routes.ts` | RBAC REQUIRED | Explicit route guard, actor scope, or audit endpoint. |
| `backend/src/routes/course.routes.test.ts` | RBAC REQUIRED | Updated role fixtures, forbidden action assertions, or browser role journeys. |
| `backend/src/routes/course.routes.ts` | RBAC REQUIRED | Explicit route guard, actor scope, or audit endpoint. |
| `backend/src/routes/damage.routes.ts` | RBAC REQUIRED | Explicit route guard, actor scope, or audit endpoint. |
| `backend/src/routes/experiment.routes.test.ts` | RBAC REQUIRED | Updated role fixtures, forbidden action assertions, or browser role journeys. |
| `backend/src/routes/experiment.routes.ts` | RBAC REQUIRED | Explicit route guard, actor scope, or audit endpoint. |
| `backend/src/routes/lab.routes.ts` | RBAC REQUIRED | Explicit route guard, actor scope, or audit endpoint. |
| `backend/src/routes/penalty.routes.test.ts` | RBAC REQUIRED | Updated role fixtures, forbidden action assertions, or browser role journeys. |
| `backend/src/routes/penalty.routes.ts` | RBAC REQUIRED | Explicit route guard, actor scope, or audit endpoint. |
| `backend/src/routes/purchase.routes.test.ts` | RBAC REQUIRED | Updated role fixtures, forbidden action assertions, or browser role journeys. |
| `backend/src/routes/purchase.routes.ts` | RBAC REQUIRED | Explicit route guard, actor scope, or audit endpoint. |
| `backend/src/routes/quota-suggestion.routes.test.ts` | RBAC REQUIRED | Updated role fixtures, forbidden action assertions, or browser role journeys. |
| `backend/src/routes/quota.routes.test.ts` | RBAC REQUIRED | Updated role fixtures, forbidden action assertions, or browser role journeys. |
| `backend/src/routes/quota.routes.ts` | RBAC REQUIRED | Explicit route guard, actor scope, or audit endpoint. |
| `backend/src/routes/requisition.routes.test.ts` | RBAC REQUIRED | Updated role fixtures, forbidden action assertions, or browser role journeys. |
| `backend/src/routes/requisition.routes.ts` | RBAC REQUIRED | Explicit route guard, actor scope, or audit endpoint. |
| `backend/src/routes/routine-import.test.ts` | RBAC REQUIRED | Updated role fixtures, forbidden action assertions, or browser role journeys. |
| `backend/src/routes/routine-slot.routes.test.ts` | RBAC REQUIRED | Updated role fixtures, forbidden action assertions, or browser role journeys. |
| `backend/src/routes/routine-slot.routes.ts` | RBAC REQUIRED | Explicit route guard, actor scope, or audit endpoint. |
| `backend/src/routes/section.routes.test.ts` | RBAC REQUIRED | Updated role fixtures, forbidden action assertions, or browser role journeys. |
| `backend/src/routes/section.routes.ts` | RBAC REQUIRED | Explicit route guard, actor scope, or audit endpoint. |
| `backend/src/routes/session.routes.test.ts` | RBAC REQUIRED | Updated role fixtures, forbidden action assertions, or browser role journeys. |
| `backend/src/routes/session.routes.ts` | RBAC REQUIRED | Explicit route guard, actor scope, or audit endpoint. |
| `backend/src/routes/stock.routes.test.ts` | RBAC REQUIRED | Updated role fixtures, forbidden action assertions, or browser role journeys. |
| `backend/src/routes/stock.routes.ts` | RBAC REQUIRED | Explicit route guard, actor scope, or audit endpoint. |
| `backend/src/routes/suggestion.routes.ts` | RBAC REQUIRED | Explicit route guard, actor scope, or audit endpoint. |
| `backend/src/schemas/penalty.schema.ts` | RBAC REQUIRED | Authorization correction, API contract, or focused verification. |
| `backend/src/services/academic-read-scope.ts` | RBAC REQUIRED | Object-level authorization and workflow role checks. |
| `backend/src/services/availability.service.ts` | RBAC REQUIRED | Authorization correction and focused verification. |
| `backend/src/services/borrow.service.ts` | RBAC REQUIRED | Object-level authorization and workflow role checks. |
| `backend/src/services/course.service.ts` | RBAC REQUIRED | Object-level authorization and workflow role checks. |
| `backend/src/services/damage.service.ts` | RBAC REQUIRED | Object-level authorization and workflow role checks. |
| `backend/src/services/experiment.service.ts` | RBAC REQUIRED | Object-level authorization and workflow role checks. |
| `backend/src/services/lab.service.ts` | RBAC REQUIRED | Object-level authorization and workflow role checks. |
| `backend/src/services/penalty.service.ts` | RBAC REQUIRED | Object-level authorization and workflow role checks. |
| `backend/src/services/purchase.service.ts` | RBAC REQUIRED | Object-level authorization and workflow role checks. |
| `backend/src/services/requisition.service.ts` | RBAC REQUIRED | Object-level authorization and workflow role checks. |
| `backend/src/services/routine-import.service.ts` | RBAC REQUIRED | Object-level authorization and workflow role checks. |
| `backend/src/services/routine-slot.service.ts` | RBAC REQUIRED | Object-level authorization and workflow role checks. |
| `backend/src/services/section.service.ts` | RBAC REQUIRED | Object-level authorization and workflow role checks. |
| `backend/src/services/session.service.ts` | RBAC REQUIRED | Object-level authorization and workflow role checks. |
| `backend/src/services/suggestion-generators.service.test.ts` | RBAC REQUIRED | Updated role fixtures, forbidden action assertions, or browser role journeys. |
| `backend/src/services/suggestion-generators.service.ts` | RBAC REQUIRED | Object-level authorization and workflow role checks. |
| `backend/src/services/suggestion.service.test.ts` | RBAC REQUIRED | Updated role fixtures, forbidden action assertions, or browser role journeys. |
| `backend/src/services/suggestion.service.ts` | RBAC REQUIRED | Object-level authorization and workflow role checks. |
| `docs/RBAC_CHANGE_INVENTORY.md` | RBAC REQUIRED | This review inventory. |
| `docs/RBAC_PERMISSION_MATRIX.md` | RBAC REQUIRED | Authorization documentation. |
| `frontend/browser-tests/interaction.test.cjs` | BOTH | Updated role fixtures, forbidden action assertions, or browser role journeys. |
| `frontend/index.html` | PRE-EXISTING FRONTEND MODERNIZATION | Existing frontend modernization retained in the shared worktree. |
| `frontend/package-lock.json` | PRE-EXISTING FRONTEND MODERNIZATION | Existing frontend modernization retained in the shared worktree. |
| `frontend/package.json` | PRE-EXISTING FRONTEND MODERNIZATION | Existing frontend modernization retained in the shared worktree. |
| `frontend/public/favicon.svg` | PRE-EXISTING FRONTEND MODERNIZATION | Existing frontend modernization retained in the shared worktree. |
| `frontend/src/App.tsx` | BOTH | Existing frontend modernization retained in the shared worktree. |
| `frontend/src/api/audit.api.ts` | RBAC REQUIRED | System-admin audit read view. |
| `frontend/src/api/borrow.api.ts` | BOTH | Frontend API integration or corrected role documentation. |
| `frontend/src/api/penalty.api.ts` | RBAC REQUIRED | Authorization correction and focused verification. |
| `frontend/src/api/purchase.api.ts` | BOTH | Frontend API integration or corrected role documentation. |
| `frontend/src/api/quota.api.ts` | BOTH | Frontend API integration or corrected role documentation. |
| `frontend/src/api/requisition.api.ts` | BOTH | Frontend API integration or corrected role documentation. |
| `frontend/src/api/stock.api.ts` | BOTH | Frontend API integration or corrected role documentation. |
| `frontend/src/assets/react.svg` | PRE-EXISTING FRONTEND MODERNIZATION | Existing frontend modernization retained in the shared worktree. |
| `frontend/src/auth/permissions.ts` | RBAC REQUIRED | Role-specific route and navigation visibility. |
| `frontend/src/components/Layout.tsx` | BOTH | Role-specific route and navigation visibility. |
| `frontend/src/components/NotificationBell.tsx` | PRE-EXISTING FRONTEND MODERNIZATION | Existing frontend modernization retained in the shared worktree. |
| `frontend/src/components/ProtectedRoute.tsx` | RBAC REQUIRED | Role-specific route and navigation visibility. |
| `frontend/src/components/PurchaseActions.tsx` | PRE-EXISTING FRONTEND MODERNIZATION | Existing frontend modernization retained in the shared worktree. |
| `frontend/src/components/QuotaSuggestionDialog.tsx` | PRE-EXISTING FRONTEND MODERNIZATION | Existing frontend modernization retained in the shared worktree. |
| `frontend/src/components/StockTransferDialog.tsx` | PRE-EXISTING FRONTEND MODERNIZATION | Existing frontend modernization retained in the shared worktree. |
| `frontend/src/components/ui/AppDialogProvider.tsx` | PRE-EXISTING FRONTEND MODERNIZATION | Existing frontend modernization retained in the shared worktree. |
| `frontend/src/components/ui/ToastViewport.tsx` | PRE-EXISTING FRONTEND MODERNIZATION | Existing frontend modernization retained in the shared worktree. |
| `frontend/src/components/ui/dialog.ts` | PRE-EXISTING FRONTEND MODERNIZATION | Existing frontend modernization retained in the shared worktree. |
| `frontend/src/components/ui/toast.ts` | PRE-EXISTING FRONTEND MODERNIZATION | Existing frontend modernization retained in the shared worktree. |
| `frontend/src/main.tsx` | PRE-EXISTING FRONTEND MODERNIZATION | Existing frontend modernization retained in the shared worktree. |
| `frontend/src/pages/AuditLogs.tsx` | RBAC REQUIRED | System-admin audit read view. |
| `frontend/src/pages/BorrowRequests.tsx` | BOTH | Role-specific page actions, scoped forms, and read-only states. |
| `frontend/src/pages/ClassSessions.tsx` | BOTH | Role-specific page actions, scoped forms, and read-only states. |
| `frontend/src/pages/Components.tsx` | BOTH | Role-specific page actions, scoped forms, and read-only states. |
| `frontend/src/pages/Courses.tsx` | BOTH | Role-specific page actions, scoped forms, and read-only states. |
| `frontend/src/pages/DamageReports.tsx` | BOTH | Role-specific page actions, scoped forms, and read-only states. |
| `frontend/src/pages/Dashboard.tsx` | BOTH | Seven role-specific dashboard experiences. |
| `frontend/src/pages/Departments.tsx` | BOTH | Role-specific page actions, scoped forms, and read-only states. |
| `frontend/src/pages/Experiments.tsx` | BOTH | Role-specific page actions, scoped forms, and read-only states. |
| `frontend/src/pages/Labs.tsx` | BOTH | Role-specific page actions, scoped forms, and read-only states. |
| `frontend/src/pages/Login.tsx` | PRE-EXISTING FRONTEND MODERNIZATION | Role-specific page actions, scoped forms, and read-only states. |
| `frontend/src/pages/Penalties.tsx` | BOTH | Role-specific page actions, scoped forms, and read-only states. |
| `frontend/src/pages/PurchaseRequests.tsx` | BOTH | Role-specific page actions, scoped forms, and read-only states. |
| `frontend/src/pages/Quotas.tsx` | BOTH | Role-specific page actions, scoped forms, and read-only states. |
| `frontend/src/pages/Requisitions.tsx` | BOTH | Role-specific page actions, scoped forms, and read-only states. |
| `frontend/src/pages/RoleDashboard.tsx` | RBAC REQUIRED | Seven role-specific dashboard experiences. |
| `frontend/src/pages/RoutineSlots.tsx` | BOTH | Role-specific page actions, scoped forms, and read-only states. |
| `frontend/src/pages/Sections.tsx` | BOTH | Role-specific page actions, scoped forms, and read-only states. |
| `frontend/src/pages/Stocks.tsx` | BOTH | Role-specific page actions, scoped forms, and read-only states. |
| `frontend/src/pages/Suggestions.tsx` | BOTH | Role-specific page actions, scoped forms, and read-only states. |
| `frontend/src/pages/Users.tsx` | BOTH | Role-specific page actions, scoped forms, and read-only states. |
| `frontend/src/styles/design.css` | PRE-EXISTING FRONTEND MODERNIZATION | Existing frontend modernization retained in the shared worktree. |
| `frontend/tests/api-contract.test.cjs` | RBAC REQUIRED | Authorization correction and focused verification. |
| `frontend/tests/server.test.cjs` | RBAC REQUIRED | Authorization correction and focused verification. |
| `frontend/vite.config.ts` | PRE-EXISTING FRONTEND MODERNIZATION | Existing frontend modernization retained in the shared worktree. |
| `full-git-history.txt` | TEMPORARY / GENERATED / SHOULD NOT COMMIT | Local history export; leave untracked. |

Classification counts: {'RBAC REQUIRED': 67, 'PRE-EXISTING FRONTEND MODERNIZATION': 17, 'BOTH': 26, 'TEMPORARY / GENERATED / SHOULD NOT COMMIT': 1}.

## Safe separation before committing

1. Preserve a complete copy of this dirty worktree, including untracked files, outside Git before any staging or branch switch. Do not run `git clean` or reset.
2. Review every `BOTH` file with `git diff` and `git add -p` only when committing is authorized. Put the already-existing frontend modernization hunks on a dedicated frontend branch first; put RBAC hunks and RBAC-only files on the RBAC branch. New untracked mixed files need manual copy or split because interactive staging cannot select an untracked file's hunks until an intent-to-add step.
3. Keep `full-git-history.txt`, `.env`, build output, and local database data outside commits. Compare staged files and hunks with this inventory before either commit.
4. Run the required checks again on each separated branch. No staging, commit, push, merge, or branch switch was performed during this original audit pass.

## Pre-integration Git snapshot

Branch: `fix/rbac-role-permissions-v1`. All listed paths were unstaged when this snapshot was captured.

```text
 M backend/src/index.ts
 M backend/src/jobs/scheduled.ts
 M backend/src/middleware/auth.ts
 M backend/src/routes/availability.routes.test.ts
 M backend/src/routes/availability.routes.ts
 M backend/src/routes/borrow.routes.test.ts
 M backend/src/routes/borrow.routes.ts
 M backend/src/routes/component.routes.test.ts
 M backend/src/routes/component.routes.ts
 M backend/src/routes/course.routes.test.ts
 M backend/src/routes/course.routes.ts
 M backend/src/routes/damage.routes.ts
 M backend/src/routes/experiment.routes.test.ts
 M backend/src/routes/experiment.routes.ts
 M backend/src/routes/lab.routes.ts
 M backend/src/routes/penalty.routes.test.ts
 M backend/src/routes/penalty.routes.ts
 M backend/src/routes/purchase.routes.test.ts
 M backend/src/routes/purchase.routes.ts
 M backend/src/routes/quota-suggestion.routes.test.ts
 M backend/src/routes/quota.routes.test.ts
 M backend/src/routes/quota.routes.ts
 M backend/src/routes/requisition.routes.test.ts
 M backend/src/routes/requisition.routes.ts
 M backend/src/routes/routine-import.test.ts
 M backend/src/routes/routine-slot.routes.test.ts
 M backend/src/routes/routine-slot.routes.ts
 M backend/src/routes/section.routes.test.ts
 M backend/src/routes/section.routes.ts
 M backend/src/routes/session.routes.test.ts
 M backend/src/routes/session.routes.ts
 M backend/src/routes/stock.routes.test.ts
 M backend/src/routes/stock.routes.ts
 M backend/src/routes/suggestion.routes.ts
 M backend/src/schemas/penalty.schema.ts
 M backend/src/services/availability.service.ts
 M backend/src/services/borrow.service.ts
 M backend/src/services/course.service.ts
 M backend/src/services/damage.service.ts
 M backend/src/services/experiment.service.ts
 M backend/src/services/lab.service.ts
 M backend/src/services/penalty.service.ts
 M backend/src/services/purchase.service.ts
 M backend/src/services/requisition.service.ts
 M backend/src/services/routine-import.service.ts
 M backend/src/services/routine-slot.service.ts
 M backend/src/services/section.service.ts
 M backend/src/services/session.service.ts
 M backend/src/services/suggestion-generators.service.test.ts
 M backend/src/services/suggestion-generators.service.ts
 M backend/src/services/suggestion.service.test.ts
 M backend/src/services/suggestion.service.ts
 M frontend/browser-tests/interaction.test.cjs
 M frontend/index.html
 M frontend/package-lock.json
 M frontend/package.json
 M frontend/src/App.tsx
 M frontend/src/api/borrow.api.ts
 M frontend/src/api/penalty.api.ts
 M frontend/src/api/purchase.api.ts
 M frontend/src/api/quota.api.ts
 M frontend/src/api/requisition.api.ts
 M frontend/src/api/stock.api.ts
 D frontend/src/assets/react.svg
 M frontend/src/components/Layout.tsx
 M frontend/src/components/NotificationBell.tsx
 M frontend/src/components/ProtectedRoute.tsx
 M frontend/src/main.tsx
 M frontend/src/pages/BorrowRequests.tsx
 M frontend/src/pages/ClassSessions.tsx
 M frontend/src/pages/Components.tsx
 M frontend/src/pages/Courses.tsx
 M frontend/src/pages/DamageReports.tsx
 M frontend/src/pages/Dashboard.tsx
 M frontend/src/pages/Departments.tsx
 M frontend/src/pages/Experiments.tsx
 M frontend/src/pages/Labs.tsx
 M frontend/src/pages/Login.tsx
 M frontend/src/pages/Penalties.tsx
 M frontend/src/pages/PurchaseRequests.tsx
 M frontend/src/pages/Quotas.tsx
 M frontend/src/pages/Requisitions.tsx
 M frontend/src/pages/RoutineSlots.tsx
 M frontend/src/pages/Sections.tsx
 M frontend/src/pages/Stocks.tsx
 M frontend/src/pages/Suggestions.tsx
 M frontend/src/pages/Users.tsx
 M frontend/tests/api-contract.test.cjs
 M frontend/tests/server.test.cjs
 M frontend/vite.config.ts
?? backend/src/middleware/academicScope.ts
?? backend/src/middleware/audit.ts
?? backend/src/routes/audit.routes.ts
?? backend/src/routes/authorization.policy.test.ts
?? backend/src/services/academic-read-scope.ts
?? docs/RBAC_CHANGE_INVENTORY.md
?? docs/RBAC_PERMISSION_MATRIX.md
?? frontend/public/favicon.svg
?? frontend/src/api/audit.api.ts
?? frontend/src/auth/permissions.ts
?? frontend/src/components/PurchaseActions.tsx
?? frontend/src/components/QuotaSuggestionDialog.tsx
?? frontend/src/components/StockTransferDialog.tsx
?? frontend/src/components/ui/AppDialogProvider.tsx
?? frontend/src/components/ui/ToastViewport.tsx
?? frontend/src/components/ui/dialog.ts
?? frontend/src/components/ui/toast.ts
?? frontend/src/pages/AuditLogs.tsx
?? frontend/src/pages/RoleDashboard.tsx
?? frontend/src/styles/design.css
?? full-git-history.txt
```
