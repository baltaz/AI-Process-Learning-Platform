import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronsUpDown,
  Clock,
  FileText,
  GitBranch,
  Link as LinkIcon,
  Loader2,
  Pencil,
  Search,
  Shield,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
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
  status: "open" | "closed";
  role_id?: string | null;
  role_name?: string | null;
  role_code?: string | null;
  location?: string | null;
  created_at: string;
  closed_at?: string | null;
  closed_by?: string | null;
}

interface ProcedurePreviewMatch {
  procedure_id?: string | null;
  procedure_version_id?: string | null;
  procedure_code?: string | null;
  procedure_title?: string | null;
  version_number?: number | null;
  training_id?: string | null;
  training_title?: string | null;
  score: number;
  snippet: string;
  step_index?: number | null;
  step_title?: string | null;
  reference_segment_range?: string | null;
  reference_quote?: string | null;
  match_source?: string | null;
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
  incident_id: string;
  source: string;
  analysis_summary?: string | null;
  resolution_summary?: string | null;
  created_at: string;
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

interface IncidentAnalysisPreview {
  procedure_matches: ProcedurePreviewMatch[];
  similar_analyses: Array<{
    incident_id: string;
    description: string;
    similarity_score: number;
    analysis_run: AnalysisRun;
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

interface ProcedureOption {
  value: string;
  label: string;
}

interface ProcedureListItem {
  id: string;
  title: string;
  latest_version?: {
    id: string;
  } | null;
}

const emptyForm = {
  description: "",
  severity: "medium",
  role_id: "",
  location: "",
};

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

const statusMeta: Record<IncidentRecord["status"], string> = {
  open: "bg-indigo-50 text-indigo-700",
  closed: "bg-slate-100 text-slate-700",
};

const statusLabel: Record<IncidentRecord["status"], string> = {
  open: "Abierta",
  closed: "Cerrada",
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

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
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

function ProcedureVersionCombobox({
  value,
  options,
  disabled,
  onChange,
}: {
  value: string;
  options: ProcedureOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return options;
    return options.filter((option) => option.label.toLowerCase().includes(normalizedQuery));
  }, [options, query]);

  function handleSelect(nextValue: string) {
    onChange(nextValue);
    setQuery("");
    setIsOpen(false);
  }

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsOpen(false);
          setQuery("");
        }
      }}
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          value={isOpen ? query : selectedOption?.label || ""}
          onFocus={() => {
            if (disabled) return;
            setIsOpen(true);
            setQuery(selectedOption?.label || "");
          }}
          onChange={(event) => {
            setIsOpen(true);
            setQuery(event.target.value);
          }}
          disabled={disabled}
          className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-10 text-sm disabled:bg-gray-100"
          placeholder="Buscar procedimiento..."
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            setIsOpen((current) => {
              const next = !current;
              if (next) {
                setQuery(selectedOption?.label || "");
              }
              return next;
            });
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100 disabled:cursor-not-allowed"
        >
          <ChevronsUpDown className="h-4 w-4" />
        </button>
      </div>

