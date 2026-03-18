import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import api from "@/services/api";

interface RoleOption {
  id: string;
  code: string;
  name: string;
}

interface IncidentRecord {
  id: string;
  description: string;
  severity: string;
  role_id?: string | null;
  role_name?: string | null;
  location?: string | null;
  created_at: string;
}

const emptyForm = {
  description: "",
  severity: "medium",
  role_id: "",
  location: "",
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

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isCreating = id === "new";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");

  const { data: incident, isLoading } = useQuery<IncidentRecord>({
    queryKey: ["incident", id],
    queryFn: () => api.get(`/incidents/${id}`).then((r) => r.data),
    enabled: Boolean(id) && !isCreating,
  });

  const { data: roles = [] } = useQuery<RoleOption[]>({
    queryKey: ["roles"],
    queryFn: () => api.get("/roles").then((r) => r.data),
  });

  useEffect(() => {
    if (!incident) return;
    setForm({
      description: incident.description,
      severity: incident.severity,
      role_id: incident.role_id ?? "",
      location: incident.location ?? "",
    });
  }, [incident]);

  const createMutation = useMutation({
    mutationFn: () =>
      api
        .post("/incidents", {
          description: form.description,
          severity: form.severity,
          role_id: form.role_id || null,
          location: form.location.trim() || null,
        })
        .then((r) => r.data as IncidentRecord),
    onSuccess: (createdIncident) => {
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
      navigate(`/incidents/${createdIncident.id}`);
    },
    onError: (mutationError) => {
      setError(getErrorMessage(mutationError, "No se pudo crear la incidencia."));
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      api
        .patch(`/incidents/${id}`, {
          description: form.description,
          severity: form.severity,
          role_id: form.role_id || null,
          location: form.location.trim() || null,
        })
        .then((r) => r.data as IncidentRecord),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
      queryClient.invalidateQueries({ queryKey: ["incident", id] });
      setError("");
    },
    onError: (mutationError) => {
      setError(getErrorMessage(mutationError, "No se pudo actualizar la incidencia."));
    },
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (isCreating) {
      createMutation.mutate();
      return;
    }

    updateMutation.mutate();
  }

  if (!isCreating && (isLoading || !incident)) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-3">
        <Link
          to="/incidents"
          className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a incidencias
        </Link>

        <div className="rounded-3xl border border-gray-200 bg-white p-6">
          <div className="flex items-start gap-4">
            <AlertTriangle className="mt-1 h-6 w-6 text-indigo-500" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {isCreating ? "Nueva incidencia" : "Detalle de incidencia"}
              </h1>
              <p className="mt-2 text-sm text-gray-600">
                {isCreating
                  ? "Registrá un incidente nuevo con los datos base necesarios."
                  : "Editá la información operativa principal. El análisis profundo queda para la próxima iteración."}
              </p>
              {!isCreating && incident && (
                <p className="mt-2 text-xs text-gray-400">
                  Creada el {new Date(incident.created_at).toLocaleString("es-AR")}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="grid gap-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Descripción</span>
            <textarea
              required
              rows={5}
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
              placeholder="Describe el incidente..."
            />
          </label>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Severidad</span>
              <select
                value={form.severity}
                onChange={(event) => setForm((current) => ({ ...current, severity: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
              >
                <option value="low">Baja</option>
                <option value="medium">Media</option>
                <option value="high">Alta</option>
                <option value="critical">Crítica</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Rol afectado</span>
              <select
                value={form.role_id}
                onChange={(event) => setForm((current) => ({ ...current, role_id: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
              >
                <option value="">Sin rol</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.code} · {role.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Ubicación</span>
              <input
                value={form.location}
                onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
                placeholder="Ej: Planta Norte"
              />
            </label>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          {error && <p className="mr-auto text-sm text-red-600">{error}</p>}
          <Link
            to="/incidents"
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
            {isCreating ? "Crear incidencia" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </div>
  );
}
