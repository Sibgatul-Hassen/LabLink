import { apiClient } from "./client";
import type {
  Component,
  ComponentListResponse,
  ComponentSubstituteListResponse,
  CreateComponentRequest,
  CreateComponentSubstituteRequest,
  UpdateComponentRequest,
  UpdateComponentSubstituteRequest,
} from "../types";

interface ComponentResponse {
  data: Component;
}

interface GetComponentsParams {
  search?: string;
  category?: string;
  page?: number;
  limit?: number;
}

export async function getComponents(
  params?: GetComponentsParams,
): Promise<ComponentListResponse> {
  const response = await apiClient.get<ComponentListResponse>(
    "/api/components",
    {
      params,
    },
  );

  return response.data;
}

export async function downloadComponentsCsv(
  params?: GetComponentsParams,
): Promise<void> {
  const response = await apiClient.get(
    "/api/components/export/csv",
    {
      params,
      responseType: "blob",
    },
  );

  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", "components.csv");
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function getComponent(id: string): Promise<Component> {
  const response = await apiClient.get<ComponentResponse>(
    `/api/components/${id}`,
  );

  return response.data.data;
}

export async function createComponent(
  data: CreateComponentRequest,
): Promise<Component> {
  const response = await apiClient.post<ComponentResponse>(
    "/api/components",
    data,
  );

  return response.data.data;
}

export async function updateComponent(
  id: string,
  data: UpdateComponentRequest,
): Promise<Component> {
  const response = await apiClient.patch<ComponentResponse>(
    `/api/components/${id}`,
    data,
  );

  return response.data.data;
}

export async function getComponentSubstitutes(
  componentId: string,
): Promise<ComponentSubstituteListResponse> {
  const response = await apiClient.get<ComponentSubstituteListResponse>(
    `/api/components/${componentId}/substitutes`,
  );

  return response.data;
}

export async function addComponentSubstitute(
  componentId: string,
  data: CreateComponentSubstituteRequest,
): Promise<ComponentSubstituteListResponse> {
  const response = await apiClient.post<ComponentSubstituteListResponse>(
    `/api/components/${componentId}/substitutes`,
    data,
  );

  return response.data;
}

export async function updateComponentSubstitute(
  componentId: string,
  subId: string,
  data: UpdateComponentSubstituteRequest,
): Promise<ComponentSubstituteListResponse> {
  const response = await apiClient.patch<ComponentSubstituteListResponse>(
    `/api/components/${componentId}/substitutes/${subId}`,
    data,
  );

  return response.data;
}

export async function deleteComponentSubstitute(
  componentId: string,
  subId: string,
): Promise<ComponentSubstituteListResponse> {
  const response = await apiClient.delete<ComponentSubstituteListResponse>(
    `/api/components/${componentId}/substitutes/${subId}`,
  );

  return response.data;
}

export async function deleteComponent(id: string): Promise<void> {
  await apiClient.delete(`/api/components/${id}`);
}