      {isOpen && (
        <div className="absolute z-10 mt-2 max-h-64 w-full overflow-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => handleSelect("")}
            className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            <span>Sin procedimiento versionado</span>
            {!value && <Check className="h-4 w-4 text-indigo-600" />}
          </button>
          {filteredOptions.length ? (
            filteredOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelect(option.value)}
                className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                <span>{option.label}</span>
                {option.value === value && <Check className="h-4 w-4 text-indigo-600" />}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-gray-400">No se encontraron procedimientos.</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isCreating = !id || id === "new";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [isEditingIncident, setIsEditingIncident] = useState(isCreating);
  const [analysisDraft, setAnalysisDraft] = useState<AnalysisDraft>(emptyAnalysisDraft());
  const [analysisPreview, setAnalysisPreview] = useState<IncidentAnalysisPreview | null>(null);

  const { data: incident, isLoading } = useQuery<IncidentRecord>({
    queryKey: ["incident", id],
    queryFn: () => api.get(`/incidents/${id}`).then((r) => r.data),
    enabled: Boolean(id) && !isCreating,
  });

  const { data: roles = [] } = useQuery<RoleOption[]>({
    queryKey: ["roles"],
    queryFn: () => api.get("/roles").then((r) => r.data),
  });
  const { data: procedures = [] } = useQuery<ProcedureListItem[]>({
    queryKey: ["procedures"],
    queryFn: () => api.get("/procedures").then((r) => r.data),
  });
  const {
    data: analysisRuns = [],
    isLoading: analysisLoading,
    refetch: refetchAnalysisRuns,
  } = useQuery<AnalysisRun[]>({
    queryKey: ["incident-analysis-runs", id],
    queryFn: () => api.get(`/incidents/${id}/analysis-runs`).then((r) => r.data),
    enabled: Boolean(id) && !isCreating,
  });

  useEffect(() => {
    if (!incident) {
      setAnalysisDraft(emptyAnalysisDraft());
      setAnalysisPreview(null);
      return;
    }
    setForm({
      description: incident.description,
      severity: incident.severity,
      role_id: incident.role_id ?? "",
      location: incident.location ?? "",
    });
    setAnalysisPreview(null);
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
    mutationFn: (payload: {
      description?: string;
      severity?: string;
      role_id?: string | null;
      location?: string | null;
      status?: IncidentRecord["status"];
    }) =>
      api
        .patch(`/incidents/${id}`, payload)
        .then((r) => r.data as IncidentRecord),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
      queryClient.invalidateQueries({ queryKey: ["incident", id] });
      setError("");
      setIsEditingIncident(false);
    },
    onError: (mutationError) => {
      setError(getErrorMessage(mutationError, "No se pudo actualizar la incidencia."));
    },
  });
  const analyzeMutation = useMutation({
    mutationFn: () => api.post(`/incidents/${id}/analyze-procedures`).then((r) => r.data as IncidentAnalysisPreview),
    onSuccess: (data) => {
      setAnalysisPreview(data);
      setError("");
    },
    onError: (mutationError) => {
      setError(getErrorMessage(mutationError, "No se pudo analizar la incidencia."));
    },
  });
  const saveAnalysisMutation = useMutation({
    mutationFn: (draft: AnalysisDraft) =>
      (
        draft.run_id
          ? api.patch(`/incidents/${id}/analysis-runs/${draft.run_id}`, {
              analysis_summary: draft.analysis_summary || null,
              resolution_summary: draft.resolution_summary || null,
              findings: draft.findings.filter(isFindingDraftFilled).map((finding) => ({
                procedure_version_id: finding.procedure_version_id || null,
                finding_type: finding.finding_type,
                reasoning_summary: finding.reasoning_summary || null,
                recommended_action: finding.recommended_action || null,
                status: "confirmed",
              })),
            })
          : api.post(`/incidents/${id}/analysis-runs`, {
              analysis_summary: draft.analysis_summary || null,
              resolution_summary: draft.resolution_summary || null,
              findings: draft.findings.filter(isFindingDraftFilled).map((finding) => ({
                procedure_version_id: finding.procedure_version_id || null,
                finding_type: finding.finding_type,
                reasoning_summary: finding.reasoning_summary || null,
                recommended_action: finding.recommended_action || null,
                status: "confirmed",
              })),
            })
      ).then((r) => r.data as AnalysisRun),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["incident-analysis-runs", id] });
      await refetchAnalysisRuns();
      setAnalysisDraft(emptyAnalysisDraft());
      setError("");
    },
    onError: (mutationError) => {
      setError(getErrorMessage(mutationError, "No se pudo guardar el análisis manual."));
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/incidents/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      navigate("/incidents");
    },
    onError: (mutationError) => {
      setError(getErrorMessage(mutationError, "No se pudo eliminar la incidencia."));
    },
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (isCreating) {
      createMutation.mutate();
      return;
    }

    updateMutation.mutate({
      description: form.description,
      severity: form.severity,
      role_id: form.role_id || null,
      location: form.location.trim() || null,
    });
  }

