import { apiClient } from "./client";
import type {
  ChangePasswordRequest,
  CreateUserRequest,
  UpdateUserRequest,
  UserAccount,
  UserListResponse,
} from "../types";

interface UserResponse {
  data: UserAccount;
}

interface GetUsersParams {
  search?: string;
  role?: string;
  departmentId?: string;
  page?: number;
  limit?: number;
}

export async function getUsers(
  params?: GetUsersParams,
): Promise<UserListResponse> {
  const response = await apiClient.get<UserListResponse>("/api/users", {
    params,
  });

  return response.data;
}

export async function getUser(id: string): Promise<UserAccount> {
  const response = await apiClient.get<UserResponse>(`/api/users/${id}`);

  return response.data.data;
}

export async function createUser(
  data: CreateUserRequest,
): Promise<UserAccount> {
  const response = await apiClient.post<UserResponse>("/api/users", data);

  return response.data.data;
}

export async function updateUser(
  id: string,
  data: UpdateUserRequest,
): Promise<UserAccount> {
  const response = await apiClient.patch<UserResponse>(
    `/api/users/${id}`,
    data,
  );

  return response.data.data;
}

export async function changeUserPassword(
  id: string,
  data: ChangePasswordRequest,
): Promise<void> {
  await apiClient.patch(`/api/users/${id}/password`, data);
}

export async function deleteUser(id: string): Promise<void> {
  await apiClient.delete(`/api/users/${id}`);
}
