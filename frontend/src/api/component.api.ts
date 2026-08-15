import { apiClient } from "./client";
import type { ComponentListResponse } from "../types";

export async function getComponents(): Promise<ComponentListResponse> {
  const response =
    await apiClient.get<ComponentListResponse>("/api/components");

  return response.data;
}