  function handleStatusChange(nextStatus: IncidentRecord["status"]) {
    if (!incident || incident.status === nextStatus) return;
    setError("");
    updateMutation.mutate({ status: nextStatus });
  }

  function handleDelete() {
    if (isCreating || !incident || deleteMutation.isPending) return;
    const confirmed = window.confirm(
      `¿Seguro que quieres eliminar la incidencia? También se eliminarán sus análisis e historial relacionado.`
    );
    if (!confirmed) return;
    setError("");
    deleteMutation.mutate();
  }

  const procedureOptions = useMemo<ProcedureOption[]>(
    () =>
      [
        ...procedures
          .filter((procedure) => procedure.latest_version?.id)
          .map((procedure) => ({
            value: procedure.latest_version!.id,
            label: procedure.title,
          })),
        ...analysisRuns.flatMap((run) =>
          run.findings
            .filter((finding) => finding.procedure_version_id)
            .map((finding) => ({
              value: finding.procedure_version_id as string,
              label: finding.procedure_title || "Procedimiento",
            })),
        ),
      ].filter((option, index, options) => options.findIndex((candidate) => candidate.value === option.value) === index),
    [analysisRuns, procedures],
  );
  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    analyzeMutation.isPending ||
    saveAnalysisMutation.isPending;
  const isClosed = incident?.status === "closed";
  const manualAnalysisRuns = analysisRuns.filter((run) => run.source === "manual");
  const needsRedefinitionCount = manualAnalysisRuns
    .flatMap((run) => run.findings)
    .filter((finding) => finding.finding_type === "needs_redefinition").length;
  const confirmedCount = manualAnalysisRuns
    .flatMap((run) => run.findings)
    .filter((finding) => finding.status === "confirmed").length;

