import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, FileText, Loader2, Sparkles, Trash2 } from "lucide-react";

import api from "@/services/api";

interface ProcedureVersion {
  id: string;
  version_number: number;
  status: string;
  created_at: string;
  change_summary?: string | null;
  change_reason?: string | null;
  effective_from?: string | null;
  content_text?: string | null;
  source_asset_type?: string | null;
  source_storage_key?: string | null;
  source_mime?: string | null;
  source_size?: number | null;
  source_processing_status: string;
  source_processing_error?: string | null;
  source_processed_at?: string | null;
  source_result?: {
    structure: {
      title: string;
      objectives: string[];
      steps: { title: string; description: string; evidence?: { segment_range?: string } }[];
      critical_points: { text: string; why: string; evidence?: { segment_range?: string } }[];
    };
    transcript_raw: string;
  } | null;
  derived_training?: {
    id: string;
    title: string;
    status: string;
  } | null;
}

interface ProcedureDetail {
  id: string;
  code: string;
  title: string;
  description?: string | null;
  owner_role_name?: string | null;
  versions: ProcedureVersion[];
}

interface IncidentRecord {
  id: string;
  description: string;
  severity: string;
  location?: string | null;
  created_at: string;
}

interface IncidentAnalysisFinding {
  id: string;
  procedure_id?: string | null;
  procedure_version_id?: string | null;
  confidence?: number | null;
  reasoning_summary?: string | null;
  recommended_action?: string | null;
  status: string;
  created_at: string;
}

interface IncidentAnalysisRun {
  id: string;
  incident_id: string;
  analysis_summary?: string | null;
  resolution_summary?: string | null;
  created_at: string;
  findings: IncidentAnalysisFinding[];
}

interface ProcedureIncidentContext {
  incident: IncidentRecord;
  run: IncidentAnalysisRun;
  finding: IncidentAnalysisFinding;
  pendingCount: number;
}

interface QuizQuestion {
  id: string;
  question_json: {
    question: string;
    options: string[];
    correct_answer: number;
    verified?: boolean;
    position?: number | null;
  };
}

interface SourceDocumentItem {
  title: string;
  detail: string;
  meta?: string | null;
}

const ACTIVE_SOURCE_PROCESSING_STATUSES = [
  "UPLOADED",
  "TRANSCRIBING",
  "CHUNKING",
  "INDEXING",
  "EXTRACTING",
] as const;

const SOURCE_PROCESSING_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  UPLOADED: "Video subido",
  TRANSCRIBING: "Transcribiendo audio",
  CHUNKING: "Capturando frames",
  INDEXING: "Indexando segmentos",
  EXTRACTING: "Extrayendo conocimiento",
  READY: "Listo",
  FAILED: "Error",
};

const SEVERITY_LABELS: Record<string, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  critical: "Crítica",
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

function getSourceProcessingLabel(status: string) {
  return SOURCE_PROCESSING_STATUS_LABELS[status] ?? status;
}

function getSeverityLabel(severity?: string | null) {
  if (!severity) return null;
  return SEVERITY_LABELS[severity] ?? severity;
}

function formatDate(value?: string | null) {
  if (!value) return "Sin fecha";
  return new Date(value).toLocaleDateString("es-AR");
}

function buildGeneratedText(version: ProcedureVersion | null, context: ProcedureIncidentContext | null): string[] {
  const parts = context
    ? [
        context.run.analysis_summary,
        context.finding.reasoning_summary,
        context.finding.recommended_action,
        context.run.resolution_summary,
      ]
    : [];

  const normalized = parts
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  if (normalized.length > 0) {
    return Array.from(new Set(normalized));
  }

  const structure = version?.source_result?.structure;
  if (structure) {
    const summary: string[] = [];
    if (structure.objectives.length > 0) {
      summary.push(`Objetivos detectados: ${structure.objectives.join(", ")}.`);
    }
    if (structure.steps.length > 0) {
      summary.push(`Pasos sugeridos: ${structure.steps.map((step) => step.title).join(", ")}.`);
    }
    if (structure.critical_points.length > 0) {
      summary.push(
        `Puntos críticos identificados: ${structure.critical_points.map((point) => point.text).join(", ")}.`
      );
    }
    if (summary.length > 0) {
      return summary;
    }
  }

  if (version?.content_text?.trim()) {
    return [version.content_text.trim()];
  }

  return ["Todavía no hay contenido generado disponible para este procedimiento."];
}

