import { apiClient } from "./client";
import type {
  Component,
  ComponentListResponse,
  CreateComponentRequest,
  UpdateComponentRequest,
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

export async function deleteComponent(id: string): Promise<void> {
  await apiClient.delete(`/api/components/${id}`);
}
