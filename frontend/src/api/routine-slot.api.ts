import { apiClient } from "./client";
import type {
  CreateRoutineSlotRequest,
  ImportRoutineSlotsResult,
  RoutineSlot,
  RoutineSlotListResponse,
  UpdateRoutineSlotRequest,
} from "../types";

interface RoutineSlotResponse {
  data: RoutineSlot;
}

interface GetRoutineSlotsParams {
  sectionId?: string;
  labId?: string;
  dayOfWeek?: number;
  page?: number;
  limit?: number;
}

export async function getRoutineSlots(
  params?: GetRoutineSlotsParams,
): Promise<RoutineSlotListResponse> {
  const response = await apiClient.get<RoutineSlotListResponse>(
    "/api/routine-slots",
    { params },
  );

  return response.data;
}

export async function getRoutineSlot(id: string): Promise<RoutineSlot> {
  const response = await apiClient.get<RoutineSlotResponse>(
    `/api/routine-slots/${id}`,
  );

  return response.data.data;
}

export async function createRoutineSlot(
  data: CreateRoutineSlotRequest,
): Promise<RoutineSlot> {
  const response = await apiClient.post<RoutineSlotResponse>(
    "/api/routine-slots",
    data,
  );

  return response.data.data;
}

export async function updateRoutineSlot(
  id: string,
  data: UpdateRoutineSlotRequest,
): Promise<RoutineSlot> {
  const response = await apiClient.patch<RoutineSlotResponse>(
    `/api/routine-slots/${id}`,
    data,
  );

  return response.data.data;
}

export async function deleteRoutineSlot(id: string): Promise<void> {
  await apiClient.delete(`/api/routine-slots/${id}`);
}

interface ImportResponse {
  data: ImportRoutineSlotsResult;
}

// Returns 200 with mixed per-row results, so a rejected promise here means the
// file itself was unusable — not that individual rows failed.
export async function importRoutineSlots(
  csv: string,
): Promise<ImportRoutineSlotsResult> {
  const response = await apiClient.post<ImportResponse>(
    "/api/routine-slots/import",
    { csv },
  );

  return response.data.data;
}