function buildSourceDocumentItems(version: ProcedureVersion | null): SourceDocumentItem[] {
  if (!version) return [];

  const items: SourceDocumentItem[] = [];
  if (version.source_storage_key) {
    items.push({
      title: "Fuente principal",
      detail: version.source_storage_key.split("/").pop() || version.source_storage_key,
      meta: [
        version.source_asset_type || "archivo",
        version.source_size ? `${(version.source_size / 1024 / 1024).toFixed(1)} MB` : null,
        getSourceProcessingLabel(version.source_processing_status),
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }

  if (version.source_result?.transcript_raw) {
    items.push({
      title: "Transcripción",
      detail: `${version.source_result.transcript_raw.split(/\s+/).length} palabras extraídas`,
      meta: "Artefacto derivado",
    });
  }

  if (version.source_result?.structure) {
    items.push({
      title: "Estructura extraída",
      detail: version.source_result.structure.title,
      meta: `${version.source_result.structure.steps.length} pasos · ${version.source_result.structure.critical_points.length} puntos críticos`,
    });
  }

  return items;
}

export default function ProcedureDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: procedure, isLoading } = useQuery<ProcedureDetail>({
    queryKey: ["procedure", id],
    queryFn: () => api.get(`/procedures/${id}`).then((r) => r.data),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const data = query.state.data as ProcedureDetail | undefined;
      const hasActiveProcessing = data?.versions?.some((version) =>
        ACTIVE_SOURCE_PROCESSING_STATUSES.includes(
          version.source_processing_status as (typeof ACTIVE_SOURCE_PROCESSING_STATUSES)[number],
        ),
      );
      return hasActiveProcessing ? 3000 : false;
    },
  });

  const latestUpdate = useMemo(() => {
    const versions = procedure?.versions ?? [];
    return [...versions].sort((a, b) => b.version_number - a.version_number)[0] ?? null;
  }, [procedure]);

  const incidentContextQuery = useQuery<ProcedureIncidentContext | null>({
    queryKey: ["procedure-incident-context", id, procedure?.versions.map((version) => version.id).join(",")],
    enabled: Boolean(procedure?.id),
    queryFn: async () => {
      const incidents = await api.get("/incidents").then((r) => r.data as IncidentRecord[]);
      const currentProcedure = procedure;
      if (!currentProcedure) return null;

      const versionIds = new Set(currentProcedure.versions.map((version) => version.id));
      const incidentRuns = await Promise.all(
        incidents.map(async (incident) => ({
          incident,
          runs: await api.get(`/incidents/${incident.id}/analysis-runs`).then((r) => r.data as IncidentAnalysisRun[]),
        })),
      );

      const matches = incidentRuns.flatMap(({ incident, runs }) =>
        runs.flatMap((run) =>
          run.findings
            .filter(
              (finding) =>
                finding.procedure_id === currentProcedure.id ||
                (finding.procedure_version_id ? versionIds.has(finding.procedure_version_id) : false),
            )
            .map((finding) => ({ incident, run, finding })),
        ),
      );

      if (!matches.length) {
        return null;
      }

      const pendingCount = new Set(
        matches.filter((match) => match.finding.status === "suggested").map((match) => match.incident.id),
      ).size;

      const sortedMatches = [...matches].sort((left, right) => {
        const leftPriority = left.finding.status === "suggested" ? 0 : 1;
        const rightPriority = right.finding.status === "suggested" ? 0 : 1;
        if (leftPriority !== rightPriority) {
          return leftPriority - rightPriority;
        }
        return new Date(right.run.created_at).getTime() - new Date(left.run.created_at).getTime();
      });

      return { ...sortedMatches[0], pendingCount };
    },
  });

  const { data: quiz = [], isLoading: quizLoading } = useQuery<QuizQuestion[]>({
    queryKey: ["procedure-quiz", latestUpdate?.derived_training?.id],
    queryFn: () =>
      api
        .get(`/trainings/${latestUpdate?.derived_training?.id}/quiz`)
        .then((r) => r.data as QuizQuestion[]),
    enabled: Boolean(latestUpdate?.derived_training?.id),
  });

  const generateTrainingMutation = useMutation({
    mutationFn: (versionId: string) =>
      api.post(`/procedures/versions/${versionId}/generate-training`).then((r) => r.data),
    onSuccess: (data: { training_id: string; job_id: string }) => {
      queryClient.invalidateQueries({ queryKey: ["procedure", id] });
      queryClient.invalidateQueries({ queryKey: ["trainings"] });
      navigate(`/trainings/${data.training_id}`, {
        state: { jobId: data.job_id, activeJobAction: "generate" },
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/procedures/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procedures"] });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      queryClient.invalidateQueries({ queryKey: ["trainings"] });
      navigate("/procedures");
    },
  });

  if (isLoading || !procedure) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  const updateHistory = [...procedure.versions].sort((a, b) => b.version_number - a.version_number);
  const sourceDocuments = buildSourceDocumentItems(latestUpdate);
  const generatedText = buildGeneratedText(latestUpdate, incidentContextQuery.data ?? null);

  function handleDelete() {
    if (deleteMutation.isPending) return;
    const confirmed = window.confirm(
      `¿Seguro que quieres eliminar el procedimiento "${procedure?.title}"? También se eliminarán sus actualizaciones y trainings derivados.`
    );
    if (!confirmed) return;
    deleteMutation.mutate();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Link
            to="/procedures"
            className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a procedimientos
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to={`/procedures/${procedure.id}/update`}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Actualizar
            </Link>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Eliminar
            </button>
          </div>
        </div>

        <section className="rounded-3xl border border-gray-200 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-bold text-gray-900">{procedure.title}</h1>
                {(incidentContextQuery.data?.pendingCount ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {incidentContextQuery.data?.pendingCount} incidencia
                    {incidentContextQuery.data?.pendingCount === 1 ? " pendiente" : "s pendientes"}
                  </span>
                )}
              </div>
              <p className="max-w-4xl text-base text-gray-600">
                {procedure.description || "Todavía no hay una descripción cargada para este procedimiento."}
              </p>
            </div>
            <div className="rounded-2xl bg-gray-50 px-4 py-3 text-right text-sm text-gray-600">
              <p className="font-medium text-gray-900">{procedure.code}</p>
              <p className="mt-1">
                {latestUpdate ? `Actualización vigente: Act. ${latestUpdate.version_number}` : "Sin actualizaciones"}
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 text-xs text-gray-500">
            <span className="rounded-full bg-gray-100 px-2.5 py-1">
              Owner: {procedure.owner_role_name || "Sin rol"}
            </span>
            <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-indigo-700">
              {procedure.versions.length} actualizaciones
            </span>
            <span className="rounded-full bg-gray-100 px-2.5 py-1">
              {latestUpdate?.effective_from ? `Vigencia ${formatDate(latestUpdate.effective_from)}` : "Sin vigencia definida"}
            </span>
          </div>
        </section>

        {deleteMutation.isError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {getErrorMessage(deleteMutation.error, "No se pudo eliminar el procedimiento.")}
          </div>
        )}
      </div>

      <section className="rounded-3xl border border-gray-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Resultado del proceso en texto generado por la IA</h2>
            <p className="mt-1 text-sm text-gray-500">
              {incidentContextQuery.data
                ? "Resumen compuesto desde la incidencia relacionada y su análisis."
                : "Resumen compuesto con la mejor información disponible de la actualización vigente."}
            </p>
          </div>
          {incidentContextQuery.data && (
            <div className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
              {getSeverityLabel(incidentContextQuery.data.incident.severity) || "Incidencia"}
            </div>
          )}
        </div>

        <div className="mt-6 rounded-2xl border border-gray-200 px-5 py-5">
          {incidentContextQuery.data && (
            <div className="mb-4 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
              {incidentContextQuery.data.incident.description}
            </div>
          )}
          <div className="space-y-4 text-sm leading-7 text-gray-700">
            {generatedText.map((paragraph, index) => (
              <p key={`${procedure.id}-generated-${index}`}>{paragraph}</p>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Documentos fuente de la actualización</h2>
            <p className="mt-1 text-sm text-gray-500">
              Fuente y artefactos disponibles para la actualización vigente.
            </p>
          </div>
          {latestUpdate && (
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
              Act. {latestUpdate.version_number}
            </span>
          )}
        </div>

        <div className="mt-6 rounded-2xl border border-gray-200 px-5 py-4">
          {!sourceDocuments.length ? (
            <p className="text-sm text-gray-500">Todavía no hay documentos fuente asociados a esta actualización.</p>
          ) : (
            <div className="space-y-3">
              {sourceDocuments.map((document, index) => (
                <div key={`${document.title}-${index}`} className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{document.title}</p>
                    <p className="mt-1 text-sm text-gray-600">{document.detail}</p>
                  </div>
                  {document.meta && <p className="text-xs text-gray-400">{document.meta}</p>}
                </div>
              ))}
            </div>
          )}
          {latestUpdate?.source_processing_error && (
            <p className="mt-4 text-sm text-red-600">{latestUpdate.source_processing_error}</p>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Cuestionario</h2>
            <p className="mt-1 text-sm text-gray-500">
              Estado del cuestionario derivado de la actualización vigente.
            </p>
          </div>
          {latestUpdate?.derived_training ? (
            <Link
              to={`/trainings/${latestUpdate.derived_training.id}`}
              className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
            >
              Ver cuestionario
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => latestUpdate && generateTrainingMutation.mutate(latestUpdate.id)}
              disabled={
                !latestUpdate ||
                !latestUpdate.source_storage_key ||
                latestUpdate.source_processing_status !== "READY" ||
                generateTrainingMutation.isPending
              }
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {generateTrainingMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Crear cuestionario
            </button>
          )}
        </div>

        <div className="mt-6 rounded-2xl border border-gray-200 px-5 py-4">
          {latestUpdate?.derived_training ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-[110px_1fr_220px]">
                <div className="text-sm font-medium text-gray-600">Act. {latestUpdate.version_number}</div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{latestUpdate.derived_training.title}</p>
                  <p className="mt-1 text-xs text-gray-500">{latestUpdate.derived_training.status}</p>
                </div>
                <div className="text-sm text-gray-500">
                  {quizLoading ? "Cargando cuestionario..." : `${quiz.length} preguntas disponibles`}
                </div>
              </div>
              {!quizLoading && quiz.length > 0 && (
                <div className="space-y-2 border-t border-gray-100 pt-4">
                  {quiz.slice(0, 3).map((question, index) => (
                    <div key={question.id} className="flex gap-3 text-sm text-gray-700">
                      <span className="font-medium text-gray-500">{question.question_json.position || index + 1}.</span>
                      <span>{question.question_json.question}</span>
                    </div>
                  ))}
                  {quiz.length > 3 && (
                    <p className="text-xs text-gray-400">Hay {quiz.length - 3} preguntas adicionales en el training.</p>
                  )}
                </div>
              )}
              {!quizLoading && quiz.length === 0 && (
                <p className="text-sm text-gray-500">Todavía no hay preguntas cargadas en el cuestionario derivado.</p>
              )}
            </div>
          ) : (
            <div className="space-y-2 text-sm text-gray-500">
              <p>Aún no existe un cuestionario derivado para la actualización vigente.</p>
              {latestUpdate?.source_storage_key && latestUpdate.source_processing_status !== "READY" && (
                <p>El cuestionario se habilita cuando el source processing queda en `READY`.</p>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white p-6">
        <h2 className="text-xl font-semibold text-gray-900">Historial de actualizaciones</h2>
        <div className="mt-6 rounded-2xl border border-gray-200 px-5 py-4">
          <div className="space-y-4">
            {updateHistory.map((update, index) => (
              <div
                key={update.id}
                className={`grid gap-3 md:grid-cols-[110px_1fr_220px] ${
                  index < updateHistory.length - 1 ? "border-b border-gray-100 pb-4" : ""
                }`}
              >
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  Act. {update.version_number}
                  {index === 0 && (
                    <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] text-green-700">Actual</span>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {update.change_summary || "Actualización sin resumen"}
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    {update.change_reason ||
                      update.content_text?.slice(0, 180) ||
                      "Todavía no hay detalle adicional para esta actualización."}
                  </p>
                </div>
                <div className="text-sm text-gray-500">
                  <p>{update.effective_from ? formatDate(update.effective_from) : formatDate(update.created_at)}</p>
                  <p className="mt-1 text-xs">{getSourceProcessingLabel(update.source_processing_status)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">Roles vinculados</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {procedure.owner_role_name ? (
            <span className="rounded-full bg-gray-100 px-3 py-1.5 text-sm text-gray-700">
              {procedure.owner_role_name}
            </span>
          ) : (
            <p className="text-sm text-gray-500">Este procedimiento todavía no tiene un owner visible asignado.</p>
          )}
        </div>
      </section>
    </div>
  );
}
