import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getNotifications,
  markNotificationRead,
  type Notification,
} from "../api/notification.api";

// Re-poll every 30 seconds so the bell stays fresh without a full page reload.
const POLL_INTERVAL_MS = 30_000;

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${Math.floor(diffHrs / 24)}d ago`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: getNotifications,
    refetchInterval: POLL_INTERVAL_MS,
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const markReadMut = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: (updated) => {
      // Optimistic update — swap the single item in the cached list.
      queryClient.setQueryData<Notification[]>(
        ["notifications"],
        (prev) =>
          prev?.map((n) => (n.id === updated.id ? updated : n)) ?? [],
      );
    },
  });

  function handleMarkAllRead() {
    notifications
      .filter((n) => !n.isRead)
      .forEach((n) => markReadMut.mutate(n.id));
  }

  // Close panel when clicking outside.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        id="notification-bell"
        type="button"
        aria-label={`Notifications — ${unreadCount} unread`}
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {/* Bell SVG */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-5 w-5"
        >
          <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6V11c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
        </svg>

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Notifications
              {unreadCount > 0 && (
                <span className="ml-2 rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-600">
                  {unreadCount} new
                </span>
              )}
            </h2>
            {unreadCount > 0 && (
              <button
                id="mark-all-read"
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs text-blue-600 hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <ul className="max-h-80 divide-y divide-slate-50 overflow-y-auto">
            {notifications.length === 0 && (
              <li className="flex flex-col items-center justify-center py-10 text-slate-400">
                <span className="mb-1 text-3xl">🔔</span>
                <p className="text-xs">No notifications yet</p>
              </li>
            )}

            {notifications.map((n) => (
              <li
                key={n.id}
                className={`cursor-pointer px-4 py-3 transition hover:bg-slate-50 ${
                  n.isRead ? "opacity-60" : ""
                }`}
                onClick={() => {
                  if (!n.isRead) markReadMut.mutate(n.id);
                }}
              >
                <div className="flex items-start gap-2">
                  {/* Unread dot */}
                  <span
                    className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${
                      n.isRead ? "bg-transparent" : "bg-blue-500"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-800 leading-snug">
                      {n.title}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 leading-snug line-clamp-2">
                      {n.body}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {timeAgo(n.createdAt)}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-slate-100 px-4 py-2 text-center">
              <p className="text-xs text-slate-400">
                {notifications.length} notification
                {notifications.length !== 1 ? "s" : ""} total
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
