import { apiClient } from "./client";
import type {
  CreateRequisitionLineInput,
  CreateRequisitionRequest,
  IssuePreview,
  Requisition,
  RequisitionListResponse,
  RequisitionStatus,
  RequisitionType,
  ResolutionBreakdown,
  ReturnPreview,
  ReturnRequisitionRequest,
  UpdateRequisitionRequest,
} from "../types";

interface RequisitionResponse {
  data: Requisition;
}

interface ResolutionBreakdownResponse {
  data: ResolutionBreakdown;
}

interface IssuePreviewResponse {
  data: IssuePreview;
}

interface ReturnPreviewResponse {
  data: ReturnPreview;
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

export async function cancelRequisition(id: string): Promise<Requisition> {
  const response = await apiClient.post<RequisitionResponse>(
    `/api/requisitions/${id}/cancel`,
  );
  return response.data.data;
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

export async function orderLiveForSession(
  sessionId: string,
  lines: CreateRequisitionLineInput[],
): Promise<Requisition> {
  const response = await apiClient.post<RequisitionResponse>(
    "/api/sessions/" + sessionId + "/live-order",
    { lines },
  );
  return response.data.data;
}

export async function submitRequisition(id: string): Promise<Requisition> {
  const response = await apiClient.post<RequisitionResponse>(
    `/api/requisitions/${id}/submit`,
  );

  return response.data.data;
}

export async function getRequisitionResolution(
  id: string,
): Promise<ResolutionBreakdown> {
  const response = await apiClient.get<ResolutionBreakdownResponse>(
    `/api/requisitions/${id}/resolution`,
  );

  return response.data.data;
}

// Lives here despite the /api/sessions path (per the brief) since it
// returns — and is conceptually about creating — a Requisition, matching
// every other function in this file. Gated server-side to LAB_ASSISTANT
// and SYSTEM_ADMIN (session.routes.ts), the same roles that can raise a
// CLASS requisition by hand.
export async function draftRequisitionForSession(
  sessionId: string,
): Promise<Requisition> {
  const response = await apiClient.post<RequisitionResponse>(
    `/api/sessions/${sessionId}/draft-requisition`,
  );

  return response.data.data;
}

export async function getIssuePreview(id: string): Promise<IssuePreview> {
  const response = await apiClient.get<IssuePreviewResponse>(
    `/api/requisitions/${id}/issue-preview`,
  );

  return response.data.data;
}

export async function issueRequisition(id: string): Promise<Requisition> {
  const response = await apiClient.post<RequisitionResponse>(
    `/api/requisitions/${id}/issue`,
  );

  return response.data.data;
}

export async function getReturnPreview(id: string): Promise<ReturnPreview> {
  const response = await apiClient.get<ReturnPreviewResponse>(
    `/api/requisitions/${id}/return-preview`,
  );

  return response.data.data;
}

export async function returnRequisition(
  id: string,
  data: ReturnRequisitionRequest,
): Promise<Requisition> {
  const response = await apiClient.post<RequisitionResponse>(
    `/api/requisitions/${id}/return`,
    data,
  );

  return response.data.data;
}
