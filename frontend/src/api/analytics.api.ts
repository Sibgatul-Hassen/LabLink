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
