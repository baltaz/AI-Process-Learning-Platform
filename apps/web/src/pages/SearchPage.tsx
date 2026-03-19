import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/services/api";
import { Search, Loader2, Clock, FileText, AlertTriangle, BookOpen } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { getDemoRole, getStoredUser } from "@/lib/auth";
import type { AssignmentItem, IncidentItem } from "@/lib/operatorData";

interface SearchResult {
  procedure_id: string;
  procedure_version_id: string;
  procedure_code: string;
  procedure_title: string;
  version_number: number;
  training_id?: string | null;
  training_title?: string | null;
  snippet: string;
  step_index?: number | null;
  step_title?: string | null;
  reference_segment_range?: string | null;
  reference_quote?: string | null;
  match_source?: string | null;
  start_time?: number | null;
  end_time?: number | null;
  score: number;
}

export default function SearchPage() {
  const role = getDemoRole();
  const user = getStoredUser();
  const [searchParams] = useSearchParams();
  const submitted = (searchParams.get("q") ?? "").trim();

  const { data: results, isLoading: proceduresLoading } = useQuery<SearchResult[]>({
    queryKey: ["search", submitted],
    queryFn: () => api.get("/procedures/search", { params: { q: submitted } }).then((r) => r.data),
    enabled: !!submitted,
  });

  const { data: assignments = [], isLoading: trainingsLoading } = useQuery<AssignmentItem[]>({
    queryKey: ["search-trainings", submitted, user?.id],
    queryFn: () => api.get("/assignments", { params: { user_id: user?.id } }).then((r) => r.data),
    enabled: role === "operator" && !!submitted && Boolean(user?.id),
  });

  const { data: incidents = [], isLoading: incidentsLoading } = useQuery<IncidentItem[]>({
    queryKey: ["search-incidents", submitted],
    queryFn: () => api.get("/incidents").then((r) => r.data),
    enabled: role === "operator" && !!submitted,
  });

  const normalizedQuery = submitted.trim().toLowerCase();
  const trainingMatches = useMemo(() => {
    if (role !== "operator" || !normalizedQuery) return [];
    return assignments.filter((item) =>
      `${item.training_title ?? ""} ${item.status} ${item.score ?? ""}`.toLowerCase().includes(normalizedQuery),
    );
  }, [assignments, normalizedQuery, role]);

  const incidentMatches = useMemo(() => {
    if (role !== "operator" || !normalizedQuery) return [];
    return incidents.filter((item) =>
      `${item.description} ${item.role_name ?? ""} ${item.location ?? ""}`.toLowerCase().includes(normalizedQuery),
    );
  }, [incidents, normalizedQuery, role]);

  const isLoading =
    proceduresLoading || (role === "operator" && (trainingsLoading || incidentsLoading));
  const totalResults =
    (results?.length ?? 0) +
    (role === "operator" ? trainingMatches.length + incidentMatches.length : 0);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900">Búsqueda Semántica</h1>
      <p className="mt-1 text-sm text-gray-500">
        {role === "operator"
          ? "Busca procedimientos de forma semántica y explora coincidencias relacionadas en tus trainings y en incidencias."
          : "Busca procedimientos por significado usando la inteligencia generada a nivel de `ProcedureVersion`."}
      </p>

      <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
        {submitted
          ? `Mostrando resultados para "${submitted}". Puedes cambiar la búsqueda desde el buscador superior.`
          : "Usa el buscador superior para iniciar una búsqueda semántica."}
      </div>

      <div className="mt-8">
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
          </div>
        )}

        {submitted && !isLoading && totalResults === 0 && (
          <div className="rounded-xl border-2 border-dashed border-gray-200 py-14 text-center">
            <Search className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-3 text-sm text-gray-500">
              No se encontraron resultados para &ldquo;{submitted}&rdquo;
            </p>
          </div>
        )}

        {submitted && totalResults > 0 && (
          <div className="space-y-6">
            <p className="text-xs text-gray-400">
              {totalResults} resultado{totalResults !== 1 && "s"}
            </p>

            {results && results.length > 0 && (
              <ResultSection title="Procedimientos" icon={<FileText className="h-4 w-4 text-indigo-500" />}>
                {results.map((r, i) => (
                  <Link
                    key={i}
                    to={`/procedures/${r.procedure_id}`}
                    className="block rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-semibold text-gray-900">
                          {r.procedure_code} · {r.procedure_title}
                        </h3>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          <p className="text-indigo-600">Versión relevante: v{r.version_number}</p>
                          <p className="text-gray-500">Relación: {(r.score * 100).toFixed(0)}%</p>
                        </div>
                        {r.step_title && (
                          <p className="mt-2 text-xs font-medium text-gray-500">
                            Paso {r.step_index}: {r.step_title}
                          </p>
                        )}
                        <p className="mt-2 text-sm leading-relaxed text-gray-600">{r.snippet}</p>
                        {r.reference_segment_range && (
                          <p className="mt-2 text-xs text-gray-500">
                            Referencia fuente: {r.reference_segment_range}
                          </p>
                        )}
                        {r.training_title && (
                          <p className="mt-2 text-xs text-gray-500">
                            Training derivado disponible: {r.training_title}
                          </p>
                        )}
                        {(r.start_time || r.end_time) && (
                          <div className="mt-2 flex items-center gap-1 text-xs text-gray-400">
                            <Clock className="h-3 w-3" />
                            {Math.floor(r.start_time ?? 0)}s
                            {r.end_time != null ? ` – ${Math.floor(r.end_time)}s` : ""}
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </ResultSection>
            )}

            {role === "operator" && trainingMatches.length > 0 && (
              <ResultSection title="Trainings" icon={<BookOpen className="h-4 w-4 text-amber-500" />}>
                {trainingMatches.map((training) => (
                  <Link
                    key={training.id}
                    to={`/trainings/${training.id}`}
                    className="block rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md"
                  >
                    <h3 className="text-sm font-semibold text-gray-900">
                      {training.training_title || "Training asignado"}
                    </h3>
                    <p className="mt-2 text-sm text-gray-600">
                      Estado: {training.status}
                      {training.score != null ? ` · Puntaje ${training.score}%` : ""}
                    </p>
                  </Link>
                ))}
              </ResultSection>
            )}

            {role === "operator" && incidentMatches.length > 0 && (
              <ResultSection title="Incidencias" icon={<AlertTriangle className="h-4 w-4 text-red-500" />}>
                {incidentMatches.map((incident) => (
                  <Link
                    key={incident.id}
                    to={`/incidents/${incident.id}`}
                    className="block rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md"
                  >
                    <h3 className="text-sm font-semibold text-gray-900">
                      {incident.role_name || "Incidencia operativa"}
                    </h3>
                    <p className="mt-2 line-clamp-3 text-sm text-gray-600">{incident.description}</p>
                  </Link>
                ))}
              </ResultSection>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ResultSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
        {icon}
        {title}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
