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
  Pencil,
  X,
} from "lucide-react";

interface Incident {
  id: string;
  description: string;
  severity: string;
  role_id?: string | null;
  role_name?: string | null;
  location?: string;
  created_at: string;
}

interface Role {
  id: string;
  name: string;
}

interface SuggestedTraining {
  procedure_id?: string | null;
  procedure_version_id?: string | null;
  training_id?: string | null;
  title: string;
  score: number;
  snippet?: string | null;
}

type FindingType =
  | "not_followed"
  | "needs_redefinition"
  | "missing_procedure"
  | "contributing_factor";

interface AnalysisFinding {
  id: string;
  analysis_run_id: string;
  procedure_id?: string | null;
  procedure_version_id?: string | null;
  procedure_title?: string | null;
  version_number?: number | null;
  training_id?: string | null;
  training_title?: string | null;
  finding_type: FindingType;
  confidence?: number | null;
  reasoning_summary?: string | null;
  recommended_action?: string | null;
  status: string;
  created_at: string;
}

interface AnalysisRun {
  id: string;
  source: string;
  analysis_summary?: string | null;
  resolution_summary?: string | null;
  findings: AnalysisFinding[];
  related_matches: Array<{
    id: string;
    related_incident_id: string;
    related_incident_description: string;
    related_analysis_run_id?: string | null;
    related_analysis_summary?: string | null;
    related_resolution_summary?: string | null;
    related_findings: AnalysisFinding[];
    similarity_score?: number | null;
    rationale?: string | null;
  }>;
}

interface AnalysisFindingDraft {
  procedure_version_id: string;
  finding_type: FindingType;
  reasoning_summary: string;
  recommended_action: string;
}

