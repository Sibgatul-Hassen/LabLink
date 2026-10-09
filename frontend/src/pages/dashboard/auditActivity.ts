import type { AuditEntry } from "../../api/audit.api";
import type { Activity } from "./Shared";
import { shortDate } from "./data";

const resourceNames: Record<string, string> = {
  requisitions: "Requisition",
  "purchase-requests": "Purchase request",
  "borrow-requests": "Borrow request",
  components: "Component",
  stocks: "Stock",
  quotas: "Quota",
  courses: "Course",
  sections: "Section",
  labs: "Lab",
  "routine-slots": "Routine slot",
  sessions: "Class session",
  experiments: "Experiment",
  "damage-reports": "Damage report",
  penalties: "Penalty",
  "penalty-rates": "Penalty rate",
  suggestions: "Suggestion",
  users: "User",
  departments: "Department",
};

const actionNames: Record<string, string> = {
  submit: "submitted",
  issue: "issued",
  return: "returned",
  cancel: "cancelled",
  approve: "approved",
  reject: "rejected",
  receive: "received",
  pay: "paid",
  waive: "waived",
  "hand-over": "handed over",
};

function compactId(id: string): string {
  return id.length > 18 ? `${id.slice(0, 10)}…${id.slice(-4)}` : id;
}

export function auditActivity(entry: AuditEntry): Activity {
  const match = /^(POST|PUT|PATCH|DELETE)\s+(\/\S+)/.exec(entry.action);
  const method = match?.[1] ?? entry.action;
  const path = entry.entityId.startsWith("/") ? entry.entityId : match?.[2] ?? "";
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "api") parts.shift();
  const resource = resourceNames[parts[0] ?? ""] ?? entry.entityType.replace(/[-_]/g, " ");
  const subject = resource.charAt(0).toUpperCase() + resource.slice(1);
  const operation = parts[parts.length - 1];

  let title: string;
  if (parts[0] === "requisitions" && operation === "lines") title = "Component added to requisition";
  else if (parts[0] === "requisitions" && parts.includes("lines") && method === "PATCH") title = "Requisition line updated";
  else if (parts[0] === "requisitions" && parts.includes("lines") && method === "DELETE") title = "Requisition line removed";
  else if (operation && actionNames[operation]) title = `${subject} ${actionNames[operation]}`;
  else if (method === "POST" && parts.length === 1) title = `${subject} created`;
  else if (["PATCH", "PUT", "UPDATE"].includes(method)) title = `${subject} updated`;
  else if (method === "DELETE") title = `${subject} deleted`;
  else title = `${subject} action recorded`;

  const recordId = parts.length > 1 && !actionNames[parts[1]] ? parts[1] : !path ? entry.entityId : null;
  return {
    id: entry.id,
    title,
    detail: `${shortDate(entry.createdAt)} · ${subject}${recordId ? ` ${compactId(recordId)}` : ""}`,
    badge: method,
  };
}
