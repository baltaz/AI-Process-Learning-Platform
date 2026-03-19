import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Clock3, Loader2, Plus } from "lucide-react";
import { Link } from "react-router-dom";

import api from "@/services/api";

interface IncidentItem {
  id: string;
  description: string;
  severity: string;
  status: "open" | "closed";
  role_name?: string | null;
  location?: string | null;
  created_at: string;
  closed_at?: string | null;
}

const severityMeta: Record<string, string> = {
  low: "bg-emerald-50 text-emerald-700",
  medium: "bg-amber-50 text-amber-700",
  high: "bg-orange-50 text-orange-700",
  critical: "bg-red-50 text-red-700",
};

const severityLabel: Record<string, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  critical: "Crítica",
};

const statusMeta: Record<IncidentItem["status"], string> = {
  open: "bg-indigo-50 text-indigo-700",
  closed: "bg-slate-100 text-slate-700",
};

const statusLabel: Record<IncidentItem["status"], string> = {
  open: "Abierta",
  closed: "Cerrada",
};

export default function AdminIncidentsPage() {
  const [statusFilter, setStatusFilter] = useState<"all" | IncidentItem["status"]>("all");
  const { data: incidents, isLoading } = useQuery<IncidentItem[]>({
    queryKey: ["incidents"],
    queryFn: () => api.get("/incidents").then((r) => r.data),
  });
  const filteredIncidents = useMemo(() => {
    if (!incidents) return [];
    if (statusFilter === "all") return incidents;
    return incidents.filter((incident) => incident.status === statusFilter);
  }, [incidents, statusFilter]);
  const counts = useMemo(
    () => ({
      all: incidents?.length ?? 0,
      open: incidents?.filter((incident) => incident.status === "open").length ?? 0,
      closed: incidents?.filter((incident) => incident.status === "closed").length ?? 0,
    }),
    [incidents],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Incidencias</h1>
          <p className="mt-1 text-sm text-gray-500">
            Primera iteración enfocada en registro, seguimiento y consulta básica del incidente.
          </p>
        </div>
        <Link
          to="/incidents/new"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Nueva incidencia
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { value: "all" as const, label: "Todas", count: counts.all },
          { value: "open" as const, label: "Abiertas", count: counts.open },
          { value: "closed" as const, label: "Cerradas", count: counts.closed },
        ].map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setStatusFilter(filter.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              statusFilter === filter.value
                ? "bg-indigo-600 text-white"
                : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"
            }`}
          >
            {filter.label} · {filter.count}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      ) : !filteredIncidents.length ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 py-16 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm font-medium text-gray-600">No hay incidencias para este filtro</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredIncidents.map((incident) => (
            <Link
              key={incident.id}
              to={`/incidents/${incident.id}`}
              className="block rounded-2xl border border-gray-200 bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        severityMeta[incident.severity] ?? "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {severityLabel[incident.severity] ?? incident.severity}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusMeta[incident.status]}`}>
                      {statusLabel[incident.status]}
                    </span>
                    {incident.role_name && (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                        {incident.role_name}
                      </span>
                    )}
                    {incident.location && (
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">
                        {incident.location}
                      </span>
                    )}
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm text-gray-800">{incident.description}</p>
                  <div className="mt-3 flex items-center gap-1 text-xs text-gray-400">
                    <Clock3 className="h-3.5 w-3.5" />
                    {incident.status === "closed" && incident.closed_at
                      ? `Cerrada ${new Date(incident.closed_at).toLocaleString("es-AR")}`
                      : new Date(incident.created_at).toLocaleString("es-AR")}
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 flex-shrink-0 text-gray-300" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
