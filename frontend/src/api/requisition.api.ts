import { apiClient } from "./client";
import type {
  CreateRequisitionLineInput,
  CreateRequisitionRequest,
  Requisition,
  RequisitionListResponse,
  RequisitionStatus,
  RequisitionType,
  UpdateRequisitionRequest,
} from "../types";

interface RequisitionResponse {
  data: Requisition;
}

interface GetRequisitionsParams {
  type?: RequisitionType;
  status?: RequisitionStatus;
  departmentId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export async function getRequisitions(
  params?: GetRequisitionsParams,
): Promise<RequisitionListResponse> {
  const response = await apiClient.get<RequisitionListResponse>(
    "/api/requisitions",
    { params },
  );

  return response.data;
}

export async function getRequisition(id: string): Promise<Requisition> {
  const response = await apiClient.get<RequisitionResponse>(
    `/api/requisitions/${id}`,
  );

  return response.data.data;
}

export async function createRequisition(
  data: CreateRequisitionRequest,
): Promise<Requisition> {
  const response = await apiClient.post<RequisitionResponse>(
    "/api/requisitions",
    data,
  );

  return response.data.data;
}

export async function updateRequisition(
  id: string,
  data: UpdateRequisitionRequest,
): Promise<Requisition> {
  const response = await apiClient.patch<RequisitionResponse>(
    `/api/requisitions/${id}`,
    data,
  );

  return response.data.data;
}

export async function deleteRequisition(id: string): Promise<void> {
  await apiClient.delete(`/api/requisitions/${id}`);
}

// All three line operations return the whole requisition, so the caller always
// holds a current line list without a second fetch.

export async function addRequisitionLine(
  requisitionId: string,
  data: CreateRequisitionLineInput,
): Promise<Requisition> {
  const response = await apiClient.post<RequisitionResponse>(
    `/api/requisitions/${requisitionId}/lines`,
    data,
  );

  return response.data.data;
}

export async function updateRequisitionLine(
  requisitionId: string,
  lineId: string,
  qtyNeeded: number,
): Promise<Requisition> {
  const response = await apiClient.patch<RequisitionResponse>(
    `/api/requisitions/${requisitionId}/lines/${lineId}`,
    { qtyNeeded },
  );

  return response.data.data;
}

export async function removeRequisitionLine(
  requisitionId: string,
  lineId: string,
): Promise<Requisition> {
  const response = await apiClient.delete<RequisitionResponse>(
    `/api/requisitions/${requisitionId}/lines/${lineId}`,
  );

  return response.data.data;
}
