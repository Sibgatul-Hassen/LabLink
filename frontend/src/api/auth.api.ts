import { apiClient } from "./client";
import type { LoginRequest, LoginResponse, User } from "../types";

export async function login(credentials: LoginRequest): Promise<LoginResponse> {
  const response = await apiClient.post<LoginResponse>(
    "/api/auth/login",
    credentials,
  );

  return response.data;
}

export async function getCurrentUser(): Promise<User> {
  const response = await apiClient.get<{ user: User }>("/api/auth/me");

  return response.data.user;
}
