import { useEffect, useMemo, useState } from "react";
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
  start_time?: number | null;
  end_time?: number | null;
  score: number;
}

export default function SearchPage() {
  const role = getDemoRole();
  const user = getStoredUser();
  const [searchParams] = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");

  useEffect(() => {
    if (!urlQuery || urlQuery === submitted) return;
    setQuery(urlQuery);
    setSubmitted(urlQuery);
  }, [submitted, urlQuery]);

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

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) setSubmitted(query.trim());
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900">Búsqueda Semántica</h1>
      <p className="mt-1 text-sm text-gray-500">
        {role === "operator"
          ? "Busca procedimientos de forma semántica y explora coincidencias relacionadas en tus trainings y en incidencias."
          : "Busca procedimientos por significado usando la inteligencia generada a nivel de `ProcedureVersion`."}
      </p>

      <form onSubmit={handleSearch} className="mt-6 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            placeholder="Ej: elaboración de chocotorta, seguridad en cocina…"
          />
        </div>
        <button
          type="submit"
          disabled={!query.trim() || isLoading}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Buscar
        </button>
      </form>

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
                        <p className="mt-1 text-xs text-indigo-600">Versión relevante: v{r.version_number}</p>
                        <p className="mt-2 text-sm leading-relaxed text-gray-600">{r.snippet}</p>
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
