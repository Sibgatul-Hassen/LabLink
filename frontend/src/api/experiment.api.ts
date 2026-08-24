import { apiClient } from "./client";
import type {
  CreateExperimentItemRequest,
  CreateExperimentRequest,
  Experiment,
  ExperimentListResponse,
  UpdateExperimentItemRequest,
  UpdateExperimentRequest,
} from "../types";

interface ExperimentResponse {
  data: Experiment;
}

interface GetExperimentsParams {
  search?: string;
  courseId?: string;
  page?: number;
  limit?: number;
}

export async function getExperiments(
  params?: GetExperimentsParams,
): Promise<ExperimentListResponse> {
  const response = await apiClient.get<ExperimentListResponse>(
    "/api/experiments",
    {
      params,
    },
  );

  return response.data;
}

export async function getExperiment(id: string): Promise<Experiment> {
  const response = await apiClient.get<ExperimentResponse>(
    `/api/experiments/${id}`,
  );

  return response.data.data;
}

export async function createExperiment(
  data: CreateExperimentRequest,
): Promise<Experiment> {
  const response = await apiClient.post<ExperimentResponse>(
    "/api/experiments",
    data,
  );

  return response.data.data;
}

export async function updateExperiment(
  id: string,
  data: UpdateExperimentRequest,
): Promise<Experiment> {
  const response = await apiClient.patch<ExperimentResponse>(
    `/api/experiments/${id}`,
    data,
  );

  return response.data.data;
}

export async function deleteExperiment(id: string): Promise<void> {
  await apiClient.delete(`/api/experiments/${id}`);
}

// The item endpoints return the whole parent experiment, so the caller always
// has the complete, current item list after a mutation.
export async function addExperimentItem(
  experimentId: string,
  data: CreateExperimentItemRequest,
): Promise<Experiment> {
  const response = await apiClient.post<ExperimentResponse>(
    `/api/experiments/${experimentId}/items`,
    data,
  );

  return response.data.data;
}

export async function updateExperimentItem(
  experimentId: string,
  itemId: string,
  data: UpdateExperimentItemRequest,
): Promise<Experiment> {
  const response = await apiClient.patch<ExperimentResponse>(
    `/api/experiments/${experimentId}/items/${itemId}`,
    data,
  );

  return response.data.data;
}

export async function deleteExperimentItem(
  experimentId: string,
  itemId: string,
): Promise<void> {
  await apiClient.delete(`/api/experiments/${experimentId}/items/${itemId}`);
}
