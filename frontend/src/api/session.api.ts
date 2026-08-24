import { apiClient } from "./client";
import type {
  ClassSession,
  GenerateSessionsResult,
  SessionListResponse,
  SessionStatus,
} from "../types";

interface SessionResponse {
  data: ClassSession;
}

interface GenerateResponse {
  data: GenerateSessionsResult;
}

interface GetSessionsParams {
  labId?: string;
  sectionId?: string;
  courseId?: string;
  status?: SessionStatus;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export async function getSessions(
  params?: GetSessionsParams,
): Promise<SessionListResponse> {
  const response = await apiClient.get<SessionListResponse>("/api/sessions", {
    params,
  });

  return response.data;
}

export async function getSession(id: string): Promise<ClassSession> {
  const response = await apiClient.get<SessionResponse>(`/api/sessions/${id}`);

  return response.data.data;
}

export async function generateSessions(
  horizonDays: number,
): Promise<GenerateSessionsResult> {
  const response = await apiClient.post<GenerateResponse>(
    "/api/sessions/generate",
    { horizonDays },
  );

  return response.data.data;
}

export async function assignSessionExperiment(
  sessionId: string,
  experimentId: string | null,
): Promise<ClassSession> {
  const response = await apiClient.patch<SessionResponse>(
    `/api/sessions/${sessionId}/experiment`,
    { experimentId },
  );

  return response.data.data;
}
