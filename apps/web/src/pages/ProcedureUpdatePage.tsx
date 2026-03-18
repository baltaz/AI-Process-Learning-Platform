import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Upload } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import api from "@/services/api";

interface ProcedureVersion {
  id: string;
  version_number: number;
  change_summary?: string | null;
  change_reason?: string | null;
  effective_from?: string | null;
  content_text?: string | null;
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

const MAX_SOURCE_FILE_SIZE_BYTES = 50 * 1024 * 1024;

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

export default function ProcedureUpdatePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    change_summary: "",
    change_reason: "",
    effective_from: "",
    content_text: "",
  });
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

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
    if (!latestUpdate) return;
    setForm({
      change_summary: "",
      change_reason: "",
      effective_from: "",
      content_text: latestUpdate.content_text || "",
    });
  }, [latestUpdate]);

  function handleSelectedFile(file: File | null) {
    if (!file) {
      setSourceFile(null);
      setFileError(null);
      return;
    }

    if (file.size > MAX_SOURCE_FILE_SIZE_BYTES) {
      setSourceFile(null);
      setFileError("El archivo supera el límite de 50 MB.");
      return;
    }

    setSourceFile(file);
    setFileError(null);
  }

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { data: createdUpdate } = await api.post(`/procedures/${id}/versions`, {
        change_summary: form.change_summary.trim(),
        change_reason: form.change_reason.trim() || null,
        effective_from: form.effective_from || null,
        content_text: form.content_text.trim(),
        status: "draft",
      });

      if (sourceFile) {
        const contentType = sourceFile.type || "application/octet-stream";
        const { data: presign } = await api.post("/uploads/presign", {
          filename: sourceFile.name,
          content_type: contentType,
        });

        await fetch(presign.presigned_url, {
          method: "PUT",
          body: sourceFile,
          headers: { "Content-Type": contentType },
        });

        await api.post(`/procedures/versions/${(createdUpdate as ProcedureVersionResponse).id}/source-asset`, {
          storage_key: presign.storage_key,
          mime: contentType,
          size: sourceFile.size,
          asset_type: "video",
        });
      }

      return createdUpdate as ProcedureVersionResponse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procedure", id] });
      queryClient.invalidateQueries({ queryKey: ["procedures"] });
      queryClient.invalidateQueries({ queryKey: ["trainings"] });
      navigate(`/procedures/${id}`);
    },
  });

  if (isLoading || !procedure) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
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
                Estás generando una nueva actualización para <span className="font-medium">{procedure.title}</span>.
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
          updateMutation.mutate();
        }}
        className="space-y-6"
      >
        <section className="rounded-3xl border border-gray-200 bg-white p-6">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Detalle de la actualización</h2>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">Resumen de la actualización</span>
                <input
                  required
                  value={form.change_summary}
                  onChange={(event) => setForm((current) => ({ ...current, change_summary: event.target.value }))}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                  placeholder="Qué cambió en esta actualización"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">Motivo de la actualización</span>
                <textarea
                  rows={3}
                  value={form.change_reason}
                  onChange={(event) => setForm((current) => ({ ...current, change_reason: event.target.value }))}
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
                  value={form.effective_from}
                  onChange={(event) => setForm((current) => ({ ...current, effective_from: event.target.value }))}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                />
              </label>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">Contenido actualizado</h2>
          <textarea
            required
            rows={12}
            value={form.content_text}
            onChange={(event) => setForm((current) => ({ ...current, content_text: event.target.value }))}
            className="mt-4 w-full rounded-2xl border border-gray-300 px-4 py-4 text-sm"
            placeholder="Describe el procedimiento actualizado."
          />
        </section>

        <section className="rounded-3xl border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">Cargar fuente de la actualización</h2>
          <p className="mt-1 text-sm text-gray-500">
            Puedes dejar asociada una nueva fuente a esta actualización. En esta iteración se reutiliza el flujo actual de video.
          </p>

          <div
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragActive(true);
            }}
            onDragLeave={() => setIsDragActive(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragActive(false);
              handleSelectedFile(event.dataTransfer.files?.[0] ?? null);
            }}
            className={`mt-5 rounded-[24px] border-2 border-dashed px-6 py-10 text-center transition ${
              isDragActive ? "border-indigo-400 bg-indigo-50" : "border-gray-200 bg-gray-50/70"
            }`}
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm">
              <Upload className="h-6 w-6 text-indigo-600" />
            </div>
            <p className="mt-4 text-lg font-semibold text-gray-900">Elija un archivo o arrástrelo aquí</p>
            <p className="mt-2 text-sm text-gray-500">Fuente soportada en esta iteración: video de hasta 50 MB.</p>
            <label className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50">
              <Upload className="h-4 w-4" />
              Subir archivo
              <input
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(event) => handleSelectedFile(event.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          {sourceFile && (
            <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              {sourceFile.name} · {(sourceFile.size / 1024 / 1024).toFixed(1)} MB
            </div>
          )}
          {fileError && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {fileError}
            </div>
          )}
          {updateMutation.isError && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {getErrorMessage(updateMutation.error, "No se pudo actualizar el procedimiento.")}
            </div>
          )}
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
            disabled={updateMutation.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Actualizar procedimiento
          </button>
        </div>
      </form>
    </div>
  );
}
