import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/services/api";
import {
  Upload,
  Loader2,
  Play,
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
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TrainingAsset {
  id: string;
  type: string;
  storage_key: string;
  mime: string | null;
  size: number | null;
}

interface Training {
  id: string;
  title: string;
  status: string;
  created_at: string;
  assets: TrainingAsset[];
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
  };
}

interface Job {
  id: string;
  status: string;
  progress: number;
  error?: string;
}

type ActiveJobAction = "generate" | "iterate" | null;

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
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  /* ---- State ---- */
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [lastJob, setLastJob] = useState<Job | null>(null);
  const [activeJobAction, setActiveJobAction] = useState<ActiveJobAction>(null);
  const [iterateText, setIterateText] = useState("");
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  /* ---- Mutations ---- */
  const createMutation = useMutation({
    mutationFn: (payload: { title: string }) =>
      api.post("/trainings", payload).then((r) => r.data),
    onSuccess: (data: Training) => {
      queryClient.invalidateQueries({ queryKey: ["trainings"] });
      navigate(`/trainings/${data.id}`, { replace: true });
    },
  });

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

  /* ---- Upload handler ---- */
  const handleUpload = useCallback(async () => {
    if (!file || !id) return;
    setUploading(true);
    setUploadProgress(0);

    try {
      const { data: presign } = await api.post("/uploads/presign", {
        filename: file.name,
        content_type: file.type,
      });

      await fetch(presign.presigned_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      setUploadProgress(80);

      await api.post(`/trainings/${id}/assets`, {
        storage_key: presign.storage_key,
        type: "video",
        mime: file.type,
        size: file.size,
      });

      setUploadProgress(100);
      refetchTraining();
    } catch {
      alert("Error al subir el video. Intenta nuevamente.");
    } finally {
      setUploading(false);
    }
  }, [file, id, refetchTraining]);

  /* ---- Create flow (no id yet) ---- */
  if (!id) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900">Nueva Capacitación</h1>
        <p className="mt-1 text-sm text-gray-500">
          Sube un video operativo corto (&le; 5 min) y la IA generará la capacitación y evaluación.
        </p>

        <div className="mt-8 space-y-6 rounded-2xl border border-gray-200 bg-white p-6">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              Título de la capacitación
            </span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="Ej: Preparación de Chocotorta"
            />
          </label>

          <button
            disabled={!title.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate({ title: title.trim() })}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
          >
            {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Crear y continuar
          </button>

          {createMutation.isError && (
            <p className="text-sm text-red-600">Error al crear la capacitación.</p>
          )}
        </div>
      </div>
    );
  }

  /* ---- Main builder view ---- */
  const isProcessing = !!jobId;
  const isReady = training?.status === "ready" || training?.status === "published";
  const hasVideoAsset = !!training?.assets?.some((asset) => asset.type === "video");

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{training?.title ?? "Capacitación"}</h1>
        <p className="mt-1 text-sm text-gray-400">ID: {id}</p>
      </div>

      {/* Step 1: Upload video */}
      <Section title="1. Subir Video" icon={<FileVideo className="h-5 w-5 text-indigo-600" />}>
        {training?.assets?.length ? (
          <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-600" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-green-800">Video cargado</p>
              <p className="truncate text-xs text-green-600">
                {training.assets[0].storage_key.split("/").pop()}
                {training.assets[0].size
                  ? ` — ${(training.assets[0].size / 1024 / 1024).toFixed(1)} MB`
                  : ""}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <label
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 transition-colors ${
                file ? "border-indigo-300 bg-indigo-50" : "border-gray-300 hover:border-gray-400"
              }`}
            >
              <input
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <>
                  <FileVideo className="h-8 w-8 text-indigo-500" />
                  <p className="mt-2 text-sm font-medium text-gray-700">{file.name}</p>
                  <p className="text-xs text-gray-400">
                    {(file.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-gray-400" />
                  <p className="mt-2 text-sm text-gray-500">
                    Haz clic o arrastra un archivo de video
                  </p>
                  <p className="text-xs text-gray-400">MP4, MOV, WebM — máximo 5 minutos</p>
                </>
              )}
            </label>

            {file && (
              <button
                disabled={uploading}
                onClick={handleUpload}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {uploading ? `Subiendo… ${uploadProgress}%` : "Subir Video"}
              </button>
            )}

            {uploading && (
              <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}
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
          disabled={isProcessing || generateMutation.isPending || !hasVideoAsset}
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
        {!hasVideoAsset && (
          <p className="mt-2 text-sm text-amber-600">
            Primero debes subir un video para habilitar la generación.
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
                          <p className="text-sm font-medium text-gray-800">
                            {i + 1}. {getStepTitle(step as Record<string, unknown>)}
                          </p>
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
            {questions?.length ? (
              <div className="space-y-4">
                {questions.map((q, i) => (
                  <QuizCard key={q.id} index={i} question={q} />
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
              corta&rdquo;, &ldquo;Agregar preguntas situacionales&rdquo;, &ldquo;Enfocarse en el
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
  if (!evidence.quote && !evidence.start_time && !evidence.segment_range) return null;
  return (
    <div className="mt-2 flex items-start gap-2 rounded-md border border-indigo-100 bg-indigo-50/50 px-3 py-2">
      <Quote className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-indigo-400" />
      <div className="min-w-0 text-xs">
        {evidence.quote && (
          <p className="italic text-indigo-700">&ldquo;{evidence.quote}&rdquo;</p>
        )}
        {(evidence.start_time || evidence.segment_range) && (
          <p className="mt-0.5 flex items-center gap-1 text-indigo-500">
            <Clock className="h-3 w-3" />
            {evidence.segment_range ?? evidence.start_time}
            {!evidence.segment_range && evidence.end_time ? ` – ${evidence.end_time}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}

function QuizCard({ index, question }: { index: number; question: QuizQuestion }) {
  const [open, setOpen] = useState(false);
  const q = question.question_json;

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-start justify-between gap-2 text-left"
      >
        <div className="min-w-0 flex-1">
          <span className="text-xs font-medium text-indigo-600">
            Pregunta {index + 1}{" "}
            <span className="text-gray-400">
              ({q.type === "mcq" ? "Opción múltiple" : q.type === "situational" ? "Situacional" : q.type})
            </span>
          </span>
          <p className="mt-1 text-sm font-medium text-gray-800">{q.question}</p>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 flex-shrink-0 text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-400" />
        )}
      </button>

      {open && (
        <div className="mt-3 space-y-3 border-t border-gray-200 pt-3">
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
        </div>
      )}
    </div>
  );
}
