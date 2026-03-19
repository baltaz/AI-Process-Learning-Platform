import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileStack, Loader2, Plus, Sparkles, Trash2, Upload, X } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import api from "@/services/api";

type StepOrigin = "auto" | "manual";
type SaveMode = "create_new_version" | "update_latest";

interface ProcedureEvidence {
  segment_range?: string;
  quote?: string;
  origin?: StepOrigin;
  edited?: boolean;
}

interface ProcedureStep {
  title?: string;
  description?: string;
  evidence?: ProcedureEvidence;
  origin?: StepOrigin;
  edited?: boolean;
}

interface ProcedureStructure {
  title?: string;
  objectives?: string[];
  steps?: ProcedureStep[];
  critical_points?: Array<{
    text?: string;
    why?: string;
    evidence?: ProcedureEvidence;
  }>;
}

interface ProcedureVersion {
  id: string;
  version_number: number;
  status?: string;
  change_summary?: string | null;
  change_reason?: string | null;
  effective_from?: string | null;
  content_text?: string | null;
  content_json?: ProcedureStructure | null;
  source_result?: {
    structure: ProcedureStructure;
    transcript_raw: string;
  } | null;
}

interface ProcedureDetail {
  id: string;
  code: string;
  title: string;
  description?: string | null;
  versions: ProcedureVersion[];
}

interface ProcedureVersionResponse {
  id: string;
}

interface ProcedureSourceAsset {
  storage_key: string;
  mime: string;
  size: number;
  asset_type: string;
}

interface EditableStep {
  id: string;
  title: string;
  description: string;
  evidenceSegmentRange: string;
  evidenceQuote: string;
  origin: StepOrigin;
  edited: boolean;
}

interface SourcePreviewResponse {
  preview_id: string;
  source_result: {
    structure: ProcedureStructure;
    transcript_raw: string;
  };
  suggested_content_json: ProcedureStructure;
  suggested_content_text: string;
}

const MAX_SOURCE_FILE_SIZE_BYTES = 50 * 1024 * 1024;

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

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeStructure(structure: ProcedureStructure | null | undefined, fallbackTitle: string): ProcedureStructure {
  return {
    title: structure?.title?.trim() || fallbackTitle,
    objectives: Array.isArray(structure?.objectives)
      ? structure.objectives.map((objective) => objective.trim()).filter(Boolean)
      : [],
    steps: Array.isArray(structure?.steps) ? structure.steps : [],
    critical_points: Array.isArray(structure?.critical_points) ? structure.critical_points : [],
  };
}

function toEditableSteps(structure: ProcedureStructure | null | undefined): EditableStep[] {
  return (structure?.steps ?? []).map((step, index) => ({
    id: createId(`step-${index + 1}`),
    title: step.title?.trim() || `Paso ${index + 1}`,
    description: step.description?.trim() || "",
    evidenceSegmentRange: step.evidence?.segment_range?.trim() || "",
    evidenceQuote: step.evidence?.quote?.trim() || "",
    origin: step.origin === "manual" ? "manual" : "auto",
    edited: Boolean(step.edited),
  }));
}

function buildStructureForSave(
  title: string,
  objectives: string[],
  steps: EditableStep[],
  criticalPoints: NonNullable<ProcedureStructure["critical_points"]>,
): ProcedureStructure {
  return {
    title,
    objectives,
    steps: steps.map((step) => ({
      title: step.title.trim(),
      description: step.description.trim(),
      origin: step.origin,
      edited: step.edited,
      evidence:
        step.evidenceSegmentRange.trim() || step.evidenceQuote.trim()
          ? {
              segment_range: step.evidenceSegmentRange.trim() || undefined,
              quote: step.evidenceQuote.trim() || undefined,
              origin: step.origin,
              edited: step.edited,
            }
          : undefined,
    })),
    critical_points: criticalPoints ?? [],
  };
}

