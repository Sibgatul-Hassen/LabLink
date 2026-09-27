import { apiClient } from "./client";
import type {
  DepartmentQuota,
  DepartmentQuotaListResponse,
  QuotaHistoryListResponse,
  UpdateQuotaRequest,
} from "../types";

interface QuotaResponse {
  data: DepartmentQuota;
}

interface GetQuotasParams {
  search?: string;
  departmentId?: string;
  componentId?: string;
  category?: string;
  page?: number;
  limit?: number;
}

interface GetQuotaHistoryParams {
  page?: number;
  limit?: number;
}

export interface GenerateQuotaSuggestionsRequest {
  departmentId: string;
  from?: string;
  to?: string;
}

export interface QuotaSuggestionResult {
  department: { id: string; code: string; name: string };
  peakGroups: number;
  from: string;
  to: string;
  suggestions: { componentId: string; maxQtyPerGroup: number; suggestedQty: number }[];
}

export async function generateQuotaSuggestions(data: GenerateQuotaSuggestionsRequest): Promise<QuotaSuggestionResult> {
  const response = await apiClient.post<QuotaSuggestionResult>("/api/quotas/suggestions", data);
  return response.data;
}

export async function getQuotas(
  params?: GetQuotasParams,
): Promise<DepartmentQuotaListResponse> {
  const response = await apiClient.get<DepartmentQuotaListResponse>(
    "/api/quotas",
    {
      params,
    },
  );

  return response.data;
}

export async function getQuota(
  departmentId: string,
  componentId: string,
): Promise<DepartmentQuota> {
  const response = await apiClient.get<QuotaResponse>(
    `/api/quotas/${departmentId}/${componentId}`,
  );

  return response.data.data;
}

export async function updateQuota(
  departmentId: string,
  componentId: string,
  data: UpdateQuotaRequest,
): Promise<DepartmentQuota> {
  const response = await apiClient.patch<QuotaResponse>(
    `/api/quotas/${departmentId}/${componentId}`,
    data,
  );

  return response.data.data;
}

export async function getQuotaHistory(
  departmentId: string,
  componentId: string,
  params?: GetQuotaHistoryParams,
): Promise<QuotaHistoryListResponse> {
  const response = await apiClient.get<QuotaHistoryListResponse>(
    `/api/quotas/${departmentId}/${componentId}/history`,
    {
      params,
    },
  );

  return response.data;
}
