import { apiClient } from "./client";

export interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string;
  refType: string | null;
  refId: string | null;
  isRead: boolean;
  createdAt: string;
}

interface NotificationListResponse {
  data: Notification[];
}

interface NotificationResponse {
  data: Notification;
}

export async function getNotifications(): Promise<Notification[]> {
  const response =
    await apiClient.get<NotificationListResponse>("/api/notifications");
  return response.data.data;
}

export async function markNotificationRead(
  id: string,
): Promise<Notification> {
  const response = await apiClient.patch<NotificationResponse>(
    `/api/notifications/${id}/read`,
  );
  return response.data.data;
}
