import { apiClient } from "./client";

export type DamageStatus = "REPORTED" | "UNDER_MAINTENANCE" | "REPAIRED" | "WRITTEN_OFF";

export interface DamageReport {
  id: string;
  componentId: string;
  requisitionId: string | null;
  qty: number;
  status: DamageStatus;
  notes: string | null;
  createdAt: string;
  component: { id: string; code: string; name: string };
  reportedBy: { id: string; fullName: string };
}

export interface DamageList {
  data: DamageReport[];
  total: number;
  page: number;
  limit: number;
}

export async function getDamageReports(params: {
  status?: DamageStatus;
  page: number;
  limit: number;
}): Promise<DamageList> {
  const response = await apiClient.get<DamageList>("/api/damage-reports", { params });
  return response.data;
}

export async function updateDamageReport(
  id: string,
  status: Exclude<DamageStatus, "REPORTED">,
  notes?: string,
): Promise<DamageReport> {
  const response = await apiClient.patch<{ data: DamageReport }>(
    `/api/damage-reports/${id}`,
    { status, notes },
  );
  return response.data.data;
}
