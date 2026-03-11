import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/services/api";
import {
  AlertTriangle,
  Plus,
  Loader2,
  Sparkles,
  Link as LinkIcon,
  ChevronDown,
  ChevronUp,
  Clock,
  Shield,
} from "lucide-react";

interface Incident {
  id: string;
  description: string;
  severity: string;
  role?: string;
  location?: string;
  created_at: string;
}

interface SuggestedTraining {
  training_id: string;
  training_title: string;
  confidence: number;
}

const severityConfig: Record<string, string> = {
  low: "bg-yellow-100 text-yellow-800",
  medium: "bg-orange-100 text-orange-800",
  high: "bg-red-100 text-red-800",
  critical: "bg-red-200 text-red-900",
};

const severityLabels: Record<string, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  critical: "Crítica",
};

export default function IncidentsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ description: "", severity: "medium", role: "", location: "" });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Record<string, SuggestedTraining[]>>({});

  const { data: incidents, isLoading } = useQuery<Incident[]>({
    queryKey: ["incidents"],
    queryFn: () => api.get("/incidents").then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (payload: typeof form) => api.post("/incidents", payload).then((r) => r.data),
    onSuccess: async (data: Incident) => {
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
      setShowForm(false);
      setForm({ description: "", severity: "medium", role: "", location: "" });
      try {
        const { data: suggs } = await api.get(`/incidents/${data.id}/suggest-trainings`);
        setSuggestions((prev) => ({ ...prev, [data.id]: suggs }));
        setExpandedId(data.id);
      } catch {
        /* ignore */
      }
    },
  });

  const linkMutation = useMutation({
    mutationFn: ({ incidentId, trainingId }: { incidentId: string; trainingId: string }) =>
      api.post(`/incidents/${incidentId}/link-training`, { training_id: trainingId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
    },
  });

  async function fetchSuggestions(incidentId: string) {
    try {
      const { data } = await api.get(`/incidents/${incidentId}/suggest-trainings`);
      setSuggestions((prev) => ({ ...prev, [incidentId]: data }));
      setExpandedId(incidentId);
    } catch {
      /* ignore */
    }
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate(form);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Incidentes</h1>
          <p className="mt-1 text-sm text-gray-500">
            Registra incidentes y obtén sugerencias de capacitaciones relevantes
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Nuevo Incidente
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-6 space-y-4 rounded-2xl border border-gray-200 bg-white p-6"
        >
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Descripción</span>
            <textarea
              required
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="Describe el incidente…"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Severidad</span>
              <select
                value={form.severity}
                onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <option value="low">Baja</option>
                <option value="medium">Media</option>
                <option value="high">Alta</option>
                <option value="critical">Crítica</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Rol</span>
              <input
                type="text"
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                placeholder="Ej: Cocina"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Ubicación</span>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                placeholder="Ej: Sucursal Norte"
              />
            </label>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Registrar Incidente
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
          {createMutation.isError && (
            <p className="text-sm text-red-600">Error al registrar el incidente.</p>
          )}
        </form>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      ) : !incidents?.length ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 py-16 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm font-medium text-gray-600">No hay incidentes registrados</p>
        </div>
      ) : (
        <div className="space-y-3">
          {incidents.map((inc) => {
            const isExpanded = expandedId === inc.id;
            const suggs = suggestions[inc.id];
            return (
              <div
                key={inc.id}
                className="rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-sm"
              >
                <div className="flex items-start gap-4 p-5">
                  <Shield className="mt-0.5 h-5 w-5 flex-shrink-0 text-gray-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800">{inc.description}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          severityConfig[inc.severity] ?? "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {severityLabels[inc.severity] ?? inc.severity}
                      </span>
                      {inc.role && (
                        <span className="text-xs text-gray-400">Rol: {inc.role}</span>
                      )}
                      {inc.location && (
                        <span className="text-xs text-gray-400">Ubicación: {inc.location}</span>
                      )}
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Clock className="h-3 w-3" />
                        {new Date(inc.created_at).toLocaleDateString("es-AR")}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        isExpanded ? setExpandedId(null) : fetchSuggestions(inc.id)
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                    >
                      <Sparkles className="h-3 w-3 text-indigo-500" />
                      Sugerencias
                      {isExpanded ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100 px-5 py-4">
                    {!suggs ? (
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Buscando capacitaciones relevantes…
                      </div>
                    ) : suggs.length === 0 ? (
                      <p className="text-sm text-gray-400">
                        No se encontraron capacitaciones relacionadas.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-gray-500">
                          Capacitaciones sugeridas:
                        </p>
                        {suggs.map((s) => (
                          <div
                            key={s.training_id}
                            className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-2.5"
                          >
                            <div>
                              <p className="text-sm font-medium text-gray-800">
                                {s.training_title}
                              </p>
                              <p className="text-xs text-gray-400">
                                Confianza: {(s.confidence * 100).toFixed(0)}%
                              </p>
                            </div>
                            <button
                              onClick={() =>
                                linkMutation.mutate({
                                  incidentId: inc.id,
                                  trainingId: s.training_id,
                                })
                              }
                              disabled={linkMutation.isPending}
                              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                            >
                              <LinkIcon className="h-3 w-3" />
                              Vincular
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
