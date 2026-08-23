import { apiClient } from "./client";
import type {
  CreateLabRequest,
  Lab,
  LabListResponse,
  UpdateLabRequest,
} from "../types";

interface LabResponse {
  data: Lab;
}

interface GetLabsParams {
  search?: string;
  departmentId?: string;
  page?: number;
  limit?: number;
}

export async function getLabs(
  params?: GetLabsParams,
): Promise<LabListResponse> {
  const response = await apiClient.get<LabListResponse>("/api/labs", {
    params,
  });
  return response.data;
}

export async function getLab(id: string): Promise<Lab> {
  const response = await apiClient.get<LabResponse>(`/api/labs/${id}`);
  return response.data.data;
}

export async function createLab(data: CreateLabRequest): Promise<Lab> {
  const response = await apiClient.post<LabResponse>("/api/labs", data);
  return response.data.data;
}

export async function updateLab(
  id: string,
  data: UpdateLabRequest,
): Promise<Lab> {
  const response = await apiClient.patch<LabResponse>(`/api/labs/${id}`, data);
  return response.data.data;
}

export async function deleteLab(id: string): Promise<void> {
  await apiClient.delete(`/api/labs/${id}`);
}
