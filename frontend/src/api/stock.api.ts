import { apiClient } from "./client";
import type {
  AdjustStockRequest,
  AdjustStockResponse,
  Stock,
  StockListResponse,
  StockMovementListResponse,
  UpdateReorderPointRequest,
} from "../types";

interface StockResponse {
  data: Stock;
}

interface AdjustResponse {
  data: AdjustStockResponse;
}

interface GetStocksParams {
  search?: string;
  category?: string;
  lowStockOnly?: boolean;
  page?: number;
  limit?: number;
}

interface GetMovementsParams {
  page?: number;
  limit?: number;
}

export async function getStocks(
  params?: GetStocksParams,
): Promise<StockListResponse> {
  const response = await apiClient.get<StockListResponse>("/api/stocks", {
    params,
  });

  return response.data;
}

export async function getStock(componentId: string): Promise<Stock> {
  const response = await apiClient.get<StockResponse>(
    `/api/stocks/${componentId}`,
  );

  return response.data.data;
}

export async function updateReorderPoint(
  componentId: string,
  data: UpdateReorderPointRequest,
): Promise<Stock> {
  const response = await apiClient.patch<StockResponse>(
    `/api/stocks/${componentId}/reorder-point`,
    data,
  );

  return response.data.data;
}

export async function adjustStock(
  componentId: string,
  data: AdjustStockRequest,
): Promise<AdjustStockResponse> {
  const response = await apiClient.post<AdjustResponse>(
    `/api/stocks/${componentId}/adjust`,
    data,
  );

  return response.data.data;
}

export async function getStockMovements(
  componentId: string,
  params?: GetMovementsParams,
): Promise<StockMovementListResponse> {
  const response = await apiClient.get<StockMovementListResponse>(
    `/api/stocks/${componentId}/movements`,
    {
      params,
    },
  );

  return response.data;
}
