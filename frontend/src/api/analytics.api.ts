import { apiClient } from "./client";
import type { PeakClassesResponse } from "../types";

interface GetPeakClassesParams {
  departmentId?: string;
  from?: string;
  to?: string;
}

export async function getPeakClasses(
  params?: GetPeakClassesParams,
): Promise<PeakClassesResponse> {
  const response = await apiClient.get<PeakClassesResponse>(
    "/api/analytics/peak-classes",
    { params },
  );

  return response.data;
}

// ─── shortage frequency (task 6.8) ───────────────────────────────────────────

export interface ShortageFrequencyItem {
  componentId: string;
  componentCode: string;
  componentName: string;
  category: string;
  unit: string;
  shortageCount: number;
  totalQtyShort: number;
  avgQtyShort: number;
}

export interface ShortageFrequencyResponse {
  data: ShortageFrequencyItem[];
  total: number;
}

export async function getShortageFrequency(params?: {
  limit?: number;
  departmentId?: string;
}): Promise<ShortageFrequencyResponse> {
  const response = await apiClient.get<ShortageFrequencyResponse>(
    "/api/analytics/shortage-frequency",
    { params },
  );
  return response.data;
}
