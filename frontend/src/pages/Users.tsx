import axios from "axios";
import { type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getDepartments } from "../api/department.api";
import {
  changeUserPassword,
  createUser,
  deleteUser,
  getUsers,
  updateUser,
} from "../api/user.api";
import { useAuthStore } from "../store/authStore";
import type { CreateUserRequest, Role, UserAccount } from "../types";

interface UserFormState {
  email: string;
  password: string;
  fullName: string;
  role: Role;
  departmentId: string;
}

const emptyForm: UserFormState = {
  email: "",
  password: "",
  fullName: "",
  role: "STUDENT",
  departmentId: "",
};

const ROLES: Role[] = [
  "STUDENT",
  "INSTRUCTOR",
  "LAB_ASSISTANT",
  "DEPT_STORE_HEAD",
  "CENTRAL_STORE_OFFICER",
  "OFFICE_ADMIN",
  "SYSTEM_ADMIN",
];

const SCOPED_ROLES: Role[] = [
  "STUDENT",
  "INSTRUCTOR",
  "LAB_ASSISTANT",
  "DEPT_STORE_HEAD",
];

function formatRole(role: Role): string {
  return role
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.error;

    if (typeof message === "string") {
      return message;
    }
  }

  return "Something went wrong. Please try again.";
}

export default function Users() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [page, setPage] = useState(1);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [form, setForm] = useState<UserFormState>(emptyForm);
  const [formError, setFormError] = useState("");

  const [passwordUser, setPasswordUser] = useState<UserAccount | null>(null);
  const [passwordValue, setPasswordValue] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const [rowError, setRowError] = useState("");

  const limit = 10;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [
      "users",
      { search, role: roleFilter, page, limit },
    ],
    queryFn: () =>
      getUsers({
        search: search.trim() || undefined,
        role: roleFilter || undefined,
        page,
        limit,
      }),
  });

  const { data: departmentsData } = useQuery({
    queryKey: ["departments-for-select"],
    queryFn: () => getDepartments({ limit: 100 }),
  });

  const departments = departmentsData?.data ?? [];

  const saveMutation = useMutation({
    mutationFn: async (payload: CreateUserRequest) => {
      if (editingUser) {
        return updateUser(editingUser.id, {
          email: payload.email,
          fullName: payload.fullName,
          role: payload.role,
          departmentId: payload.departmentId,
        });
      }

      return createUser(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      closeForm();
    },
    onError: (mutationError: unknown) => {
      setFormError(getErrorMessage(mutationError));
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      isActive ? updateUser(id, { isActive: true }) : deleteUser(id),
    onSuccess: async () => {
      setRowError("");
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (mutationError: unknown) => {
      setRowError(getErrorMessage(mutationError));
    },
  });

  const passwordMutation = useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) =>
      changeUserPassword(id, { password }),
    onSuccess: () => {
      closePasswordModal();
    },
    onError: (mutationError: unknown) => {
      setPasswordError(getErrorMessage(mutationError));
    },
  });

  function openCreateForm() {
    setEditingUser(null);
    setForm(emptyForm);
    setFormError("");
    setIsFormOpen(true);
  }

  function openEditForm(user: UserAccount) {
    setEditingUser(user);

    setForm({
      email: user.email,
      password: "",
      fullName: user.fullName,
      role: user.role,
      departmentId: user.departmentId ?? "",
    });

    setFormError("");
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingUser(null);
    setForm(emptyForm);
    setFormError("");
  }

  function openPasswordModal(user: UserAccount) {
    setPasswordUser(user);
    setPasswordValue("");
    setPasswordError("");
  }

  function closePasswordModal() {
    setPasswordUser(null);
    setPasswordValue("");
    setPasswordError("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    if (!form.email.trim()) {
      setFormError("Email is required.");
      return;
    }

    if (!form.fullName.trim()) {
      setFormError("Full name is required.");
      return;
    }

    if (!editingUser && form.password.trim().length < 6) {
      setFormError("Password must be at least 6 characters.");
      return;
    }

    if (SCOPED_ROLES.includes(form.role) && !form.departmentId) {
      setFormError("Department is required for this role.");
      return;
    }

    const payload: CreateUserRequest = {
      email: form.email.trim(),
      password: form.password,
      fullName: form.fullName.trim(),
      role: form.role,
      departmentId: form.departmentId || null,
    };

    saveMutation.mutate(payload);
  }

  function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError("");

    if (passwordValue.trim().length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      return;
    }

    if (!passwordUser) {
      return;
    }

    passwordMutation.mutate({ id: passwordUser.id, password: passwordValue });
  }

  function handleToggleActive(user: UserAccount) {
    const isSelf = user.id === currentUser?.id;

    if (isSelf && user.isActive) {
      return;
    }

    if (user.isActive) {
      const confirmed = window.confirm(
        `Deactivate "${user.fullName}"? They will no longer be able to sign in.`,
      );

      if (!confirmed) {
        return;
      }
    }

    setRowError("");
    statusMutation.mutate({ id: user.id, isActive: !user.isActive });
  }

  const isRoleSelectDisabled =
    !!editingUser &&
    editingUser.id === currentUser?.id &&
    editingUser.role === "SYSTEM_ADMIN";

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">User Management</h2>
          <p className="mt-1 text-sm text-slate-500">
            Manage user accounts, roles, and access.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateForm}
          className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          Add User
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="max-w-md flex-1">
            <label
              htmlFor="user-search"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Search
            </label>

            <input
              id="user-search"
              type="text"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search by name or email"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="sm:w-56">
            <label
              htmlFor="user-role-filter"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Role
            </label>

            <select
              id="user-role-filter"
              value={roleFilter}
              onChange={(event) => {
                setRoleFilter(event.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">All roles</option>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {formatRole(role)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {rowError && (
        <div
          role="alert"
          className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {rowError}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Loading users...
          </div>
        ) : isError ? (
          <div className="p-8 text-center text-sm text-red-600">
            {getErrorMessage(error)}
          </div>
        ) : data?.data.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No users found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Department
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 bg-white">
                {data?.data.map((user) => {
                  const isSelf = user.id === currentUser?.id;

                  return (
                    <tr key={user.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-6 py-4">
                        <span className="font-semibold text-slate-900">
                          {user.fullName}
                        </span>
                        {isSelf && (
                          <span className="ml-2 text-xs text-slate-400">
                            (you)
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-sm text-slate-700">
                        {user.email}
                      </td>

                      <td className="whitespace-nowrap px-6 py-4">
                        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          {formatRole(user.role)}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-sm text-slate-700">
                        {user.department?.code ?? "—"}
                      </td>

                      <td className="whitespace-nowrap px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            user.isActive
                              ? "bg-green-100 text-green-700"
                              : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {user.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEditForm(user)}
                            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() => openPasswordModal(user)}
                            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                          >
                            Reset Password
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleActive(user)}
                            disabled={
                              statusMutation.isPending || (isSelf && user.isActive)
                            }
                            title={
                              isSelf && user.isActive
                                ? "You cannot deactivate your own account."
                                : undefined
                            }
                            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                              user.isActive
                                ? "border-red-200 text-red-600 hover:bg-red-50"
                                : "border-green-200 text-green-700 hover:bg-green-50"
                            }`}
                          >
                            {user.isActive ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            {total} user{total === 1 ? "" : "s"}
          </p>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>

            <span className="text-sm text-slate-600">
              Page {page} of {totalPages}
            </span>

            <button
              type="button"
              onClick={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
              disabled={page >= totalPages}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {editingUser ? "Edit User" : "Add User"}
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  {editingUser
                    ? "Update this user's account information."
                    : "Create a new user account."}
                </p>
              </div>

              <button
                type="button"
                onClick={closeForm}
                className="text-2xl leading-none text-slate-400 transition hover:text-slate-700"
                aria-label="Close user form"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 p-6">
              <div>
                <label
                  htmlFor="user-email"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Email
                </label>

                <input
                  id="user-email"
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  placeholder="name@university.edu"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {!editingUser && (
                <div>
                  <label
                    htmlFor="user-password"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Password
                  </label>

                  <input
                    id="user-password"
                    type="password"
                    value={form.password}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        password: event.target.value,
                      }))
                    }
                    placeholder="At least 6 characters"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              )}

              <div>
                <label
                  htmlFor="user-full-name"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Full Name
                </label>

                <input
                  id="user-full-name"
                  type="text"
                  value={form.fullName}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      fullName: event.target.value,
                    }))
                  }
                  placeholder="Example: Jane Doe"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label
                  htmlFor="user-role"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Role
                </label>

                <select
                  id="user-role"
                  value={form.role}
                  disabled={isRoleSelectDisabled}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      role: event.target.value as Role,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {formatRole(role)}
                    </option>
                  ))}
                </select>

                {isRoleSelectDisabled && (
                  <p className="mt-1 text-xs text-slate-500">
                    You cannot change your own role away from System Admin.
                  </p>
                )}
              </div>

              {SCOPED_ROLES.includes(form.role) && (
                <div>
                  <label
                    htmlFor="user-department"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Department
                  </label>

                  <select
                    id="user-department"
                    value={form.departmentId}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        departmentId: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">Select a department</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.code} - {department.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {formError && (
                <div
                  role="alert"
                  className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  {formError}
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saveMutation.isPending
                    ? "Saving..."
                    : editingUser
                      ? "Save Changes"
                      : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {passwordUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Reset Password
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Set a new password for {passwordUser.fullName}.
                </p>
              </div>

              <button
                type="button"
                onClick={closePasswordModal}
                className="text-2xl leading-none text-slate-400 transition hover:text-slate-700"
                aria-label="Close password reset form"
              >
                ×
              </button>
            </div>

            <form onSubmit={handlePasswordSubmit} className="space-y-5 p-6">
              <div>
                <label
                  htmlFor="reset-password"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  New Password
                </label>

                <input
                  id="reset-password"
                  type="password"
                  value={passwordValue}
                  onChange={(event) => setPasswordValue(event.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {passwordError && (
                <div
                  role="alert"
                  className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  {passwordError}
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={closePasswordModal}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={passwordMutation.isPending}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {passwordMutation.isPending ? "Saving..." : "Reset Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
