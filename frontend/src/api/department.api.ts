import { apiClient } from "./client";
import type {
  CreateDepartmentRequest,
  Department,
  DepartmentListResponse,
  UpdateDepartmentRequest,
} from "../types";

interface DepartmentResponse {
  data: Department;
}

interface GetDepartmentsParams {
  search?: string;
  page?: number;
  limit?: number;
}

export async function getDepartments(
  params?: GetDepartmentsParams,
): Promise<DepartmentListResponse> {
  const response = await apiClient.get<DepartmentListResponse>(
    "/api/departments",
    {
      params,
    },
  );

  return response.data;
}

export async function getDepartment(id: string): Promise<Department> {
  const response = await apiClient.get<DepartmentResponse>(
    `/api/departments/${id}`,
  );

  return response.data.data;
}

export async function createDepartment(
  data: CreateDepartmentRequest,
): Promise<Department> {
  const response = await apiClient.post<DepartmentResponse>(
    "/api/departments",
    data,
  );

  return response.data.data;
}

export async function updateDepartment(
  id: string,
  data: UpdateDepartmentRequest,
): Promise<Department> {
  const response = await apiClient.patch<DepartmentResponse>(
    `/api/departments/${id}`,
    data,
  );

  return response.data.data;
}

export async function deleteDepartment(id: string): Promise<void> {
  await apiClient.delete(`/api/departments/${id}`);
}
