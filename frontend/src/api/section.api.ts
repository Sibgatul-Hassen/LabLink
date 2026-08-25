import { apiClient } from "./client";
import type {
  CreateSectionRequest,
  Section,
  SectionListResponse,
  SectionUser,
  UpdateSectionRequest,
} from "../types";

interface SectionResponse {
  data: Section;
}

interface GetSectionsParams {
  search?: string;
  courseId?: string;
  semester?: string;
  instructorId?: string;
  labAssistantId?: string;
  page?: number;
  limit?: number;
}

export async function getSections(
  params?: GetSectionsParams,
): Promise<SectionListResponse> {
  const response = await apiClient.get<SectionListResponse>(
    "/api/sections",
    {
      params,
    },
  );

  return response.data;
}

export async function getSection(id: string): Promise<Section> {
  const response = await apiClient.get<SectionResponse>(
    `/api/sections/${id}`,
  );

  return response.data.data;
}

export async function createSection(
  data: CreateSectionRequest,
): Promise<Section> {
  const response = await apiClient.post<SectionResponse>(
    "/api/sections",
    data,
  );

  return response.data.data;
}

export async function updateSection(
  id: string,
  data: UpdateSectionRequest,
): Promise<Section> {
  const response = await apiClient.patch<SectionResponse>(
    `/api/sections/${id}`,
    data,
  );

  return response.data.data;
}

export async function deleteSection(id: string): Promise<void> {
  await apiClient.delete(`/api/sections/${id}`);
}

interface SectionAssigneesResponse {
  data: SectionUser[];
}

export async function getSectionAssignees(
  role: "INSTRUCTOR" | "LAB_ASSISTANT",
): Promise<SectionUser[]> {
  const response = await apiClient.get<SectionAssigneesResponse>(
    "/api/sections/assignees",
    {
      params: { role },
    },
  );

  return response.data.data;
}
