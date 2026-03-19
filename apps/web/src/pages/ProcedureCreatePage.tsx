import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Upload } from "lucide-react";

import api from "@/services/api";

interface RoleOption {
  id: string;
  name: string;
}

interface ProcedureCreateResponse {
  id: string;
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

export default function ProcedureCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [procedureForm, setProcedureForm] = useState({
    title: "",
    description: "",
    owner_role_id: "",
  });
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const { data: roles } = useQuery<RoleOption[]>({
    queryKey: ["roles"],
    queryFn: () => api.get("/roles").then((r) => r.data),
  });

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

  const createMutation = useMutation({
    mutationFn: async () => {
      let sourceAsset:
        | {
            storage_key: string;
            mime: string;
            size: number;
            asset_type: string;
          }
        | undefined;

      if (sourceFile) {
        const contentType = sourceFile.type || "application/octet-stream";
        const { data: presign } = await api.post("/uploads/presign", {
          filename: sourceFile.name,
          content_type: contentType,
        });

        await uploadSourceFile(sourceFile, presign.presigned_url, contentType);

        sourceAsset = {
          storage_key: presign.storage_key,
          mime: contentType,
          size: sourceFile.size,
          asset_type: "video",
        };
      }

      const payload = {
        title: procedureForm.title.trim(),
        description: procedureForm.description.trim() || null,
        owner_role_id: procedureForm.owner_role_id || null,
        source_asset: sourceAsset ?? null,
      };

      return api.post("/procedures", payload).then((r) => r.data as ProcedureCreateResponse);
    },
    onSuccess: (procedure) => {
      queryClient.invalidateQueries({ queryKey: ["procedures"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      navigate(`/procedures/${procedure.id}`);
    },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link
            to="/procedures"
            className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a procedimientos
          </Link>
          <h1 className="mt-3 text-2xl font-bold text-gray-900">Nuevo procedimiento</h1>
          <p className="mt-1 text-sm text-gray-500">
            Crea el procedimiento. El sistema generará el código y la primera versión automáticamente.
          </p>
        </div>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          createMutation.mutate();
        }}
        className="space-y-6"
      >
        <section className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Datos del procedimiento</h2>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">Nombre</span>
                <input
                  required
                  value={procedureForm.title}
                  onChange={(event) => setProcedureForm((current) => ({ ...current, title: event.target.value }))}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                  placeholder="Recepción y validación de mercadería"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">Descripción</span>
                <textarea
                  rows={4}
                  value={procedureForm.description}
                  onChange={(event) =>
                    setProcedureForm((current) => ({ ...current, description: event.target.value }))
                  }
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                  placeholder="Describe el objetivo operativo del procedimiento."
                />
              </label>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">Rol</span>
                <select
                  value={procedureForm.owner_role_id}
                  onChange={(event) =>
                    setProcedureForm((current) => ({ ...current, owner_role_id: event.target.value }))
                  }
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                >
                  <option value="">Sin asignar</option>
                  {roles?.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Cargar archivo fuente</h2>
          <p className="mt-1 text-sm text-gray-500">
            Puedes dejar asociada una fuente a la versión inicial en la misma alta. En esta iteración se reutiliza
            el flujo actual de video.
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
          {createMutation.isError && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {getErrorMessage(createMutation.error, "No se pudo crear el procedimiento.")}
            </div>
          )}
        </section>

        <div className="flex items-center justify-end gap-3">
          <Link
            to="/procedures"
            className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Procesar
          </button>
        </div>
      </form>
    </div>
  );
}
