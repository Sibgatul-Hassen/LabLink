import { apiClient } from "./client";
import type {
  Course,
  CourseListResponse,
  CreateCourseRequest,
  UpdateCourseRequest,
} from "../types";

interface CourseResponse {
  data: Course;
}

interface GetCoursesParams {
  search?: string;
  departmentId?: string;
  page?: number;
  limit?: number;
}

export async function getCourses(
  params?: GetCoursesParams,
): Promise<CourseListResponse> {
  const response = await apiClient.get<CourseListResponse>(
    "/api/courses",
    {
      params,
    },
  );

  return response.data;
}

export async function getCourse(id: string): Promise<Course> {
  const response = await apiClient.get<CourseResponse>(
    `/api/courses/${id}`,
  );

  return response.data.data;
}

export async function createCourse(
  data: CreateCourseRequest,
): Promise<Course> {
  const response = await apiClient.post<CourseResponse>(
    "/api/courses",
    data,
  );

  return response.data.data;
}

export async function updateCourse(
  id: string,
  data: UpdateCourseRequest,
): Promise<Course> {
  const response = await apiClient.patch<CourseResponse>(
    `/api/courses/${id}`,
    data,
  );

  return response.data.data;
}

export async function deleteCourse(id: string): Promise<void> {
  await apiClient.delete(`/api/courses/${id}`);
}
