import { apiClient } from "./client";

export type SuggestionStatus = "PENDING" | "ACCEPTED" | "DISMISSED" | "EXPIRED";
export type SuggestionType =
  | "SUBSTITUTE" | "REORDER_POINT" | "QUOTA" | "ITEM_LIST"
  | "SHORTAGE_ALERT" | "COLLECTION_RISK" | "SLOT";

export interface Suggestion {
  id: string;
  type: SuggestionType;
  payload: unknown;
  evidence: unknown;
  targetRole: string;
  status: SuggestionStatus;
  createdAt: string;
  feedback: { accepted: boolean; note: string | null }[];
}

export interface SuggestionList {
  data: Suggestion[];
  total: number;
  page: number;
  limit: number;
}

export async function getSuggestions(params: {
  status?: SuggestionStatus;
  type?: SuggestionType;
  page: number;
  limit: number;
}): Promise<SuggestionList> {
  const response = await apiClient.get<SuggestionList>("/api/suggestions", { params });
  return response.data;
}

export async function generateSuggestions(): Promise<Record<string, number>> {
  const response = await apiClient.post<{ created: Record<string, number> }>("/api/suggestions/generate");
  return response.data.created;
}

export async function decideSuggestion(id: string, accepted: boolean, note?: string): Promise<Suggestion> {
  const response = await apiClient.patch<{ data: Suggestion }>(
    `/api/suggestions/${id}/decision`, { accepted, note },
  );
  return response.data.data;
}