  if (!isCreating && (isLoading || !incident)) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pt-8">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/incidents"
            className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a incidencias
          </Link>
          {!isCreating && incident && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setIsEditingIncident((current) => !current)}
                className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                <Pencil className="h-4 w-4" />
                Editar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Eliminar
              </button>
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <AlertTriangle className="mt-1 h-6 w-6 text-indigo-500" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {isCreating ? "Nueva incidencia" : "Detalle de incidencia"}
                </h1>
                <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">
                  {isCreating
                    ? "Registrá un incidente nuevo con los datos base necesarios."
                    : incident?.description || "Sin descripción cargada."}
                </p>
                {!isCreating && incident && (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className={`rounded-full px-2.5 py-1 font-medium ${severityMeta[incident.severity]}`}>
                      {severityLabel[incident.severity] ?? incident.severity}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 font-medium ${statusMeta[incident.status]}`}>
                      {statusLabel[incident.status]}
                    </span>
                    {incident.role_name && (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{incident.role_name}</span>
                    )}
                    {incident.location && (
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-600">{incident.location}</span>
                    )}
                  </div>
                )}
                {!isCreating && incident && (
                  <p className="mt-3 text-xs text-gray-400">
                    Creada el {new Date(incident.created_at).toLocaleString("es-AR")}
                    {incident.closed_at ? ` · cerrada el ${new Date(incident.closed_at).toLocaleString("es-AR")}` : ""}
                  </p>
                )}
              </div>
            </div>
            {!isCreating && incident && (
              <div className="flex items-center gap-2 self-start text-sm text-gray-600">
                <span className="group relative inline-flex items-center gap-2 rounded-full bg-gray-50 px-3 py-1.5 font-medium text-gray-600">
                  <FileText className="h-4 w-4 text-gray-400" />
                  {confirmedCount}
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-36 -translate-x-1/2 rounded-lg bg-gray-900 px-2.5 py-1.5 text-center text-xs text-white shadow-lg group-hover:block">
                    Hallazgos manuales
                  </span>
                </span>
                <span className="group relative inline-flex items-center gap-2 rounded-full bg-gray-50 px-3 py-1.5 font-medium text-gray-600">
                  <GitBranch className="h-4 w-4 text-gray-400" />
                  {needsRedefinitionCount}
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-44 -translate-x-1/2 rounded-lg bg-gray-900 px-2.5 py-1.5 text-center text-xs text-white shadow-lg group-hover:block">
                    Procesos que requieren actualización
                  </span>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {(isCreating || isEditingIncident) && (
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
            {isCreating ? (
              <Link
                to="/incidents"
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditingIncident(false)}
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
            )}
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
      )}

      {!isCreating && incident && (
        <>
          <section className="rounded-2xl border border-gray-200 bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Acciones de análisis</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Ejecuta una consulta exploratoria sobre procedimientos actuales y precedentes similares. La vinculación real se guarda sólo en el análisis manual.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => analyzeMutation.mutate()}
                  disabled={isClosed || analyzeMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {analyzeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Analizar incidencia
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusChange(isClosed ? "open" : "closed")}
                  disabled={updateMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  <Shield className="h-4 w-4" />
                  {isClosed ? "Reabrir incidencia" : "Cerrar incidencia"}
                </button>
              </div>
            </div>
            {isClosed && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                La incidencia está cerrada. Puedes seguir consultando el historial, pero no disparar nuevos análisis ni editar hallazgos.
              </div>
            )}
            {(analyzeMutation.isPending || analysisPreview) && (
              <div className="mt-5 border-t border-gray-100 pt-5">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Resultados de análisis</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Procedimientos actuales y análisis previos similares detectados a partir de la descripción guardada.
                  </p>
                </div>
                <div className="mt-5 space-y-3">
                  {analyzeMutation.isPending ? (
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Buscando coincidencias semánticas...
                    </div>
                  ) : analysisPreview ? (
                    <>
                      {analysisPreview.procedure_matches.length ? (
                        analysisPreview.procedure_matches.map((match) => (
                          <div
                            key={match.procedure_version_id ?? `${match.procedure_id}-${match.score}`}
                            className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-gray-900">
                                  {match.procedure_code} · {match.procedure_title}
                                  {match.version_number != null ? ` · v${match.version_number}` : ""}
                                </p>
                                <p className="mt-1 text-xs text-gray-500">Relación: {(match.score * 100).toFixed(0)}%</p>
                                {match.step_title && (
                                  <p className="mt-2 text-xs font-medium text-gray-500">
                                    Paso {match.step_index}: {match.step_title}
                                  </p>
                                )}
                                <p className="mt-2 text-sm text-gray-600">{match.snippet}</p>
                                {match.reference_segment_range && (
                                  <p className="mt-2 text-xs text-gray-500">Referencia fuente: {match.reference_segment_range}</p>
                                )}
                                {match.training_title && (
                                  <p className="mt-2 text-xs text-gray-500">Training derivado disponible: {match.training_title}</p>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {match.procedure_id && (
                                  <Link
                                    to={`/procedures/${match.procedure_id}`}
                                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-white"
                                  >
                                    Ver procedimiento
                                  </Link>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-xl border border-dashed border-gray-200 px-4 py-5 text-sm text-gray-500">
                          No se encontraron procedimientos actuales suficientemente relacionados.
                        </div>
                      )}

                      <div className="pt-2">
                        <h4 className="text-sm font-semibold text-gray-900">Análisis previos similares</h4>
                        <div className="mt-3 space-y-3">
                          {analysisPreview.similar_analyses.length ? (
                            analysisPreview.similar_analyses.map((related) => (
                              <div key={`${related.incident_id}-${related.analysis_run.id}`} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-gray-900">{related.description}</p>
                                    <p className="mt-1 text-xs text-gray-500">
                                      Similitud: {(related.similarity_score * 100).toFixed(0)}%
                                    </p>
                                    {related.analysis_run.analysis_summary && (
                                      <p className="mt-2 text-sm text-gray-600">{related.analysis_run.analysis_summary}</p>
                                    )}
                                    {related.analysis_run.resolution_summary && (
                                      <p className="mt-1 text-xs text-gray-500">
                                        Resolución previa: {related.analysis_run.resolution_summary}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="rounded-xl border border-dashed border-gray-200 px-4 py-5 text-sm text-gray-500">
                              No se encontraron análisis previos semánticamente similares.
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Historial de análisis</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Sólo análisis manuales persistidos. Aquí es donde se crean las vinculaciones incidencia-procedimiento.
                </p>
              </div>
            </div>
            <div className="mt-5 space-y-4">
              {analysisLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cargando análisis previos...
                </div>
              ) : manualAnalysisRuns.length ? (
                manualAnalysisRuns.map((run) => (
                  <div
                    key={run.id}
                    className={`rounded-xl border px-4 py-4 ${
                      run.source === "manual" ? "border-emerald-100 bg-emerald-50" : "border-amber-100 bg-amber-50"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p
                          className={`text-xs font-semibold uppercase tracking-wide ${
                            run.source === "manual" ? "text-emerald-700" : "text-amber-700"
                          }`}
                        >
                          {run.source === "manual" ? "Análisis manual" : "Análisis IA"}
                        </p>
                        {run.analysis_summary && <p className="mt-1 text-sm text-gray-900">{run.analysis_summary}</p>}
                        {run.resolution_summary && (
                          <p className="mt-1 text-xs text-gray-600">Resolución: {run.resolution_summary}</p>
                        )}
                        <p className="mt-2 flex items-center gap-1 text-xs text-gray-400">
                          <Clock className="h-3 w-3" />
                          {new Date(run.created_at).toLocaleString("es-AR")}
                        </p>
                      </div>
                      {!isClosed && (
                        <button
                          type="button"
                          onClick={() => setAnalysisDraft(buildDraftFromRun(run))}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-white/70"
                        >
                          <Pencil className="h-3 w-3" />
                          Editar
                        </button>
                      )}
                    </div>

                    <div className="mt-4 space-y-2">
                      {run.findings.length ? (
                        run.findings.map((finding) => (
                          <div key={finding.id} className="rounded-lg border border-white/70 bg-white/80 px-3 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                                  findingTypeClasses[finding.finding_type]
                                }`}
                              >
                                {findingTypeLabels[finding.finding_type]}
                              </span>
                              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                                {finding.status}
                              </span>
                              {finding.procedure_title ? (
                                <Link
                                  to={`/procedures/${finding.procedure_id}`}
                                  className="text-sm font-medium text-indigo-700 hover:underline"
                                >
                                  {finding.procedure_title}
                                  {finding.version_number != null ? ` · v${finding.version_number}` : ""}
                                </Link>
                              ) : (
                                <span className="text-sm font-medium text-gray-700">Sin procedimiento versionado asociado</span>
                              )}
                              {finding.confidence != null && (
                                <span className="text-xs text-gray-400">{Math.round(finding.confidence * 100)}%</span>
                              )}
                            </div>
                            {finding.reasoning_summary && <p className="mt-2 text-xs text-gray-600">{finding.reasoning_summary}</p>}
                            {finding.recommended_action && (
                              <p className="mt-1 text-xs font-medium text-gray-700">
                                Acción recomendada: {finding.recommended_action}
                              </p>
                            )}
                            {finding.training_title && (
                              <p className="mt-1 text-xs text-indigo-600">Training derivado: {finding.training_title}</p>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-gray-500">Este análisis no tiene hallazgos cargados.</p>
                      )}
                    </div>

                    {!!run.related_matches.length && (
                      <div className="mt-4 space-y-2">
                        <p className="text-xs font-medium text-gray-500">Precedentes reutilizados</p>
                        {run.related_matches.map((match) => (
                          <div key={match.id} className="rounded-lg border border-white/70 bg-white/80 px-3 py-3">
                            <p className="text-xs text-gray-700">
                              {match.related_incident_description} · similitud {((match.similarity_score || 0) * 100).toFixed(0)}%
                            </p>
                            {match.related_analysis_summary && (
                              <p className="mt-1 text-xs text-gray-600">Análisis previo: {match.related_analysis_summary}</p>
                            )}
                            {match.related_resolution_summary && (
                              <p className="mt-1 text-xs text-gray-600">
                                Resolución previa: {match.related_resolution_summary}
                              </p>
                            )}
                            {match.rationale && <p className="mt-1 text-xs text-gray-500">{match.rationale}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">Todavía no hay análisis guardados para esta incidencia.</p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {analysisDraft.run_id ? "Editar análisis manual" : "Guardar análisis manual"}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Define manualmente los hallazgos y selecciona el procedimiento sólo cuando quieras crear una vinculación persistida.
                </p>
              </div>
              {analysisDraft.run_id && (
                <button
                  type="button"
                  onClick={() => setAnalysisDraft(emptyAnalysisDraft())}
                  className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                >
                  <X className="h-3 w-3" />
                  Cancelar edición
                </button>
              )}
            </div>

            <div className="mt-5 space-y-3">
              <textarea
                rows={3}
                value={analysisDraft.analysis_summary}
                onChange={(event) =>
                  setAnalysisDraft((current) => ({ ...current, analysis_summary: event.target.value }))
                }
                disabled={isClosed}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
                placeholder="Conclusión o análisis del incidente..."
              />
              <textarea
                rows={2}
                value={analysisDraft.resolution_summary}
                onChange={(event) =>
                  setAnalysisDraft((current) => ({ ...current, resolution_summary: event.target.value }))
                }
                disabled={isClosed}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
                placeholder="Resolución o acción correctiva..."
              />
              <div className="space-y-3">
                {analysisDraft.findings.map((finding, index) => (
                  <div key={`incident-finding-${index}`} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <div className="grid gap-2 md:grid-cols-2">
                      <ProcedureVersionCombobox
                        value={finding.procedure_version_id}
                        options={procedureOptions}
                        disabled={isClosed}
                        onChange={(nextValue) =>
                          setAnalysisDraft((current) => ({
                            ...current,
                            findings: current.findings.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, procedure_version_id: nextValue } : item,
                            ),
                          }))
                        }
                      />
                      <select
                        value={finding.finding_type}
                        onChange={(event) =>
                          setAnalysisDraft((current) => ({
                            ...current,
                            findings: current.findings.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, finding_type: event.target.value as FindingType }
                                : item,
                            ),
                          }))
                        }
                        disabled={isClosed}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
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
                        setAnalysisDraft((current) => ({
                          ...current,
                          findings: current.findings.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, reasoning_summary: event.target.value } : item,
                          ),
                        }))
                      }
                      disabled={isClosed}
                      className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
                      placeholder="Explicación del hallazgo..."
                    />
                    <textarea
                      rows={2}
                      value={finding.recommended_action}
                      onChange={(event) =>
                        setAnalysisDraft((current) => ({
                          ...current,
                          findings: current.findings.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, recommended_action: event.target.value } : item,
                          ),
                        }))
                      }
                      disabled={isClosed}
                      className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
                      placeholder="Acción recomendada..."
                    />
                    {analysisDraft.findings.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setAnalysisDraft((current) => ({
                            ...current,
                            findings: current.findings.filter((_, itemIndex) => itemIndex !== index),
                          }))
                        }
                        disabled={isClosed}
                        className="mt-2 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                      >
                        Eliminar hallazgo
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setAnalysisDraft((current) => ({
                      ...current,
                      findings: [...current.findings, emptyFindingDraft()],
                    }))
                  }
                  disabled={isClosed}
                  className="rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  Agregar hallazgo
                </button>
              </div>
              <button
                type="button"
                onClick={() => saveAnalysisMutation.mutate(analysisDraft)}
                disabled={
                  isClosed ||
                  saveAnalysisMutation.isPending ||
                  (!analysisDraft.analysis_summary.trim() &&
                    !analysisDraft.resolution_summary.trim() &&
                    !analysisDraft.findings.some(isFindingDraftFilled))
                }
                className="rounded-lg border border-indigo-200 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
              >
                {saveAnalysisMutation.isPending ? "Guardando..." : analysisDraft.run_id ? "Actualizar análisis" : "Guardar análisis"}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