interface AnalysisDraft {
  run_id?: string | null;
  analysis_summary: string;
  resolution_summary: string;
  findings: AnalysisFindingDraft[];
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

const findingTypeLabels: Record<FindingType, string> = {
  not_followed: "No respetado",
  needs_redefinition: "Requiere actualización",
  missing_procedure: "Falta procedimiento",
  contributing_factor: "Factor contribuyente",
};

const findingTypeClasses: Record<FindingType, string> = {
  not_followed: "bg-red-50 text-red-700 border-red-200",
  needs_redefinition: "bg-amber-50 text-amber-700 border-amber-200",
  missing_procedure: "bg-purple-50 text-purple-700 border-purple-200",
  contributing_factor: "bg-slate-50 text-slate-700 border-slate-200",
};

const emptyFindingDraft = (): AnalysisFindingDraft => ({
  procedure_version_id: "",
  finding_type: "not_followed",
  reasoning_summary: "",
  recommended_action: "",
});

const emptyAnalysisDraft = (): AnalysisDraft => ({
  run_id: null,
  analysis_summary: "",
  resolution_summary: "",
  findings: [emptyFindingDraft()],
});

function isFindingDraftFilled(finding: AnalysisFindingDraft) {
  return !!(
    finding.procedure_version_id ||
    finding.reasoning_summary.trim() ||
    finding.recommended_action.trim()
  );
}

function buildDraftFromRun(run: AnalysisRun): AnalysisDraft {
  return {
    run_id: run.id,
    analysis_summary: run.analysis_summary || "",
    resolution_summary: run.resolution_summary || "",
    findings: run.findings.length
      ? run.findings.map((finding) => ({
          procedure_version_id: finding.procedure_version_id || "",
          finding_type: finding.finding_type,
          reasoning_summary: finding.reasoning_summary || "",
          recommended_action: finding.recommended_action || "",
        }))
      : [emptyFindingDraft()],
  };
}

export default function IncidentsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ description: "", severity: "medium", role_id: "", location: "" });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Record<string, SuggestedTraining[]>>({});
  const [analysisRuns, setAnalysisRuns] = useState<Record<string, AnalysisRun[]>>({});
  const [analysisDrafts, setAnalysisDrafts] = useState<Record<string, AnalysisDraft>>({});
  const [detailsLoading, setDetailsLoading] = useState<Record<string, boolean>>({});
  const [detailsError, setDetailsError] = useState<Record<string, string | null>>({});

  const { data: incidents, isLoading } = useQuery<Incident[]>({
    queryKey: ["incidents"],
    queryFn: () => api.get("/incidents").then((r) => r.data),
  });
  const { data: roles } = useQuery<Role[]>({
    queryKey: ["roles"],
    queryFn: () => api.get("/roles").then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (payload: {
      description: string;
      severity: string;
      role_id?: string;
      location: string;
    }) => api.post("/incidents", payload).then((r) => r.data),
    onSuccess: async (data: Incident) => {
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
      setShowForm(false);
      setForm({ description: "", severity: "medium", role_id: "", location: "" });
      await fetchIncidentInsights(data.id);
    },
  });

  const linkMutation = useMutation({
    mutationFn: ({ incidentId, trainingId }: { incidentId: string; trainingId: string }) =>
      api.post(`/incidents/${incidentId}/link-training`, { training_id: trainingId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
    },
  });

  const analyzeHypothesesMutation = useMutation({
    mutationFn: (incidentId: string) =>
      api.post(`/incidents/${incidentId}/analyze-procedures`).then((r) => r.data),
    onMutate: (incidentId) => {
      setDetailsLoading((prev) => ({ ...prev, [incidentId]: true }));
      setDetailsError((prev) => ({ ...prev, [incidentId]: null }));
    },
    onSuccess: async (_data, incidentId) => {
      await fetchIncidentInsights(incidentId);
    },
    onError: (_error, incidentId) => {
      setDetailsLoading((prev) => ({ ...prev, [incidentId]: false }));
      setDetailsError((prev) => ({ ...prev, [incidentId]: "No se pudo analizar la incidencia." }));
    },
  });

  const saveAnalysisMutation = useMutation({
    mutationFn: ({
      incidentId,
      draft,
    }: {
      incidentId: string;
      draft: AnalysisDraft;
    }) =>
      (
        draft.run_id
          ? api.patch(`/incidents/${incidentId}/analysis-runs/${draft.run_id}`, {
              analysis_summary: draft.analysis_summary || null,
              resolution_summary: draft.resolution_summary || null,
              findings: draft.findings
                .filter(isFindingDraftFilled)
                .map((finding) => ({
                  procedure_version_id: finding.procedure_version_id || null,
                  finding_type: finding.finding_type,
                  reasoning_summary: finding.reasoning_summary || null,
                  recommended_action: finding.recommended_action || null,
                  status: "confirmed",
                })),
            })
          : api.post(`/incidents/${incidentId}/analysis-runs`, {
              analysis_summary: draft.analysis_summary || null,
              resolution_summary: draft.resolution_summary || null,
              findings: draft.findings
                .filter(isFindingDraftFilled)
                .map((finding) => ({
                  procedure_version_id: finding.procedure_version_id || null,
                  finding_type: finding.finding_type,
                  reasoning_summary: finding.reasoning_summary || null,
                  recommended_action: finding.recommended_action || null,
                  status: "confirmed",
                })),
            })
      ).then((r) => r.data),
    onSuccess: (data, variables) => {
      setAnalysisRuns((prev) => ({
        ...prev,
        [variables.incidentId]: [
          data,
          ...(prev[variables.incidentId] ?? []).filter((run) => run.id !== data.id),
        ],
      }));
      setAnalysisDrafts((prev) => ({ ...prev, [variables.incidentId]: emptyAnalysisDraft() }));
      setExpandedId(variables.incidentId);
    },
  });

  async function fetchIncidentInsights(incidentId: string) {
    setDetailsLoading((prev) => ({ ...prev, [incidentId]: true }));
    setDetailsError((prev) => ({ ...prev, [incidentId]: null }));
    try {
      const [{ data: trainingSuggestions }, { data: incidentAnalysisRuns }] = await Promise.all([
        api.get(`/incidents/${incidentId}/suggest-trainings`),
        api.get(`/incidents/${incidentId}/analysis-runs`),
      ]);
      setSuggestions((prev) => ({ ...prev, [incidentId]: trainingSuggestions }));
      setAnalysisRuns((prev) => ({ ...prev, [incidentId]: incidentAnalysisRuns }));
      setExpandedId(incidentId);
    } catch {
      setDetailsError((prev) => ({ ...prev, [incidentId]: "No se pudieron cargar las sugerencias del incidente." }));
    } finally {
      setDetailsLoading((prev) => ({ ...prev, [incidentId]: false }));
    }
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate({
      ...form,
      role_id: form.role_id || undefined,
    });
  }

  function updateDraft(incidentId: string, nextDraft: AnalysisDraft) {
    setAnalysisDrafts((prev) => ({ ...prev, [incidentId]: nextDraft }));
  }

  function startEditingRun(incidentId: string, run: AnalysisRun) {
    updateDraft(incidentId, buildDraftFromRun(run));
    setExpandedId(incidentId);
  }

  return (
    <div className="mx-auto max-w-5xl pt-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Incidentes</h1>
          <p className="mt-1 text-sm text-gray-500">
            Analiza incidentes con IA para detectar procedimientos afectados y acciones de recapacitación
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
              <select
                value={form.role_id}
                onChange={(e) => setForm((f) => ({ ...f, role_id: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <option value="">Sin rol</option>
                {roles?.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
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
            const suggs = suggestions[inc.id] ?? [];
            const analysisDraft = analysisDrafts[inc.id] ?? emptyAnalysisDraft();
            const isLoadingInsights = detailsLoading[inc.id] ?? false;
            const procedureOptions = [
              ...suggs
                .filter((suggestion) => suggestion.procedure_version_id)
                .map((suggestion) => ({
                  value: suggestion.procedure_version_id as string,
                  label: suggestion.title,
                })),
              ...(analysisRuns[inc.id] ?? []).flatMap((run) =>
                run.findings
                  .filter((finding) => finding.procedure_version_id)
                  .map((finding) => ({
                    value: finding.procedure_version_id as string,
                    label: `${finding.procedure_title || "Procedimiento"}${
                      finding.version_number != null ? ` · v${finding.version_number}` : ""
                    }`,
                  })),
              ),
            ]
              .filter(
                (option, index, options) =>
                  options.findIndex((candidate) => candidate.value === option.value) === index,
              );
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
                      {inc.role_name && (
                        <span className="text-xs text-gray-400">Rol: {inc.role_name}</span>
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
                      onClick={() => analyzeHypothesesMutation.mutate(inc.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
                    >
                      <Sparkles className="h-3 w-3" />
                      Analizar procedimiento
                    </button>
                    <button
                      onClick={() =>
                        isExpanded ? setExpandedId(null) : fetchIncidentInsights(inc.id)
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
                    {isLoadingInsights ? (
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Buscando hallazgos y remediaciones relacionadas…
                      </div>
                    ) : detailsError[inc.id] ? (
                      <p className="text-sm text-red-600">{detailsError[inc.id]}</p>
                    ) : (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-gray-500">Remediaciones sugeridas:</p>
                          {suggs.length ? (
                            suggs.map((s) => (
                              <div
                                key={s.training_id ?? s.procedure_version_id ?? s.title}
                                className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-2.5"
                              >
                                <div>
                                  <p className="text-sm font-medium text-gray-800">{s.title}</p>
                                  <p className="text-xs text-gray-400">
                                    Confianza: {(s.score * 100).toFixed(0)}%
                                  </p>
                                  {s.snippet && (
                                    <p className="mt-1 line-clamp-2 text-xs text-gray-500">{s.snippet}</p>
                                  )}
                                </div>
                                {s.training_id ? (
                                  <button
                                    onClick={() =>
                                      linkMutation.mutate({
                                        incidentId: inc.id,
                                        trainingId: s.training_id as string,
                                      })
                                    }
                                    disabled={linkMutation.isPending}
                                    className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                                  >
                                    <LinkIcon className="h-3 w-3" />
                                    Vincular training
                                  </button>
                                ) : (
                                  <span className="text-xs text-gray-400">Sin training derivado</span>
                                )}
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-gray-400">
                              Aún no hay remediaciones derivadas para esta incidencia.
                            </p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-medium text-gray-500">Historial de análisis y hallazgos:</p>
                          </div>
                          {analysisRuns[inc.id]?.length ? (
                            analysisRuns[inc.id].map((run) => (
                              <div
                                key={run.id}
                                className={`rounded-lg border px-4 py-3 ${
                                  run.source === "manual"
                                    ? "border-emerald-100 bg-emerald-50"
                                    : "border-amber-100 bg-amber-50"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p
                                      className={`text-xs font-semibold uppercase tracking-wide ${
                                        run.source === "manual" ? "text-emerald-700" : "text-amber-700"
                                      }`}
                                    >
                                      {run.source === "manual" ? "Análisis manual" : "Análisis IA"}
                                    </p>
                                    {run.analysis_summary && (
                                      <p
                                        className={`mt-1 text-sm ${
                                          run.source === "manual" ? "text-emerald-900" : "text-amber-900"
                                        }`}
                                      >
                                        {run.analysis_summary}
                                      </p>
                                    )}
                                    {run.resolution_summary && (
                                      <p
                                        className={`mt-1 text-xs ${
                                          run.source === "manual" ? "text-emerald-800" : "text-amber-800"
                                        }`}
                                      >
                                        Resolución: {run.resolution_summary}
                                      </p>
                                    )}
                                  </div>
                                  {run.source === "manual" && (
                                    <button
                                      type="button"
                                      onClick={() => startEditingRun(inc.id, run)}
                                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-white/60"
                                    >
                                      <Pencil className="h-3 w-3" />
                                      Editar
                                    </button>
                                  )}
                                </div>
                                <div className="mt-3 space-y-2">
                                  {run.findings.length ? (
                                    run.findings.map((finding) => (
                                      <div key={finding.id} className="rounded-lg border border-white/70 bg-white/70 px-3 py-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span
                                            className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                                              findingTypeClasses[finding.finding_type]
                                            }`}
                                          >
                                            {findingTypeLabels[finding.finding_type]}
                                          </span>
                                          {finding.procedure_title ? (
                                            <span className="text-sm font-medium text-gray-800">
                                              {finding.procedure_title}
                                              {finding.version_number != null ? ` · v${finding.version_number}` : ""}
                                            </span>
                                          ) : (
                                            <span className="text-sm font-medium text-gray-700">
                                              Sin procedimiento versionado asociado
                                            </span>
                                          )}
                                          {finding.confidence != null && (
                                            <span className="text-xs text-gray-400">
                                              {Math.round(finding.confidence * 100)}%
                                            </span>
                                          )}
                                        </div>
                                        {finding.reasoning_summary && (
                                          <p className="mt-2 text-xs text-gray-600">{finding.reasoning_summary}</p>
                                        )}
                                        {finding.recommended_action && (
                                          <p className="mt-1 text-xs font-medium text-gray-700">
                                            Acción recomendada: {finding.recommended_action}
                                          </p>
                                        )}
                                        {finding.training_title && (
                                          <p className="mt-1 text-xs font-medium text-indigo-600">
                                            Training derivado: {finding.training_title}
                                          </p>
                                        )}
                                      </div>
                                    ))
                                  ) : (
                                    <p className="text-xs text-gray-500">Este análisis no tiene hallazgos cargados.</p>
                                  )}
                                </div>
                                {!!run.related_matches.length && (
                                  <div className="mt-3 space-y-2">
                                    <p className="text-xs font-medium text-gray-500">Precedentes reutilizados:</p>
                                    {run.related_matches.map((match) => (
                                      <div key={match.id} className="rounded border border-white/70 bg-white/70 px-3 py-2">
                                        <p className="text-xs text-gray-700">
                                          {match.related_incident_description} · similitud{" "}
                                          {((match.similarity_score || 0) * 100).toFixed(0)}%
                                        </p>
                                        {match.related_analysis_summary && (
                                          <p className="mt-1 text-xs text-gray-600">
                                            Análisis reutilizado: {match.related_analysis_summary}
                                          </p>
                                        )}
                                        {match.related_resolution_summary && (
                                          <p className="mt-1 text-xs text-gray-600">
                                            Resolución previa: {match.related_resolution_summary}
                                          </p>
                                        )}
                                        {match.rationale && (
                                          <p className="mt-1 text-xs text-gray-500">{match.rationale}</p>
                                        )}
                                        {!!match.related_findings.length && (
                                          <div className="mt-2 space-y-1">
                                            {match.related_findings.map((finding) => (
                                              <div key={finding.id} className="rounded border border-gray-200 bg-gray-50 px-2 py-2">
                                                <p className="text-xs font-medium text-gray-700">
                                                  {findingTypeLabels[finding.finding_type]}
                                                  {finding.procedure_title
                                                    ? ` · ${finding.procedure_title}${
                                                        finding.version_number != null
                                                          ? ` v${finding.version_number}`
                                                          : ""
                                                      }`
                                                    : ""}
                                                </p>
                                                {finding.reasoning_summary && (
                                                  <p className="mt-1 text-xs text-gray-500">
                                                    {finding.reasoning_summary}
                                                  </p>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-gray-400">
                              Todavía no hay análisis guardados para esta incidencia.
                            </p>
                          )}
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-white p-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-medium text-gray-500">
                              {analysisDraft.run_id ? "Editar análisis manual" : "Guardar análisis manual"}
                            </p>
                            {analysisDraft.run_id && (
                              <button
                                type="button"
                                onClick={() => updateDraft(inc.id, emptyAnalysisDraft())}
                                className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                              >
                                <X className="h-3 w-3" />
                                Cancelar edición
                              </button>
                            )}
                          </div>
                          <textarea
                            rows={3}
                            value={analysisDraft.analysis_summary}
                            onChange={(event) =>
                              updateDraft(inc.id, { ...analysisDraft, analysis_summary: event.target.value })
                            }
                            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            placeholder="Conclusión o análisis del incidente…"
                          />
                          <textarea
                            rows={2}
                            value={analysisDraft.resolution_summary}
                            onChange={(event) =>
                              updateDraft(inc.id, { ...analysisDraft, resolution_summary: event.target.value })
                            }
                            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            placeholder="Resolución o acción correctiva…"
                          />
                          <div className="mt-3 space-y-3">
                            {analysisDraft.findings.map((finding, index) => (
                              <div key={`${inc.id}-finding-${index}`} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                                <div className="grid gap-2 md:grid-cols-2">
                                  <select
                                    value={finding.procedure_version_id}
                                    onChange={(event) =>
                                      updateDraft(inc.id, {
                                        ...analysisDraft,
                                        findings: analysisDraft.findings.map((item, itemIndex) =>
                                          itemIndex === index
                                            ? { ...item, procedure_version_id: event.target.value }
                                            : item,
                                        ),
                                      })
                                    }
                                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                  >
                                    <option value="">Sin procedimiento versionado</option>
                                    {procedureOptions.map((option) => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                  <select
                                    value={finding.finding_type}
                                    onChange={(event) =>
                                      updateDraft(inc.id, {
                                        ...analysisDraft,
                                        findings: analysisDraft.findings.map((item, itemIndex) =>
                                          itemIndex === index
                                            ? {
                                                ...item,
                                                finding_type: event.target.value as FindingType,
                                              }
                                            : item,
                                        ),
                                      })
                                    }
                                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                  >
                                    {Object.entries(findingTypeLabels).map(([value, label]) => (
                                      <option key={value} value={value}>
                                        {label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <textarea
                                  rows={2}
                                  value={finding.reasoning_summary}
                                  onChange={(event) =>
                                    updateDraft(inc.id, {
                                      ...analysisDraft,
                                      findings: analysisDraft.findings.map((item, itemIndex) =>
                                        itemIndex === index
                                          ? { ...item, reasoning_summary: event.target.value }
                                          : item,
                                      ),
                                    })
                                  }
                                  className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                  placeholder="Explicación del hallazgo…"
                                />
                                <textarea
                                  rows={2}
                                  value={finding.recommended_action}
                                  onChange={(event) =>
                                    updateDraft(inc.id, {
                                      ...analysisDraft,
                                      findings: analysisDraft.findings.map((item, itemIndex) =>
                                        itemIndex === index
                                          ? { ...item, recommended_action: event.target.value }
                                          : item,
                                      ),
                                    })
                                  }
                                  className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                  placeholder="Acción recomendada…"
                                />
                                {analysisDraft.findings.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateDraft(inc.id, {
                                        ...analysisDraft,
                                        findings: analysisDraft.findings.filter((_, itemIndex) => itemIndex !== index),
                                      })
                                    }
                                    className="mt-2 text-xs font-medium text-red-600 hover:text-red-700"
                                  >
                                    Eliminar hallazgo
                                  </button>
                                )}
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() =>
                                updateDraft(inc.id, {
                                  ...analysisDraft,
                                  findings: [...analysisDraft.findings, emptyFindingDraft()],
                                })
                              }
                              className="rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
                            >
                              Agregar hallazgo
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              saveAnalysisMutation.mutate({
                                incidentId: inc.id,
                                draft: analysisDraft,
                              })
                            }
                            disabled={
                              !analysisDraft.analysis_summary.trim() &&
                              !analysisDraft.resolution_summary.trim() &&
                              !analysisDraft.findings.some(isFindingDraftFilled)
                                ? true
                                : saveAnalysisMutation.isPending
                            }
                            className="mt-3 rounded-lg border border-indigo-200 px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                          >
                            {analysisDraft.run_id ? "Actualizar análisis" : "Guardar análisis"}
                          </button>
                        </div>
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