function buildContentText(structure: ProcedureStructure): string {
  const lines = [structure.title?.trim() || "Procedimiento"];
  if (structure.objectives?.length) {
    lines.push("");
    lines.push("Objetivos:");
    lines.push(...structure.objectives.map((objective) => `- ${objective}`));
  }
  if (structure.steps?.length) {
    lines.push("");
    lines.push("Pasos:");
    lines.push(
      ...structure.steps.map((step, index) => {
        const title = step.title?.trim() || `Paso ${index + 1}`;
        const description = step.description?.trim();
        return description ? `${index + 1}. ${title}: ${description}` : `${index + 1}. ${title}`;
      }),
    );
  }
  if (structure.critical_points?.length) {
    lines.push("");
    lines.push("Puntos criticos:");
    lines.push(
      ...structure.critical_points.map((point) => {
        const text = point.text?.trim() || "";
        const why = point.why?.trim() || "";
        return text && why ? `- ${text}: ${why}` : `- ${text}`;
      }),
    );
  }
  return lines.join("\n").trim();
}

function getOriginBadge(origin: StepOrigin, edited: boolean) {
  if (origin === "manual") {
    return {
      label: edited ? "Manual editado" : "Manual",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }
  return {
    label: edited ? "Automatico editado" : "Automatico",
    className: "border-indigo-200 bg-indigo-50 text-indigo-700",
  };
}

async function uploadSourceFile(file: File, presignedUrl: string, contentType: string) {
  const response = await fetch(presignedUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": contentType },
  });

  if (!response.ok) {
    const responseText = await response.text();
    const detail = responseText.trim();
    throw new Error(
      detail
        ? `Fallo la carga del archivo fuente (${response.status}): ${detail}`
        : `Fallo la carga del archivo fuente (${response.status}).`,
    );
  }
}

