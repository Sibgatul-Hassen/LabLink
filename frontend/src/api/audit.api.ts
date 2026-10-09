import { apiClient } from "./client";

export interface AuditEntry {
  id: string; actorId: string; action: string; entityType: string;
  entityId: string; before: unknown; after: unknown; createdAt: string;
}

export async function getAuditLogs(page = 1): Promise<{ data: AuditEntry[]; total: number; page: number; limit: number }> {
  const response = await apiClient.get("/api/audit-logs", { params: { page, limit: 20 } });
  return response.data;
}
