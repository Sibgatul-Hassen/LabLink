import { apiClient } from "./client";
import type { PeakClassesResponse } from "../types";

interface GetPeakClassesParams {
  departmentId?: string;
  from?: string;
  to?: string;
}

export async function getPeakClasses(
  params?: GetPeakClassesParams,
): Promise<PeakClassesResponse> {
  const response = await apiClient.get<PeakClassesResponse>(
    "/api/analytics/peak-classes",
    { params },
  );

  return response.data;
}

// ─── damage and loss rates (task 6.10) ───────────────────────────────────────

export interface ShortageFrequencyItem {
  componentId: string;
  componentCode: string;
  componentName: string;
  category: string;
  unit: string;
  shortageCount: number;
  totalQtyShort: number;
  avgQtyShort: number;
}

export interface ShortageFrequencyResponse {
  data: ShortageFrequencyItem[];
  total: number;
}

export async function getShortageFrequency(params?: {
  limit?: number;
  departmentId?: string;
}): Promise<ShortageFrequencyResponse> {
  const response = await apiClient.get<ShortageFrequencyResponse>(
    "/api/analytics/shortage-frequency",
    { params },
  );
  return response.data;
}

// ─── damage and loss rates (task 6.10) ───────────────────────────────────────

export interface LendingNetworkNode {
  id: string;
  code: string;
  name: string;
}

export interface LendingNetworkEdge {
  lenderDeptId: string;
  lenderCode: string;
  borrowerDeptId: string;
  borrowerCode: string;
  requestCount: number;
  totalQtyBorrowed: number;
}

export interface LendingNetworkResponse {
  nodes: LendingNetworkNode[];
  edges: LendingNetworkEdge[];
}

export async function getLendingNetwork(params?: {
  departmentId?: string;
}): Promise<LendingNetworkResponse> {
  const response = await apiClient.get<LendingNetworkResponse>(
    "/api/analytics/lending-network",
    { params },
  );
  return response.data;
}

// ─── damage and loss rates (task 6.10) ───────────────────────────────────────

export interface DamageLossItem {
  sectionId: string;
  sectionName: string;
  courseCode: string;
  instructorName: string | null;
  labAssistantName: string | null;
  totalQtyDamaged: number;
  totalQtyLost: number;
}

export interface DamageLossResponse {
  data: DamageLossItem[];
}

export async function getDamageLossRates(params?: {
  departmentId?: string;
}): Promise<DamageLossResponse> {
  const response = await apiClient.get<DamageLossResponse>(
    "/api/analytics/damage-loss",
    { params },
  );
  return response.data;
}
