import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import api from "@/services/api";
import { Plus, BookOpen, Loader2, Clock, Trash2 } from "lucide-react";

interface Training {
  id: string;
  title: string;
  status: string;
  created_at: string;
}

const statusLabel: Record<string, { text: string; color: string }> = {
  draft: { text: "Borrador", color: "bg-yellow-100 text-yellow-800" },
  published: { text: "Publicada", color: "bg-green-100 text-green-800" },
  processing: { text: "Procesando", color: "bg-blue-100 text-blue-800" },
};

export default function TrainingsPage() {
  const queryClient = useQueryClient();
  const { data: trainings, isLoading } = useQuery<Training[]>({
    queryKey: ["trainings"],
    queryFn: () => api.get("/trainings").then((r) => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (trainingId: string) => api.delete(`/trainings/${trainingId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainings"] });
    },
  });

  function handleDelete(training: Training) {
    if (deleteMutation.isPending) return;
    const confirmed = window.confirm(
      `¿Seguro que quieres eliminar la capacitación "${training.title}"? Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;
    deleteMutation.mutate(training.id);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Capacitaciones</h1>
          <p className="mt-1 text-sm text-gray-500">
            Gestiona tus mini-capacitaciones generadas con IA
          </p>
        </div>
        <Link
          to="/trainings/new"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Nueva Capacitación
        </Link>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      ) : !trainings?.length ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 py-16 text-center">
          <BookOpen className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm font-medium text-gray-600">No hay capacitaciones aún</p>
          <p className="mt-1 text-sm text-gray-400">
            Crea tu primera capacitación subiendo un video
          </p>
          <Link
            to="/trainings/new"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            Crear capacitación
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {trainings.map((t) => {
            const badge = statusLabel[t.status] ?? {
              text: t.status,
              color: "bg-gray-100 text-gray-700",
            };
            const isDeleting = deleteMutation.isPending && deleteMutation.variables === t.id;
            return (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-4 transition-shadow hover:shadow-md"
              >
                <Link to={`/trainings/${t.id}`} className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-gray-900">{t.title}</h3>
                  <div className="mt-1.5 flex items-center gap-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${badge.color}`}
                    >
                      {badge.text}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <Clock className="h-3 w-3" />
                      {new Date(t.created_at).toLocaleDateString("es-AR")}
                    </span>
                  </div>
                </Link>
                <div className="ml-4 flex items-center gap-2">
                  <Link to={`/trainings/${t.id}`} className="text-xs text-gray-400">
                    Ver →
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDelete(t)}
                    disabled={deleteMutation.isPending}
                    className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isDeleting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    Eliminar
                  </button>
                </div>
              </div>
            );
          })}
          {deleteMutation.isError && (
            <p className="text-sm text-red-600">
              No se pudo eliminar la capacitación. Intenta nuevamente.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
