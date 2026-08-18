import axios from "axios";
import { type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getCourses } from "../api/course.api";
import {
  createSection,
  deleteSection,
  getSectionAssignees,
  getSections,
  updateSection,
} from "../api/section.api";
import { useAuthStore } from "../store/authStore";
import type { CreateSectionRequest, Section } from "../types";

interface SectionFormState {
  courseId: string;
  name: string;
  semester: string;
  studentCount: string;
  instructorId: string;
  labAssistantId: string;
}

const emptyForm: SectionFormState = {
  courseId: "",
  name: "",
  semester: "",
  studentCount: "",
  instructorId: "",
  labAssistantId: "",
};

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.error;

    if (typeof message === "string") {
      return message;
    }
  }

  return "Something went wrong. Please try again.";
}

export default function Sections() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  const [search, setSearch] = useState("");
  const [courseId, setCourseId] = useState("");
  const [semester, setSemester] = useState("");
  const [page, setPage] = useState(1);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<Section | null>(null);

  const [form, setForm] = useState<SectionFormState>(emptyForm);
  const [formError, setFormError] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const limit = 10;
  const canManage = user?.role === "SYSTEM_ADMIN";

  const coursesQuery = useQuery({
    queryKey: ["courses", "section-options"],
    queryFn: () =>
      getCourses({
        page: 1,
        limit: 100,
      }),
  });

  const instructorsQuery = useQuery({
    queryKey: ["section-assignees", "INSTRUCTOR"],
    queryFn: () => getSectionAssignees("INSTRUCTOR"),
    enabled: canManage,
  });

  const labAssistantsQuery = useQuery({
    queryKey: ["section-assignees", "LAB_ASSISTANT"],
    queryFn: () => getSectionAssignees("LAB_ASSISTANT"),
    enabled: canManage,
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [
      "sections",
      {
        search,
        courseId,
        semester,
        page,
        limit,
      },
    ],
    queryFn: () =>
      getSections({
        search: search.trim() || undefined,
        courseId: courseId || undefined,
        semester: semester.trim() || undefined,
        page,
        limit,
      }),
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: CreateSectionRequest) => {
      if (editingSection) {
        return updateSection(editingSection.id, payload);
      }

      return createSection(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["sections"],
      });

      closeForm();
    },
    onError: (mutationError: unknown) => {
      setFormError(getErrorMessage(mutationError));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSection,
    onSuccess: async () => {
      setDeleteError("");

      await queryClient.invalidateQueries({
        queryKey: ["sections"],
      });
    },
    onError: (mutationError: unknown) => {
      setDeleteError(getErrorMessage(mutationError));
    },
  });

  function openCreateForm() {
    setEditingSection(null);
    setForm(emptyForm);
    setFormError("");
    setIsFormOpen(true);
  }

  function openEditForm(section: Section) {
    setEditingSection(section);

    setForm({
      courseId: section.courseId,
      name: section.name,
      semester: section.semester,
      studentCount: String(section.studentCount),
      instructorId: section.instructorId ?? "",
      labAssistantId: section.labAssistantId ?? "",
    });

    setFormError("");
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingSection(null);
    setForm(emptyForm);
    setFormError("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    if (!form.courseId) {
      setFormError("Course is required.");
      return;
    }

    if (!form.name.trim()) {
      setFormError("Section name is required.");
      return;
    }

    if (!form.semester.trim()) {
      setFormError("Semester is required.");
      return;
    }

    if (!form.studentCount.trim()) {
      setFormError("Student count is required.");
      return;
    }

    const studentCount = Number(form.studentCount);

    if (!Number.isInteger(studentCount) || studentCount < 0) {
      setFormError("Student count must be a non-negative integer.");
      return;
    }

    const payload: CreateSectionRequest = {
      courseId: form.courseId,
      name: form.name.trim(),
      semester: form.semester.trim(),
      studentCount,
      instructorId: form.instructorId || null,
      labAssistantId: form.labAssistantId || null,
    };

    saveMutation.mutate(payload);
  }

  function handleDelete(section: Section) {
    const confirmed = window.confirm(
      `Delete section "${section.course.code} - ${section.name} - ${section.semester}"?`,
    );

    if (!confirmed) {
      return;
    }

    setDeleteError("");
    deleteMutation.mutate(section.id);
  }

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Sections</h2>
          <p className="mt-1 text-sm text-slate-500">
            View and manage course sections and teaching assignments.
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={openCreateForm}
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Add Section
          </button>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-3">
          <div>
            <label
              htmlFor="section-search"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Search
            </label>

            <input
              id="section-search"
              type="text"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Course code, title, section or semester"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label
              htmlFor="section-course-filter"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Course
            </label>

            <select
              id="section-course-filter"
              value={courseId}
              onChange={(event) => {
                setCourseId(event.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">All Courses</option>

              {coursesQuery.data?.data.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.code} - {course.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="section-semester-filter"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Semester
            </label>

            <input
              id="section-semester-filter"
              type="text"
              value={semester}
              onChange={(event) => {
                setSemester(event.target.value);
                setPage(1);
              }}
              placeholder="Example: Spring 2026"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>
      </div>

      {deleteError && (
        <div
          role="alert"
          className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {deleteError}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Loading sections...
          </div>
        ) : isError ? (
          <div className="p-8 text-center text-sm text-red-600">
            {getErrorMessage(error)}
          </div>
        ) : data?.data.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No sections found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Course
                  </th>

                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Section
                  </th>

                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Semester
                  </th>

                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Students
                  </th>

                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Instructor
                  </th>

                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Lab Assistant
                  </th>

                  {canManage && (
                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 bg-white">
                {data?.data.map((section) => (
                  <tr key={section.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-semibold text-slate-900">
                        {section.course.code}
                      </div>
                      <div className="max-w-xs text-xs text-slate-500">
                        {section.course.title}
                      </div>
                    </td>

                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
                        {section.name}
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-700">
                      {section.semester}
                    </td>

                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-700">
                      {section.studentCount}
                    </td>

                    <td className="px-6 py-4">
                      {section.instructor ? (
                        <>
                          <div className="text-sm font-medium text-slate-700">
                            {section.instructor.fullName}
                          </div>
                          <div className="text-xs text-slate-500">
                            {section.instructor.email}
                          </div>
                        </>
                      ) : (
                        <span className="text-sm text-slate-400">
                          Not assigned
                        </span>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      {section.labAssistant ? (
                        <>
                          <div className="text-sm font-medium text-slate-700">
                            {section.labAssistant.fullName}
                          </div>
                          <div className="text-xs text-slate-500">
                            {section.labAssistant.email}
                          </div>
                        </>
                      ) : (
                        <span className="text-sm text-slate-400">
                          Not assigned
                        </span>
                      )}
                    </td>

                    {canManage && (
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEditForm(section)}
                            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDelete(section)}
                            disabled={deleteMutation.isPending}
                            className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            {total} section{total === 1 ? "" : "s"}
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

      {isFormOpen && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {editingSection ? "Edit Section" : "Add Section"}
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  {editingSection
                    ? "Update the section and teaching assignments."
                    : "Create a new course section."}
                </p>
              </div>

              <button
                type="button"
                onClick={closeForm}
                className="text-2xl leading-none text-slate-400 transition hover:text-slate-700"
                aria-label="Close section form"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 p-6">
              <div>
                <label
                  htmlFor="section-course"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Course
                </label>

                <select
                  id="section-course"
                  value={form.courseId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      courseId: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Select a course</option>

                  {coursesQuery.data?.data.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.code} - {course.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="section-name"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Section Name
                  </label>

                  <input
                    id="section-name"
                    type="text"
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Example: A"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label
                    htmlFor="section-student-count"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Student Count
                  </label>

                  <input
                    id="section-student-count"
                    type="number"
                    min="0"
                    step="1"
                    value={form.studentCount}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        studentCount: event.target.value,
                      }))
                    }
                    placeholder="Example: 40"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="section-semester"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Semester
                </label>

                <input
                  id="section-semester"
                  type="text"
                  value={form.semester}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      semester: event.target.value,
                    }))
                  }
                  placeholder="Example: Spring 2026"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label
                  htmlFor="section-instructor"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Instructor
                </label>

                <select
                  id="section-instructor"
                  value={form.instructorId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      instructorId: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Not assigned</option>

                  {instructorsQuery.data?.map((instructor) => (
                    <option key={instructor.id} value={instructor.id}>
                      {instructor.fullName} - {instructor.email}
                    </option>
                  ))}
                </select>

                {instructorsQuery.isLoading && (
                  <p className="mt-1 text-xs text-slate-500">
                    Loading instructors...
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="section-lab-assistant"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Lab Assistant
                </label>

                <select
                  id="section-lab-assistant"
                  value={form.labAssistantId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      labAssistantId: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Not assigned</option>

                  {labAssistantsQuery.data?.map((labAssistant) => (
                    <option key={labAssistant.id} value={labAssistant.id}>
                      {labAssistant.fullName} - {labAssistant.email}
                    </option>
                  ))}
                </select>

                {labAssistantsQuery.isLoading && (
                  <p className="mt-1 text-xs text-slate-500">
                    Loading lab assistants...
                  </p>
                )}
              </div>

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
                    : editingSection
                      ? "Save Changes"
                      : "Create Section"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
