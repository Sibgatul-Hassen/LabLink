import { apiClient } from "./client";
import type {
  BorrowRequest,
  BorrowRequestListResponse,
  BorrowStatus,
} from "../types";

interface BorrowRequestResponse {
  data: BorrowRequest;
}

interface BorrowRequestArrayResponse {
  data: BorrowRequest[];
}

interface GetBorrowRequestsParams {
  status?: BorrowStatus;
  page?: number;
  limit?: number;
}

export async function getBorrowRequests(
  params?: GetBorrowRequestsParams,
): Promise<BorrowRequestListResponse> {
  const response = await apiClient.get<BorrowRequestListResponse>(
    "/api/borrow-requests",
    { params },
  );
  return response.data;
}

// GET /api/borrow-requests/incoming
// Gated to DEPT_STORE_HEAD, CENTRAL_STORE_OFFICER, SYSTEM_ADMIN server-side.
export async function getIncomingBorrowRequests(): Promise<BorrowRequest[]> {
  const response = await apiClient.get<BorrowRequestArrayResponse>(
    "/api/borrow-requests/incoming",
  );
  return response.data.data;
}

// GET /api/borrow-requests/outgoing
// Gated to DEPT_STORE_HEAD, CENTRAL_STORE_OFFICER, SYSTEM_ADMIN server-side.
export async function getOutgoingBorrowRequests(): Promise<BorrowRequest[]> {
  const response = await apiClient.get<BorrowRequestArrayResponse>(
    "/api/borrow-requests/outgoing",
  );
  return response.data.data;
}

export async function getBorrowRequest(id: string): Promise<BorrowRequest> {
  const response = await apiClient.get<BorrowRequestResponse>(
    `/api/borrow-requests/${id}`,
  );
  return response.data.data;
}

export async function approveBorrowRequest(
  id: string,
  data: { approvedQty: number },
): Promise<BorrowRequest> {
  const response = await apiClient.post<BorrowRequestResponse>(
    `/api/borrow-requests/${id}/approve`,
    data,
  );
  return response.data.data;
}

export async function rejectBorrowRequest(
  id: string,
  data: { reason: string },
): Promise<BorrowRequest> {
  const response = await apiClient.post<BorrowRequestResponse>(
    `/api/borrow-requests/${id}/reject`,
    data,
  );
  return response.data.data;
}

// No body needed — approved qty already lives on the BorrowLine.
export async function handOverBorrowRequest(
  id: string,
): Promise<BorrowRequest> {
  const response = await apiClient.post<BorrowRequestResponse>(
    `/api/borrow-requests/${id}/hand-over`,
  );
  return response.data.data;
}

// No body needed — borrower confirms physical return.
export async function returnBorrowRequest(id: string): Promise<BorrowRequest> {
  const response = await apiClient.post<BorrowRequestResponse>(
    `/api/borrow-requests/${id}/return`,
  );
  return response.data.data;
}
