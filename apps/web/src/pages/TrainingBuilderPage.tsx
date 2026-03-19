import { useState, useEffect } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import api from "@/services/api";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileVideo,
  Sparkles,
  RefreshCw,
  Clock,
  Quote,
  ChevronDown,
  ChevronUp,
  Send,
  ArrowLeft,
  Plus,
  Pencil,
  Save,
  Trash2,
  X,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Training {
  id: string;
  procedure_version_id: string;
  title: string;
  status: string;
  created_at: string;
  summary?: string | null;
  procedure_id?: string | null;
  procedure_code?: string | null;
  procedure_title?: string | null;
  version_number?: number | null;
  source_asset_type?: string | null;
  source_storage_key?: string | null;
  source_mime?: string | null;
  source_size?: number | null;
}

interface TrainingStructure {
  training_id: string;
  structure_json: {
    objectives?: string[];
    steps?: { title: string; description: string; evidence?: Evidence }[];
    critical_points?: { text: string; evidence?: Evidence }[];
  };
}

interface Evidence {
  segment_id?: string;
  chunk_id?: string;
  start_time?: string;
  end_time?: string;
  segment_range?: string;
  quote?: string;
}

interface QuizQuestion {
  id: string;
  question_json: {
    question: string;
    type: string;
    options: string[];
    correct_answer: string | number;
    evidence?: Evidence;
    verified?: boolean;
    position?: number;
  };
}

interface Job {
  id: string;
  status: string;
  progress: number;
  error?: string;
}

type ActiveJobAction = "generate" | "iterate" | null;
type TrainingBuilderLocationState = { jobId?: string; activeJobAction?: ActiveJobAction } | null;

const STATUS_LABELS: Record<string, string> = {
  UPLOADED: "Subido",
  TRANSCRIBING: "Transcribiendo audio…",
  CHUNKING: "Segmentando contenido…",
  EXTRACTING: "Extrayendo conocimiento…",
  PLANNING: "Planificando cobertura…",
  GENERATING_QUIZ: "Generando evaluación…",
  VERIFYING: "Verificando evidencia…",
  INDEXING: "Indexando para búsqueda…",
  READY: "Listo",
  FAILED: "Error",
};

const MIN_QUIZ_OPTIONS = 2;
const MAX_QUIZ_OPTIONS = 4;

type EditableQuizQuestionPayload = {
  type: "mcq";
  question: string;
  options: string[];
  correct_answer: number;
  evidence?: Evidence;
};

function sanitizeEvidence(evidence?: Evidence): Evidence | undefined {
  if (!evidence) return undefined;
  const segment_range = evidence.segment_range?.trim();
  const quote = evidence.quote?.trim();
  if (segment_range && quote) {
    return { segment_range, quote };
  }
  return undefined;
}

function toEditableQuizQuestionPayload(
  question?: QuizQuestion["question_json"],
): EditableQuizQuestionPayload {
  const options =
    question?.options?.length && question.options.length >= MIN_QUIZ_OPTIONS
      ? question.options.map((option) => String(option))
      : Array.from({ length: MIN_QUIZ_OPTIONS }, () => "");
  const correctAnswer =
    typeof question?.correct_answer === "number"
      ? question.correct_answer
      : Number(question?.correct_answer ?? 0);

  return {
    type: "mcq",
    question: question?.question ?? "",
    options,
    correct_answer:
      Number.isInteger(correctAnswer) && correctAnswer >= 0 && correctAnswer < options.length
        ? correctAnswer
        : 0,
    evidence: sanitizeEvidence(question?.evidence),
  };
}

function normalizeQuizDraft(draft: EditableQuizQuestionPayload): EditableQuizQuestionPayload {
  const options = draft.options.map((option) => option.trim());
  return {
    type: "mcq",
    question: draft.question.trim(),
    options,
    correct_answer: Math.min(Math.max(draft.correct_answer, 0), Math.max(options.length - 1, 0)),
    evidence: sanitizeEvidence(draft.evidence),
  };
}

function isQuizDraftValid(draft: EditableQuizQuestionPayload): boolean {
  const normalized = normalizeQuizDraft(draft);
  return (
    !!normalized.question &&
    normalized.options.length >= MIN_QUIZ_OPTIONS &&
    normalized.options.length <= MAX_QUIZ_OPTIONS &&
    normalized.options.every((option) => !!option) &&
    normalized.correct_answer >= 0 &&
    normalized.correct_answer < normalized.options.length
  );
}

function formatValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object") {
    if ("question" in value && typeof value.question === "string") return value.question;
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("title" in value && typeof value.title === "string") return value.title;
    if ("point" in value && typeof value.point === "string") return value.point;
    if ("step" in value && typeof value.step === "string") return value.step;
    return JSON.stringify(value);
  }
  return "";
}

function getStepTitle(step: Record<string, unknown>): string {
  return formatValue(step.title ?? step.step ?? step.question ?? "Paso");
}

function getStepDescription(step: Record<string, unknown>): string {
  return formatValue(step.description ?? step.answer ?? step.why ?? "");
}

function getCriticalPointText(point: Record<string, unknown>): string {
  return formatValue(point.text ?? point.point ?? point.question ?? "");
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function TrainingBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();

  /* ---- State ---- */
  const [jobId, setJobId] = useState<string | null>(null);
  const [lastJob, setLastJob] = useState<Job | null>(null);
  const [activeJobAction, setActiveJobAction] = useState<ActiveJobAction>(null);
  const [iterateText, setIterateText] = useState("");
  const [isAddingQuestion, setIsAddingQuestion] = useState(false);
  const locationState = location.state as TrainingBuilderLocationState;

  /* ---- Queries ---- */
  const { data: training, refetch: refetchTraining } = useQuery<Training>({
    queryKey: ["training", id],
    queryFn: () => api.get(`/trainings/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const { data: structure, refetch: refetchStructure } = useQuery<TrainingStructure>({
    queryKey: ["training-structure", id],
    queryFn: () => api.get(`/trainings/${id}`).then((r) => r.data?.structure),
    enabled: !!id && (training?.status === "ready" || training?.status === "published"),
  });

  const { data: questions, refetch: refetchQuiz } = useQuery<QuizQuestion[]>({
    queryKey: ["training-quiz", id],
    queryFn: () => api.get(`/trainings/${id}/quiz`).then((r) => r.data),
    enabled: !!id && (training?.status === "ready" || training?.status === "published"),
  });

  const { data: job, refetch: refetchJob } = useQuery<Job>({
    queryKey: ["job", jobId],
    queryFn: () => api.get(`/trainings/jobs/${jobId}`).then((r) => r.data),
    enabled: !!jobId,
    refetchInterval: jobId ? 2000 : false,
  });

  /* ---- When job completes, stop polling and refresh ---- */
  useEffect(() => {
    if (!job) return;
    if (job.status === "READY" || job.status === "FAILED") {
      setLastJob(job);
      setJobId(null);
      setActiveJobAction(null);
      refetchTraining();
      refetchStructure();
      refetchQuiz();
    }
  }, [job, refetchTraining, refetchStructure, refetchQuiz]);

  useEffect(() => {
    if (!locationState?.jobId) return;
    setJobId((current) => current ?? locationState.jobId ?? null);
    setActiveJobAction((current) => current ?? locationState.activeJobAction ?? null);
  }, [locationState]);

  /* ---- Mutations ---- */
  const generateMutation = useMutation({
    mutationFn: () => api.post(`/trainings/${id}/generate`).then((r) => r.data),
    onSuccess: (data: { job_id: string }) => {
      setLastJob(null);
      setActiveJobAction("generate");
      setJobId(data.job_id);
    },
  });

  const iterateMutation = useMutation({
    mutationFn: (instruction: string) =>
      api.post(`/trainings/${id}/iterate`, { instruction }).then((r) => r.data),
    onSuccess: (data: { job_id: string }) => {
      setIterateText("");
      if (data.job_id) {
        setLastJob(null);
        setActiveJobAction("iterate");
        setJobId(data.job_id);
      } else {
        refetchStructure();
        refetchQuiz();
      }
    },
  });

  const createQuizQuestionMutation = useMutation({
    mutationFn: (payload: EditableQuizQuestionPayload) =>
      api
        .post(`/trainings/${id}/quiz`, { question_json: normalizeQuizDraft(payload) })
        .then((r) => r.data),
    onSuccess: () => {
      setIsAddingQuestion(false);
      refetchQuiz();
    },
  });

  const updateQuizQuestionMutation = useMutation({
    mutationFn: ({
      questionId,
      payload,
    }: {
      questionId: string;
      payload: EditableQuizQuestionPayload;
    }) =>
      api
        .patch(`/trainings/${id}/quiz/${questionId}`, { question_json: normalizeQuizDraft(payload) })
        .then((r) => r.data),
    onSuccess: () => {
      refetchQuiz();
    },
  });

  const deleteQuizQuestionMutation = useMutation({
    mutationFn: (questionId: string) => api.delete(`/trainings/${id}/quiz/${questionId}`),
    onSuccess: () => {
      refetchQuiz();
    },
  });

  /* ---- Main builder view ---- */
  if (!id) return null;
  const isProcessing = !!jobId;
  const isReady = training?.status === "ready" || training?.status === "published";
  const hasSourceAsset = !!training?.source_storage_key;

  return (
    <div className="mx-auto max-w-5xl space-y-8 pt-8">
      {/* Header */}
      <div className="space-y-3">
        {training?.procedure_id && (
          <Link
            to={`/procedures/${training.procedure_id}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al procedimiento
          </Link>
        )}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{training?.title ?? "Training derivado"}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {training?.procedure_code && training?.version_number != null
              ? `${training.procedure_code} · v${training.version_number}`
              : `ID: ${id}`}
          </p>
          {training?.summary && <p className="mt-2 text-sm text-gray-500">{training.summary}</p>}
        </div>
      </div>

      <Section title="1. Fuente Versionada" icon={<FileVideo className="h-5 w-5 text-indigo-600" />}>
        {hasSourceAsset ? (
          <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-600" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-green-800">Video fuente vinculado a la versión</p>
              <p className="truncate text-xs text-green-600">
                {training?.source_storage_key?.split("/").pop()}
                {training?.source_size
                  ? ` — ${(training.source_size / 1024 / 1024).toFixed(1)} MB`
                  : ""}
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Esta versión todavía no tiene video fuente. Vuelve al detalle del procedimiento para subirlo y regenerar el training.
          </div>
        )}
      </Section>

      {/* Step 2: Generate */}
      <Section title="2. Generar Borrador" icon={<Sparkles className="h-5 w-5 text-indigo-600" />}>
        <p className="mb-4 text-sm text-gray-500">
          La IA analizará el video, extraerá el contenido y generará la estructura de capacitación
          y las preguntas de evaluación con evidencia verificable.
        </p>
        <button
          disabled={isProcessing || generateMutation.isPending || !hasSourceAsset}
          onClick={() => generateMutation.mutate()}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isProcessing || generateMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Generar Borrador
        </button>
        {generateMutation.isError && (
          <p className="mt-2 text-sm text-red-600">Error al iniciar la generación.</p>
        )}
        {!hasSourceAsset && (
          <p className="mt-2 text-sm text-amber-600">
            Primero debes cargar un video fuente en la versión del procedimiento.
          </p>
        )}
      </Section>

      {/* Job progress */}
      {(isProcessing || job || lastJob) && <JobProgress job={job ?? lastJob} />}

      {/* Step 3: Results */}
      {isReady && (
        <>
          {/* Structure */}
          <Section
            title="3. Estructura de la Capacitación"
            icon={<CheckCircle2 className="h-5 w-5 text-green-600" />}
          >
            {structure?.structure_json ? (
              <div className="space-y-6">
                {structure.structure_json.objectives && (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold text-gray-700">Objetivos</h4>
                    <ul className="list-inside list-disc space-y-1 text-sm text-gray-600">
                      {structure.structure_json.objectives.map((o, i) => (
                        <li key={i}>{formatValue(o)}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {structure.structure_json.steps && (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold text-gray-700">Pasos</h4>
                    <ol className="space-y-3">
                      {structure.structure_json.steps.map((step, i) => (
                        <li key={i} className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="text-sm font-medium text-gray-800">
                              {i + 1}. {getStepTitle(step as Record<string, unknown>)}
                            </p>
                            <EvidencePill evidence={step.evidence} />
                          </div>
                          <p className="mt-1 text-sm text-gray-600">
                            {getStepDescription(step as Record<string, unknown>)}
                          </p>
                          {step.evidence && <EvidenceBadge evidence={step.evidence} />}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {structure.structure_json.critical_points && (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold text-gray-700">Puntos Críticos</h4>
                    <ul className="space-y-2">
                      {structure.structure_json.critical_points.map((cp, i) => (
                        <li
                          key={i}
                          className="rounded-lg border border-amber-100 bg-amber-50 p-3"
                        >
                          <p className="text-sm text-amber-800">
                            {getCriticalPointText(cp as Record<string, unknown>)}
                          </p>
                          {cp.evidence && <EvidenceBadge evidence={cp.evidence} />}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Sin estructura disponible aún.</p>
            )}
          </Section>

          {/* Quiz */}
          <Section
            title="4. Evaluación Generada"
            icon={<CheckCircle2 className="h-5 w-5 text-green-600" />}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-sm text-gray-500">
                Puedes ajustar manualmente las preguntas, opciones y respuesta correcta.
              </p>
              <button
                type="button"
                disabled={isAddingQuestion || createQuizQuestionMutation.isPending}
                onClick={() => setIsAddingQuestion(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Agregar pregunta
              </button>
            </div>
            {isAddingQuestion && (
              <NewQuizQuestionCard
                onCancel={() => setIsAddingQuestion(false)}
                onCreate={(payload) => createQuizQuestionMutation.mutateAsync(payload)}
                isCreating={createQuizQuestionMutation.isPending}
                hasError={createQuizQuestionMutation.isError}
              />
            )}
            {questions?.length ? (
              <div className="space-y-4">
                {questions.map((q, i) => (
                  <QuizCard
                    key={q.id}
                    index={i}
                    question={q}
                    onSave={(payload) =>
                      updateQuizQuestionMutation.mutateAsync({ questionId: q.id, payload })
                    }
                    onDelete={() => deleteQuizQuestionMutation.mutateAsync(q.id)}
                    isSaving={
                      updateQuizQuestionMutation.isPending &&
                      updateQuizQuestionMutation.variables?.questionId === q.id
                    }
                    isDeleting={
                      deleteQuizQuestionMutation.isPending &&
                      deleteQuizQuestionMutation.variables === q.id
                    }
                    hasSaveError={
                      updateQuizQuestionMutation.isError &&
                      updateQuizQuestionMutation.variables?.questionId === q.id
                    }
                    hasDeleteError={
                      deleteQuizQuestionMutation.isError &&
                      deleteQuizQuestionMutation.variables === q.id
                    }
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Sin preguntas generadas aún.</p>
            )}
          </Section>

          {/* Iterate */}
          <Section
            title="5. Iterar con Instrucciones"
            icon={<RefreshCw className="h-5 w-5 text-indigo-600" />}
          >
            <p className="mb-3 text-sm text-gray-500">
              Escribe una instrucción para refinar la capacitación. Ejemplos: &ldquo;Hacerla más
              corta&rdquo;, &ldquo;Agregar más preguntas sobre higiene&rdquo;, &ldquo;Enfocarse en el
              personal de cocina&rdquo;.
            </p>
            {activeJobAction === "iterate" && isProcessing && (
              <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-700">
                <div className="flex items-center gap-2 font-medium">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Aplicando cambios a la capacitación...
                </div>
                {job && (
                  <p className="mt-1 text-xs text-indigo-600">
                    {STATUS_LABELS[job.status] ?? job.status} · {Math.min(job.progress ?? 0, 100)}%
                  </p>
                )}
              </div>
            )}
            <div className="flex gap-3">
              <textarea
                value={iterateText}
                onChange={(e) => setIterateText(e.target.value)}
                rows={3}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                placeholder="Escribe tu instrucción aquí…"
              />
              <button
                disabled={!iterateText.trim() || iterateMutation.isPending || isProcessing}
                onClick={() => iterateMutation.mutate(iterateText.trim())}
                className="self-end rounded-lg bg-indigo-600 p-3 text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {iterateMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </button>
            </div>
            {iterateMutation.isError && (
              <p className="mt-2 text-sm text-red-600">Error al iterar.</p>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <div className="mb-4 flex items-center gap-2">
        {icon}
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function JobProgress({ job }: { job?: Job | null }) {
  if (!job) return null;

  const label = STATUS_LABELS[job.status] ?? job.status;
  const isFailed = job.status === "FAILED";
  const isReady = job.status === "READY";
  const progress = Math.min(job.progress ?? 0, 100);

  return (
    <div
      className={`rounded-2xl border p-6 ${
        isFailed
          ? "border-red-200 bg-red-50"
          : isReady
            ? "border-green-200 bg-green-50"
            : "border-indigo-200 bg-indigo-50"
      }`}
    >
      <div className="mb-3 flex items-center gap-2">
        {isFailed ? (
          <AlertCircle className="h-5 w-5 text-red-500" />
        ) : isReady ? (
          <CheckCircle2 className="h-5 w-5 text-green-600" />
        ) : (
          <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
        )}
        <span className="text-sm font-medium text-gray-800">{label}</span>
        <span className="ml-auto text-xs text-gray-500">{progress}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-white/60">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isFailed ? "bg-red-500" : isReady ? "bg-green-500" : "bg-indigo-500"
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
      {isFailed && job.error && (
        <p className="mt-3 text-sm text-red-700">{job.error}</p>
      )}
    </div>
  );
}

function EvidenceBadge({ evidence }: { evidence: Evidence }) {
  if (!evidence.quote) return null;
  return (
    <div className="mt-2 flex items-start gap-2 rounded-md border border-indigo-100 bg-indigo-50/50 px-3 py-2">
      <Quote className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-indigo-400" />
      <div className="min-w-0 text-xs">
        {evidence.quote && (
          <p className="italic text-indigo-700">&ldquo;{evidence.quote}&rdquo;</p>
        )}
      </div>
    </div>
  );
}

function EvidencePill({ evidence }: { evidence?: Evidence | null }) {
  if (!evidence?.segment_range && !evidence?.start_time) return null;

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs text-gray-500">
      <Clock className="h-3 w-3" />
      {evidence.segment_range ?? evidence.start_time}
      {!evidence.segment_range && evidence.end_time ? ` – ${evidence.end_time}` : ""}
    </span>
  );
}

function QuizQuestionEditor({
  draft,
  onChange,
  groupId,
  disabled,
}: {
  draft: EditableQuizQuestionPayload;
  onChange: (draft: EditableQuizQuestionPayload) => void;
  groupId: string;
  disabled?: boolean;
}) {
  const updateOption = (index: number, value: string) => {
    const nextOptions = [...draft.options];
    nextOptions[index] = value;
    onChange({ ...draft, options: nextOptions });
  };

  const addOption = () => {
    if (draft.options.length >= MAX_QUIZ_OPTIONS) return;
    onChange({ ...draft, options: [...draft.options, ""] });
  };

  const removeOption = (index: number) => {
    if (draft.options.length <= MIN_QUIZ_OPTIONS) return;
    const nextOptions = draft.options.filter((_, optionIndex) => optionIndex !== index);
    const nextCorrect =
      draft.correct_answer === index
        ? 0
        : draft.correct_answer > index
          ? draft.correct_answer - 1
          : draft.correct_answer;
    onChange({
      ...draft,
      options: nextOptions,
      correct_answer: Math.min(nextCorrect, nextOptions.length - 1),
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
          Pregunta
        </label>
        <textarea
          value={draft.question}
          onChange={(e) => onChange({ ...draft, question: e.target.value })}
          rows={3}
          disabled={disabled}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-gray-100"
          placeholder="Escribe el enunciado de la pregunta"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Opciones
          </label>
          <button
            type="button"
            disabled={disabled || draft.options.length >= MAX_QUIZ_OPTIONS}
            onClick={addOption}
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar opción
          </button>
        </div>
        {draft.options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="radio"
                name={`correct-answer-${groupId}`}
                checked={draft.correct_answer === i}
                disabled={disabled}
                onChange={() => onChange({ ...draft, correct_answer: i })}
                className="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              Correcta
            </label>
            <input
              type="text"
              value={opt}
              onChange={(e) => updateOption(i, e.target.value)}
              disabled={disabled}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-gray-100"
              placeholder={`Opción ${i + 1}`}
            />
            <button
              type="button"
              disabled={disabled || draft.options.length <= MIN_QUIZ_OPTIONS}
              onClick={() => removeOption(i)}
              className="rounded-md p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <p className="text-xs text-gray-400">Cada pregunta debe tener entre 2 y 4 opciones.</p>
      </div>
    </div>
  );
}

function QuizCard({
  index,
  question,
  onSave,
  onDelete,
  isSaving,
  isDeleting,
  hasSaveError,
  hasDeleteError,
}: {
  index: number;
  question: QuizQuestion;
  onSave: (payload: EditableQuizQuestionPayload) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
  isSaving?: boolean;
  isDeleting?: boolean;
  hasSaveError?: boolean;
  hasDeleteError?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<EditableQuizQuestionPayload>(
    toEditableQuizQuestionPayload(question.question_json),
  );
  const q = question.question_json;

  useEffect(() => {
    setDraft(toEditableQuizQuestionPayload(question.question_json));
  }, [question]);

  const handleCancel = () => {
    setDraft(toEditableQuizQuestionPayload(question.question_json));
    setIsEditing(false);
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="flex items-start gap-3">
        <button
          onClick={() => setOpen(!open)}
          className="flex flex-1 items-start justify-between gap-2 text-left"
        >
          <div className="min-w-0 flex-1">
            <span className="text-xs font-medium text-indigo-600">
              Pregunta {index + 1} <span className="text-gray-400">(Opción múltiple)</span>
            </span>
            <p className="mt-1 text-sm font-medium text-gray-800">{q.question}</p>
          </div>
          {open ? (
            <ChevronUp className="mt-1 h-4 w-4 flex-shrink-0 text-gray-400" />
          ) : (
            <ChevronDown className="mt-1 h-4 w-4 flex-shrink-0 text-gray-400" />
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setIsEditing(true);
          }}
          className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:border-indigo-200 hover:text-indigo-600"
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-3 border-t border-gray-200 pt-3">
          {isEditing ? (
            <>
              <QuizQuestionEditor
                draft={draft}
                onChange={setDraft}
                groupId={question.id}
                disabled={isSaving || isDeleting}
              />
              {q.evidence && (
                <div className="rounded-lg border border-gray-100 bg-white px-3 py-2 text-xs text-gray-500">
                  La evidencia original se conservara automaticamente al guardar.
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => void onDelete()}
                  disabled={isSaving || isDeleting}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Eliminar pregunta
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={isSaving || isDeleting}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await onSave(normalizeQuizDraft(draft));
                        setIsEditing(false);
                      } catch {}
                    }}
                    disabled={!isQuizDraftValid(draft) || isSaving || isDeleting}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Guardar
                  </button>
                </div>
              </div>
              {hasSaveError && <p className="text-sm text-red-600">No se pudieron guardar los cambios.</p>}
              {hasDeleteError && <p className="text-sm text-red-600">No se pudo eliminar la pregunta.</p>}
            </>
          ) : (
            <>
              {q.options && (
                <div className="space-y-1.5">
                  {q.options.map((opt, i) => (
                    <div
                      key={i}
                      className={`rounded-md px-3 py-2 text-sm ${
                        q.correct_answer !== undefined &&
                        (q.correct_answer === i || q.correct_answer === opt)
                          ? "border border-green-200 bg-green-50 font-medium text-green-800"
                          : "border border-gray-100 bg-white text-gray-700"
                      }`}
                    >
                      {String.fromCharCode(65 + i)}. {formatValue(opt)}
                    </div>
                  ))}
                </div>
              )}
              {q.evidence && <EvidenceBadge evidence={q.evidence} />}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function NewQuizQuestionCard({
  onCreate,
  onCancel,
  isCreating,
  hasError,
}: {
  onCreate: (payload: EditableQuizQuestionPayload) => Promise<unknown>;
  onCancel: () => void;
  isCreating?: boolean;
  hasError?: boolean;
}) {
  const [draft, setDraft] = useState<EditableQuizQuestionPayload>(toEditableQuizQuestionPayload());

  return (
    <div className="mb-4 rounded-xl border border-dashed border-indigo-300 bg-indigo-50/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Plus className="h-4 w-4 text-indigo-600" />
        <h3 className="text-sm font-semibold text-indigo-900">Nueva pregunta</h3>
      </div>
      <QuizQuestionEditor
        draft={draft}
        onChange={setDraft}
        groupId="new-question"
        disabled={isCreating}
      />
      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isCreating}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <X className="h-4 w-4" />
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void onCreate(normalizeQuizDraft(draft))}
          disabled={!isQuizDraftValid(draft) || isCreating}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar pregunta
        </button>
      </div>
      {hasError && <p className="mt-3 text-sm text-red-600">No se pudo crear la pregunta.</p>}
    </div>
  );
}
