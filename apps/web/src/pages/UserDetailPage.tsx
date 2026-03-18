import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Trash2, UserCircle2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { getStoredUser } from "@/lib/auth";
import api from "@/services/api";

interface RoleOption {
  id: string;
  code: string;
  name: string;
}

interface UserRoleAssignment {
  id: string;
  role_id: string;
  location: string | null;
  status: string;
  starts_on: string | null;
  ends_on: string | null;
  created_at: string;
  role: RoleOption;
}

interface UserRecord {
  id: string;
  name: string;
  email: string;
  location: string | null;
  created_at: string;
  role_assignments: UserRoleAssignment[];
}

interface RoleAssignmentFormState {
  id?: string;
  role_id: string;
  location: string;
  status: string;
  starts_on: string;
  ends_on: string;
}

interface UserFormState {
  name: string;
  email: string;
  location: string;
  password: string;
  role_assignments: RoleAssignmentFormState[];
}

const emptyAssignment: RoleAssignmentFormState = {
  role_id: "",
  location: "",
  status: "active",
  starts_on: "",
  ends_on: "",
};

const emptyForm: UserFormState = {
  name: "",
  email: "",
  location: "",
  password: "",
  role_assignments: [emptyAssignment],
};

function getErrorMessage(error: unknown, fallback: string) {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof (error as { response?: { data?: { detail?: string } } }).response?.data?.detail === "string"
  ) {
    return (error as { response?: { data?: { detail?: string } } }).response!.data!.detail!;
  }
  return fallback;
}

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentUser = getStoredUser();
  const isCreating = id === "new";
  const [form, setForm] = useState<UserFormState>(emptyForm);
  const [error, setError] = useState("");

  const { data: user, isLoading } = useQuery<UserRecord>({
    queryKey: ["user", id],
    queryFn: () => api.get(`/users/${id}`).then((r) => r.data),
    enabled: Boolean(id) && !isCreating,
  });

  const { data: roles = [] } = useQuery<RoleOption[]>({
    queryKey: ["roles"],
    queryFn: () => api.get("/roles").then((r) => r.data),
  });

  useEffect(() => {
    if (!user) return;
    setForm({
      name: user.name,
      email: user.email,
      location: user.location ?? "",
      password: "",
      role_assignments: user.role_assignments.length
        ? user.role_assignments.map((assignment) => ({
            id: assignment.id,
            role_id: assignment.role_id,
            location: assignment.location ?? "",
            status: assignment.status,
            starts_on: assignment.starts_on ?? "",
            ends_on: assignment.ends_on ?? "",
          }))
        : [emptyAssignment],
    });
  }, [user]);

  const payload = useMemo(
    () => ({
      name: form.name,
      email: form.email,
      location: form.location.trim() || null,
      ...(form.password.trim() ? { password: form.password } : {}),
      role_assignments: form.role_assignments
        .filter((assignment) => assignment.role_id)
        .map((assignment) => ({
          ...(assignment.id ? { id: assignment.id } : {}),
          role_id: assignment.role_id,
          location: assignment.location.trim() || null,
          status: assignment.status,
          ...(assignment.starts_on ? { starts_on: assignment.starts_on } : {}),
          ...(assignment.ends_on ? { ends_on: assignment.ends_on } : {}),
        })),
    }),
    [form],
  );

  const createMutation = useMutation({
    mutationFn: () => api.post("/users", { ...payload, password: form.password }).then((r) => r.data as UserRecord),
    onSuccess: (createdUser) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      navigate(`/users/${createdUser.id}`);
    },
    onError: (mutationError) => {
      setError(getErrorMessage(mutationError, "No se pudo crear el usuario."));
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => api.patch(`/users/${id}`, payload).then((r) => r.data as UserRecord),
    onSuccess: (updatedUser) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["user", id] });
      if (currentUser?.id === updatedUser.id) {
        localStorage.setItem(
          "user",
          JSON.stringify({
            ...currentUser,
            name: updatedUser.name,
            email: updatedUser.email,
            location: updatedUser.location,
          }),
        );
      }
      setError("");
    },
    onError: (mutationError) => {
      setError(getErrorMessage(mutationError, "No se pudo actualizar el usuario."));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      navigate("/users");
    },
    onError: (mutationError) => {
      setError(getErrorMessage(mutationError, "No se pudo eliminar el usuario."));
    },
  });

  function setAssignment(index: number, patch: Partial<RoleAssignmentFormState>) {
    setForm((current) => ({
      ...current,
      role_assignments: current.role_assignments.map((assignment, assignmentIndex) =>
        assignmentIndex === index ? { ...assignment, ...patch } : assignment
      ),
    }));
  }

  function addAssignmentRow() {
    setForm((current) => ({
      ...current,
      role_assignments: [...current.role_assignments, { ...emptyAssignment }],
    }));
  }

  function removeAssignmentRow(index: number) {
    setForm((current) => ({
      ...current,
      role_assignments:
        current.role_assignments.length === 1
          ? [{ ...emptyAssignment }]
          : current.role_assignments.filter((_, assignmentIndex) => assignmentIndex !== index),
    }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (isCreating) {
      createMutation.mutate();
      return;
    }

    updateMutation.mutate();
  }

  function handleDelete() {
    if (!id || isCreating || deleteMutation.isPending) return;
    const confirmed = window.confirm("¿Seguro que querés eliminar este usuario?");
    if (!confirmed) return;
    deleteMutation.mutate();
  }

  if (!isCreating && (isLoading || !user)) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-3">
        <Link
          to="/users"
          className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a usuarios
        </Link>
        <div className="rounded-3xl border border-gray-200 bg-white p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <UserCircle2 className="mt-1 h-6 w-6 text-indigo-500" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {isCreating ? "Nuevo usuario" : user?.name}
                </h1>
                <p className="mt-2 text-sm text-gray-600">
                  {isCreating
                    ? "Creá un usuario y definí sus asignaciones de rol."
                    : "Editá los datos base del usuario y sus roles activos o históricos."}
                </p>
              </div>
            </div>
            {!isCreating && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Eliminar
              </button>
            )}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-gray-900">Datos del usuario</h2>
          <div className="mt-4 space-y-3">
            <input
              required
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
              placeholder="Nombre"
            />
            <input
              required
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
              placeholder="Email"
            />
            <input
              value={form.location}
              onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
              placeholder="Ubicación"
            />
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
              placeholder={isCreating ? "Contraseña" : "Nueva contraseña (opcional)"}
              required={isCreating}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Asignaciones de rol</h2>
              <p className="mt-1 text-sm text-gray-500">Gestioná los roles activos e históricos del usuario.</p>
            </div>
            <button
              type="button"
              onClick={addAssignmentRow}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Agregar fila
            </button>
          </div>

          <div className="mt-4 space-y-4">
            {form.role_assignments.map((assignment, index) => (
              <div key={`${assignment.id ?? "new"}-${index}`} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <select
                    value={assignment.role_id}
                    onChange={(event) => setAssignment(index, { role_id: event.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
                  >
                    <option value="">Seleccionar rol</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.code} · {role.name}
                      </option>
                    ))}
                  </select>
                  <input
                    value={assignment.location}
                    onChange={(event) => setAssignment(index, { location: event.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
                    placeholder="Ubicación"
                  />
                  <select
                    value={assignment.status}
                    onChange={(event) => setAssignment(index, { status: event.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
                  >
                    <option value="active">Activa</option>
                    <option value="inactive">Inactiva</option>
                  </select>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="date"
                      value={assignment.starts_on}
                      onChange={(event) => setAssignment(index, { starts_on: event.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
                    />
                    <input
                      type="date"
                      value={assignment.ends_on}
                      onChange={(event) => setAssignment(index, { ends_on: event.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
                    />
                  </div>
                </div>

                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => removeAssignmentRow(index)}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Quitar fila
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="lg:col-span-2 flex items-center justify-end gap-3">
          {error && <p className="mr-auto text-sm text-red-600">{error}</p>}
          <Link
            to="/users"
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isCreating ? "Crear usuario" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </div>
  );
}
