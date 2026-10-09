import { apiClient } from "./client";

export type PenaltyType = "LATE" | "LOST" | "DAMAGED";
export type PenaltyStatus = "OUTSTANDING" | "PAID" | "WAIVED";

export interface Penalty {
  id: string;
  userId: string;
  requisitionId: string | null;
  componentId: string | null;
  type: PenaltyType;
  qty: number;
  amount: string;
  status: PenaltyStatus;
  receiptRef: string | null;
  waivedReason: string | null;
  createdAt: string;
  user: { id: string; fullName: string; email: string };
  component: { id: string; code: string; name: string } | null;
}

export interface PenaltyRate {
  id: string;
  type: PenaltyType;
  ratePerDay: string | null;
  costFraction: string | null;
  capAmount: string | null;
  blockThreshold: string;
}

export interface PenaltyBlockStatus {
  blocked: boolean;
  outstandingTotal: string;
  threshold: string | null;
}

export async function getPenaltyBlockStatus(): Promise<PenaltyBlockStatus> {
  const response = await apiClient.get<PenaltyBlockStatus>("/api/penalties/block-status");
  return response.data;
}

interface PenaltyList {
  data: Penalty[];
  total: number;
  page: number;
  limit: number;
}

export async function getPenalties(params: {
  status?: PenaltyStatus;
  page: number;
  limit: number;
}): Promise<PenaltyList> {
  const response = await apiClient.get<PenaltyList>("/api/penalties", { params });
  return response.data;
}

export async function getPenaltyRates(): Promise<PenaltyRate[]> {
  const response = await apiClient.get<{ data: PenaltyRate[] }>("/api/penalty-rates");
  return response.data.data;
}

export async function setPenaltyRate(data: {
  type: PenaltyType;
  ratePerDay?: number | null;
  costFraction?: number | null;
  capAmount?: number | null;
  blockThreshold: number;
}): Promise<PenaltyRate> {
  const response = await apiClient.put<{ data: PenaltyRate }>("/api/penalty-rates", data);
  return response.data.data;
}

export async function payPenalty(id: string, receiptRef: string): Promise<Penalty> {
  const response = await apiClient.post<{ data: Penalty }>(`/api/penalties/${id}/pay`, { receiptRef });
  return response.data.data;
}

export async function waivePenalty(id: string, reason: string): Promise<Penalty> {
  const response = await apiClient.post<{ data: Penalty }>(`/api/penalties/${id}/waive`, { reason });
  return response.data.data;
}