export default function ProcedureUpdatePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [metadata, setMetadata] = useState({
    change_summary: "",
    change_reason: "",
    effective_from: "",
  });
  const [draftTitle, setDraftTitle] = useState("");
  const [draftObjectives, setDraftObjectives] = useState<string[]>([]);
  const [draftCriticalPoints, setDraftCriticalPoints] = useState<NonNullable<ProcedureStructure["critical_points"]>>([]);
  const [draftSteps, setDraftSteps] = useState<EditableStep[]>([]);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [processedSource, setProcessedSource] = useState<{
    sourceAsset: ProcedureSourceAsset;
    previewId: string;
    transcriptRaw: string;
  } | null>(null);
  const [processFeedback, setProcessFeedback] = useState<string | null>(null);
  const [showDecisionModal, setShowDecisionModal] = useState(false);

  const { data: procedure, isLoading } = useQuery<ProcedureDetail>({
    queryKey: ["procedure", id],
    queryFn: () => api.get(`/procedures/${id}`).then((r) => r.data),
    enabled: Boolean(id),
  });

  const latestUpdate = useMemo(() => {
    const versions = procedure?.versions ?? [];
    return [...versions].sort((a, b) => b.version_number - a.version_number)[0] ?? null;
  }, [procedure]);

  useEffect(() => {
    if (!procedure) return;
    const baseStructure = normalizeStructure(
      latestUpdate?.content_json ?? latestUpdate?.source_result?.structure,
      procedure.title,
    );
    setMetadata({
      change_summary: latestUpdate?.change_summary || "",
      change_reason: latestUpdate?.change_reason || "",
      effective_from: latestUpdate?.effective_from ? latestUpdate.effective_from.slice(0, 10) : "",
    });
    setDraftTitle(baseStructure.title || procedure.title);
    setDraftObjectives(baseStructure.objectives || []);
    setDraftCriticalPoints(baseStructure.critical_points || []);
    setDraftSteps(toEditableSteps(baseStructure));
    setSourceFile(null);
    setProcessedSource(null);
    setFileError(null);
    setProcessFeedback(null);
  }, [latestUpdate, procedure]);

  function handleSelectedFile(file: File | null) {
    if (!file) {
      setSourceFile(null);
      setFileError(null);
      setProcessedSource(null);
      setProcessFeedback(null);
      return;
    }

    if (file.size > MAX_SOURCE_FILE_SIZE_BYTES) {
      setSourceFile(null);
      setFileError("El archivo supera el límite de 50 MB.");
      return;
    }

    setSourceFile(file);
    setFileError(null);
    setProcessedSource(null);
    setProcessFeedback("La estructura actual queda invalidada hasta reprocesar la nueva fuente.");
  }

  function updateStep(stepId: string, patch: Partial<EditableStep>) {
    setDraftSteps((current) =>
      current.map((step) => (step.id === stepId ? { ...step, ...patch, edited: true } : step)),
    );
  }

  function removeStep(stepId: string) {
    setDraftSteps((current) => current.filter((step) => step.id !== stepId));
  }

  function addManualStep() {
    setDraftSteps((current) => [
      ...current,
      {
        id: createId("step"),
        title: "",
        description: "",
        evidenceSegmentRange: "",
        evidenceQuote: "",
        origin: "manual",
        edited: false,
      },
    ]);
  }

  const processSourceMutation = useMutation({
    mutationFn: async () => {
      if (!sourceFile) {
        throw new Error("Debes seleccionar una fuente antes de procesarla.");
      }

      const contentType = sourceFile.type || "application/octet-stream";
      const { data: presign } = await api.post("/uploads/presign", {
        filename: sourceFile.name,
        content_type: contentType,
      });

      await uploadSourceFile(sourceFile, presign.presigned_url, contentType);

      const sourceAsset = {
        storage_key: presign.storage_key,
        mime: contentType,
        size: sourceFile.size,
        asset_type: "video",
      };

      const { data: preview } = await api.post("/procedures/source-preview", {
        source_asset: sourceAsset,
      });

      return {
        sourceAsset,
        preview: preview as SourcePreviewResponse,
      };
    },
    onSuccess: ({ sourceAsset, preview }) => {
      const normalized = normalizeStructure(preview.suggested_content_json, procedure?.title || "Procedimiento");
      setDraftTitle(normalized.title || procedure?.title || "Procedimiento");
      setDraftObjectives(normalized.objectives || []);
      setDraftCriticalPoints(normalized.critical_points || []);
      setDraftSteps(toEditableSteps(normalized));
      setProcessedSource({
        sourceAsset,
        previewId: preview.preview_id,
        transcriptRaw: preview.source_result.transcript_raw,
      });
      setProcessFeedback("Fuente procesada. Revisa y ajusta los pasos antes de actualizar.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (mode: SaveMode) => {
      const stepsToSave = draftSteps
        .map((step) => ({
          ...step,
          title: step.title.trim(),
          description: step.description.trim(),
          evidenceSegmentRange: step.evidenceSegmentRange.trim(),
          evidenceQuote: step.evidenceQuote.trim(),
        }))
        .filter((step) => step.title || step.description);

      if (!stepsToSave.length) {
        throw new Error("Debes dejar al menos un paso antes de actualizar el procedimiento.");
      }
      if (sourceFile && !processedSource) {
        throw new Error("Procesa la nueva fuente antes de actualizar el procedimiento.");
      }
      if (!latestUpdate) {
        throw new Error("No se encontró una actualización base para guardar los cambios.");
      }

      const contentJson = buildStructureForSave(
        draftTitle.trim() || procedure?.title || "Procedimiento",
        draftObjectives,
        stepsToSave,
        draftCriticalPoints,
      );
      const payload = {
        change_summary: metadata.change_summary.trim() || null,
        change_reason: metadata.change_reason.trim() || null,
        effective_from: metadata.effective_from || null,
        content_json: contentJson,
        content_text: buildContentText(contentJson),
        status: latestUpdate.status || "draft",
        source_asset: processedSource?.sourceAsset,
        source_preview_id: processedSource?.previewId,
      };

      if (mode === "create_new_version") {
        return api
          .post(`/procedures/${id}/versions`, {
            ...payload,
            recalculate_compliance: true,
          })
          .then((r) => r.data as ProcedureVersionResponse);
      }

      return api.patch(`/procedures/versions/${latestUpdate.id}`, payload).then((r) => r.data as ProcedureVersionResponse);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procedure", id] });
      queryClient.invalidateQueries({ queryKey: ["procedures"] });
      queryClient.invalidateQueries({ queryKey: ["compliance"] });
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      queryClient.invalidateQueries({ queryKey: ["trainings"] });
      navigate(`/procedures/${id}`);
    },
  });

  const currentStructureStats = useMemo(() => {
    const manualSteps = draftSteps.filter((step) => step.origin === "manual").length;
    const editedSteps = draftSteps.filter((step) => step.edited).length;
    return {
      total: draftSteps.length,
      manualSteps,
      autoSteps: draftSteps.length - manualSteps,
      editedSteps,
    };
  }, [draftSteps]);
  const isProcessingSource = processSourceMutation.isPending;

  const canOpenDecisionModal =
    metadata.change_summary.trim().length > 0 &&
    draftSteps.some((step) => step.title.trim() || step.description.trim()) &&
    (!sourceFile || Boolean(processedSource));

  if (isLoading || !procedure) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pt-8">
      <div className="space-y-3">
        <Link
          to={`/procedures/${procedure.id}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al detalle
        </Link>

        <div className="rounded-3xl border border-gray-200 bg-white p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">{procedure.code}</p>
              <h1 className="mt-1 text-2xl font-bold text-gray-900">Actualizar procedimiento</h1>
              <p className="mt-2 text-sm text-gray-600">
                Trabaja sobre la estructura de <span className="font-medium">{procedure.title}</span> y decide al final
                si quieres versionar o sobrescribir la última actualización.
              </p>
            </div>
            {latestUpdate && (
              <div className="rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
                Base actual: Act. {latestUpdate.version_number}
              </div>
            )}
          </div>
        </div>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!canOpenDecisionModal) return;
          setShowDecisionModal(true);
        }}
        className="space-y-6"
      >
        <section className="rounded-3xl border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">Detalle de la actualización</h2>
          <div className="mt-4 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">Resumen de la actualización</span>
                <input
                  required
                  value={metadata.change_summary}
                  onChange={(event) => setMetadata((current) => ({ ...current, change_summary: event.target.value }))}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                  placeholder="Qué cambió en esta actualización"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">Motivo de la actualización</span>
                <textarea
                  rows={3}
                  value={metadata.change_reason}
                  onChange={(event) => setMetadata((current) => ({ ...current, change_reason: event.target.value }))}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                  placeholder="Qué motivó este cambio"
                />
              </label>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">Vigencia</span>
                <input
                  type="date"
                  value={metadata.effective_from}
                  onChange={(event) => setMetadata((current) => ({ ...current, effective_from: event.target.value }))}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                />
              </label>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-gray-200 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Estructura editable del procedimiento</h2>
              <p className="mt-1 text-sm text-gray-500">
                Revisa los pasos sugeridos, ajusta su contenido y agrega pasos manuales si hace falta.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-medium">
              <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-700">{currentStructureStats.total} pasos</span>
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-700">
                {currentStructureStats.autoSteps} automaticos
              </span>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
                {currentStructureStats.manualSteps} manuales
              </span>
              <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">
                {currentStructureStats.editedSteps} editados
              </span>
            </div>
          </div>

          <label className="mt-5 block">
            <span className="mb-1.5 block text-sm font-medium text-gray-700">Título del procedimiento</span>
            <input
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
              placeholder="Título visible del procedimiento"
            />
          </label>

          {draftObjectives.length > 0 && (
            <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
              <p className="text-sm font-medium text-gray-800">Objetivos detectados</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {draftObjectives.map((objective, index) => (
                  <span key={`${objective}-${index}`} className="rounded-full bg-white px-3 py-1 text-xs text-gray-600">
                    {objective}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 space-y-3">
            {draftSteps.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-300 px-5 py-8 text-sm text-gray-500">
                Procesa una fuente o agrega manualmente el primer paso para empezar a estructurar el procedimiento.
              </div>
            ) : (
              draftSteps.map((step, index) => {
                const badge = getOriginBadge(step.origin, step.edited);
                return (
                  <div key={step.id} className="rounded-2xl border border-gray-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600">
                          Paso {index + 1}
                        </span>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${badge.className}`}>
                          {badge.label}
                        </span>
                        {step.evidenceSegmentRange && (
                          <span className="rounded-full bg-gray-50 px-2.5 py-1 text-[11px] text-gray-500">
                            Fuente: {step.evidenceSegmentRange}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeStep(step.id)}
                        className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Quitar
                      </button>
                    </div>

                    <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.6fr)]">
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500">
                          Título del paso
                        </span>
                        <input
                          value={step.title}
                          onChange={(event) => updateStep(step.id, { title: event.target.value })}
                          className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm"
                          placeholder={`Paso ${index + 1}`}
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500">
                          Descripción
                        </span>
                        <textarea
                          rows={2}
                          value={step.description}
                          onChange={(event) => updateStep(step.id, { description: event.target.value })}
                          className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm"
                          placeholder="Describe qué debe hacer el operador en este paso."
                        />
                      </label>
                    </div>

                    <div className="mt-3 flex flex-wrap items-end gap-3">
                      <label className="block min-w-[180px] flex-1 md:max-w-[220px]">
                        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500">
                          Referencia a la fuente
                        </span>
                        <input
                          value={step.evidenceSegmentRange}
                          onChange={(event) => updateStep(step.id, { evidenceSegmentRange: event.target.value })}
                          className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm"
                          placeholder="Ej: 10s-20s"
                        />
                      </label>
                      {step.evidenceQuote && (
                        <div className="min-w-[220px] flex-[1.2] rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-500">
                          <span className="font-medium text-gray-700">Cita preservada:</span> {step.evidenceQuote}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
            <div className="text-sm text-gray-600">
              Los pasos agregados desde aquí se guardan como manuales y la referencia a la fuente es opcional.
            </div>
            <button
              type="button"
              onClick={addManualStep}
              className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
            >
              <Plus className="h-4 w-4" />
              Agregar paso manual
            </button>
          </div>

          {draftCriticalPoints.length > 0 && (
            <div className="mt-5 rounded-2xl border border-gray-200 px-4 py-4">
              <p className="text-sm font-medium text-gray-800">Puntos críticos detectados</p>
              <div className="mt-3 space-y-3">
                {draftCriticalPoints.map((point, index) => (
                  <div key={`${point?.text || "critical"}-${index}`} className="rounded-xl bg-gray-50 px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{point?.text || "Punto crítico"}</p>
                    {point?.why && <p className="mt-1 text-sm text-gray-600">{point.why}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-gray-200 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Cargar y procesar fuente de la actualización</h2>
              <p className="mt-1 text-sm text-gray-500">
                Si subes una fuente nueva, primero debes procesarla para obtener la estructura base editable.
              </p>
            </div>
            {processedSource && (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                Fuente procesada
              </span>
            )}
          </div>

          <div
            onDragOver={(event) => {
              if (isProcessingSource) return;
              event.preventDefault();
              setIsDragActive(true);
            }}
            onDragLeave={() => setIsDragActive(false)}
            onDrop={(event) => {
              if (isProcessingSource) return;
              event.preventDefault();
              setIsDragActive(false);
              handleSelectedFile(event.dataTransfer.files?.[0] ?? null);
            }}
            className={`mt-5 rounded-[24px] border-2 border-dashed px-6 py-10 text-center transition ${
              isProcessingSource
                ? "cursor-wait border-indigo-300 bg-indigo-50/70 opacity-80"
                : isDragActive
                  ? "border-indigo-400 bg-indigo-50"
                  : "border-gray-200 bg-gray-50/70"
            }`}
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm">
              {isProcessingSource ? (
                <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
              ) : (
                <Upload className="h-6 w-6 text-indigo-600" />
              )}
            </div>
            <p className="mt-4 text-lg font-semibold text-gray-900">
              {isProcessingSource ? "Procesando fuente..." : "Elija un archivo o arrástrelo aquí"}
            </p>
            <p className="mt-2 text-sm text-gray-500">
              {isProcessingSource
                ? "Estamos extrayendo transcript, pasos y referencias. Esto puede tardar unos segundos."
                : "Fuente soportada en esta iteración: video de hasta 50 MB."}
            </p>
            <label
              className={`mt-5 inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium ${
                isProcessingSource
                  ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
                  : "cursor-pointer border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50"
              }`}
            >
              <Upload className="h-4 w-4" />
              {isProcessingSource ? "Procesando..." : "Subir archivo"}
              <input
                type="file"
                accept="video/*"
                className="hidden"
                disabled={isProcessingSource}
                onChange={(event) => handleSelectedFile(event.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          {sourceFile && (
            <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              {sourceFile.name} · {(sourceFile.size / 1024 / 1024).toFixed(1)} MB
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => processSourceMutation.mutate()}
              disabled={!sourceFile || isProcessingSource}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {isProcessingSource ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {isProcessingSource ? "Procesando fuente..." : "Procesar fuente"}
            </button>

            {processedSource && (
              <button
                type="button"
                onClick={() => {
                  setSourceFile(null);
                  setProcessedSource(null);
                  setProcessFeedback(null);
                }}
                disabled={isProcessingSource}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <X className="h-4 w-4" />
                Quitar fuente nueva
              </button>
            )}
          </div>

          {isProcessingSource && (
            <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-4 text-sm text-indigo-700">
              <p className="font-medium">Procesando fuente de información</p>
              <p className="mt-1">
                La extracción puede tardar según la duración del video y el tiempo de respuesta del proveedor de IA.
                Mantén esta pantalla abierta hasta que termine.
              </p>
            </div>
          )}

          {fileError && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {fileError}
            </div>
          )}
          {processFeedback && (
            <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-700">
              {processFeedback}
            </div>
          )}
          {processedSource && (
            <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
              <p className="text-sm font-medium text-gray-900">Resultado del procesamiento</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-white px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-gray-400">Transcript</p>
                  <p className="mt-1 text-sm font-medium text-gray-800">
                    {processedSource.transcriptRaw.split(/\s+/).filter(Boolean).length} palabras
                  </p>
                </div>
                <div className="rounded-xl bg-white px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-gray-400">Pasos</p>
                  <p className="mt-1 text-sm font-medium text-gray-800">{draftSteps.length} detectados</p>
                </div>
                <div className="rounded-xl bg-white px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-gray-400">Fuente</p>
                  <p className="mt-1 text-sm font-medium text-gray-800">
                    {processedSource.sourceAsset.storage_key.split("/").pop()}
                  </p>
                </div>
              </div>
            </div>
          )}
          {processSourceMutation.isError && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {getErrorMessage(processSourceMutation.error, "No se pudo procesar la fuente.")}
            </div>
          )}
          {updateMutation.isError && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {getErrorMessage(updateMutation.error, "No se pudo actualizar el procedimiento.")}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-gray-200 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Cierre de la actualización</h2>
              <p className="mt-1 text-sm text-gray-500">
                Cuando estés conforme con la estructura, elige si quieres versionar el procedimiento o sobreescribir la última versión.
              </p>
            </div>
            <div className="rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
              {sourceFile && !processedSource
                ? "Falta procesar la nueva fuente antes de guardar."
                : "Listo para revisar la decisión final."}
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 px-4 py-4">
              <p className="text-xs uppercase tracking-wide text-gray-400">Base actual</p>
              <p className="mt-1 text-sm font-medium text-gray-900">Act. {latestUpdate?.version_number ?? "Sin base"}</p>
            </div>
            <div className="rounded-2xl border border-gray-200 px-4 py-4">
              <p className="text-xs uppercase tracking-wide text-gray-400">Fuente nueva</p>
              <p className="mt-1 text-sm font-medium text-gray-900">
                {processedSource ? "Procesada" : sourceFile ? "Pendiente de procesar" : "Sin cambios"}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 px-4 py-4">
              <p className="text-xs uppercase tracking-wide text-gray-400">Estructura final</p>
              <p className="mt-1 text-sm font-medium text-gray-900">{currentStructureStats.total} pasos listos</p>
            </div>
          </div>
        </section>

        <div className="flex items-center justify-end gap-3">
          <Link
            to={`/procedures/${procedure.id}`}
            className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={!canOpenDecisionModal || updateMutation.isPending || processSourceMutation.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Actualizar procedimiento
          </button>
        </div>
      </form>

      {showDecisionModal && latestUpdate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Cómo quieres guardar esta actualización</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Elige si quieres versionar el procedimiento y recalcular el alcance sobre operadores, o actualizar la versión vigente sin cambiar el historial.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDecisionModal(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <button
                type="button"
                disabled={updateMutation.isPending}
                onClick={() => updateMutation.mutate("create_new_version")}
                className="rounded-2xl border border-indigo-200 p-5 text-left hover:bg-indigo-50 disabled:opacity-60"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-indigo-100 p-2 text-indigo-700">
                    <FileStack className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Crear nueva versión y notificar</p>
                    <p className="mt-1 text-sm text-gray-500">
                      Se crea una nueva actualización y se recalculan compliance y assignments de los operadores vinculados.
                    </p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                disabled={updateMutation.isPending}
                onClick={() => updateMutation.mutate("update_latest")}
                className="rounded-2xl border border-gray-200 p-5 text-left hover:bg-gray-50 disabled:opacity-60"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-gray-100 p-2 text-gray-700">
                    <Upload className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Actualizar versión existente sin notificar</p>
                    <p className="mt-1 text-sm text-gray-500">
                      Se sobreescribe la actualización vigente sin crear una versión nueva ni recalcular el alcance sobre operadores.
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
