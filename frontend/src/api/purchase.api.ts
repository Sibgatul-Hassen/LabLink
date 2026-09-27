import { apiClient } from "./client";
import type {
  CreatePurchaseRequestRequest,
  DecidePurchaseRequestRequest,
  PurchaseRequest,
  PurchaseRequestListResponse,
  PurchaseStatus,
  ReceiveGoodsRequest,
  Urgency,
} from "../types";

interface PurchaseRequestResponse {
  data: PurchaseRequest;
}

interface PurchaseRequestArrayResponse {
  data: PurchaseRequest[];
}

interface GetPurchaseRequestsParams {
  status?: PurchaseStatus;
  urgency?: Urgency;
  page?: number;
  limit?: number;
}

export async function getPurchaseRequests(
  params?: GetPurchaseRequestsParams,
): Promise<PurchaseRequestListResponse> {
  const response = await apiClient.get<PurchaseRequestListResponse>(
    "/api/purchase-requests",
    { params },
  );

  return response.data;
}

export async function getPurchaseRequest(
  id: string,
): Promise<PurchaseRequest> {
  const response = await apiClient.get<PurchaseRequestResponse>(
    `/api/purchase-requests/${id}`,
  );

  return response.data.data;
}

// GET /api/purchase-requests/queue is available to purchase approvers and
// oversight roles. The API filters approvers to their current rung.
export async function getPurchaseRequestQueue(): Promise<PurchaseRequest[]> {
  const response = await apiClient.get<PurchaseRequestArrayResponse>(
    "/api/purchase-requests/queue",
  );

  return response.data.data;
}

export async function createPurchaseRequest(
  data: CreatePurchaseRequestRequest,
): Promise<PurchaseRequest> {
  const response = await apiClient.post<PurchaseRequestResponse>(
    "/api/purchase-requests",
    data,
  );

  return response.data.data;
}

export async function aggregatePurchaseRequests(componentId: string): Promise<PurchaseRequest> {
  const response = await apiClient.post<PurchaseRequestResponse>(
    "/api/purchase-requests/aggregate", { componentId },
  );
  return response.data.data;
}

export async function decidePurchaseRequest(
  id: string,
  data: DecidePurchaseRequestRequest,
): Promise<PurchaseRequest> {
  const response = await apiClient.post<PurchaseRequestResponse>(
    `/api/purchase-requests/${id}/decide`,
    data,
  );

  return response.data.data;
}

export async function receivePurchaseGoods(
  id: string,
  data: ReceiveGoodsRequest,
): Promise<PurchaseRequest> {
  const response = await apiClient.post<PurchaseRequestResponse>(
    `/api/purchase-requests/${id}/receive`,
    data,
  );

  return response.data.data;
}
