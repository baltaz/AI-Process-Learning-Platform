import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/services/api";
import {
  ClipboardList,
  Plus,
  Loader2,
  X,
  Calendar,
  User,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from "lucide-react";

interface Assignment {
  id: string;
  training_id: string;
  training_title?: string;
  user_id: string;
  user_name?: string;
  status: string;
  score?: number;
  due_date?: string;
  completed_at?: string;
}

interface Training {
  id: string;
  title: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  assigned: { label: "Asignada", color: "bg-blue-100 text-blue-800", icon: Clock },
  in_progress: { label: "En progreso", color: "bg-yellow-100 text-yellow-800", icon: Clock },
  completed: { label: "Completada", color: "bg-green-100 text-green-800", icon: CheckCircle2 },
  overdue: { label: "Vencida", color: "bg-red-100 text-red-800", icon: AlertTriangle },
};

export default function AssignmentsPage() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ training_id: "", user_ids: "", due_date: "" });

  const { data: assignments, isLoading } = useQuery<Assignment[]>({
    queryKey: ["assignments"],
    queryFn: () => api.get("/assignments").then((r) => r.data),
  });

  const { data: trainings } = useQuery<Training[]>({
    queryKey: ["trainings"],
    queryFn: () => api.get("/trainings").then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (payload: { training_id: string; user_ids: string[]; due_date?: string }) =>
      api.post("/assignments", payload).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      setShowModal(false);
      setForm({ training_id: "", user_ids: "", due_date: "" });
    },
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const user_ids = form.user_ids
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    createMutation.mutate({
      training_id: form.training_id,
      user_ids,
      due_date: form.due_date || undefined,
    });
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Asignaciones</h1>
          <p className="mt-1 text-sm text-gray-500">
            Asigna capacitaciones a usuarios y haz seguimiento
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Nueva Asignación
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      ) : !assignments?.length ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 py-16 text-center">
          <ClipboardList className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm font-medium text-gray-600">No hay asignaciones</p>
          <p className="mt-1 text-sm text-gray-400">Asigna una capacitación a un usuario</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-5 py-3 text-left font-medium text-gray-600">Capacitación</th>
                <th className="px-5 py-3 text-left font-medium text-gray-600">Usuario</th>
                <th className="px-5 py-3 text-left font-medium text-gray-600">Estado</th>
                <th className="px-5 py-3 text-left font-medium text-gray-600">Puntaje</th>
                <th className="px-5 py-3 text-left font-medium text-gray-600">Vencimiento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {assignments.map((a) => {
                const sc = statusConfig[a.status] ?? {
                  label: a.status,
                  color: "bg-gray-100 text-gray-700",
                  icon: Clock,
                };
                return (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">
                      {a.training_title ?? a.training_id}
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      <span className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-gray-400" />
                        {a.user_name ?? a.user_id}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${sc.color}`}
                      >
                        {sc.label}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {a.score != null ? `${a.score}%` : "—"}
                    </td>
                    <td className="px-5 py-3 text-gray-500">
                      {a.due_date ? (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(a.due_date).toLocaleDateString("es-AR")}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Nueva Asignación</h2>
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">Capacitación</span>
                <select
                  required
                  value={form.training_id}
                  onChange={(e) => setForm((f) => ({ ...f, training_id: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                >
                  <option value="">Seleccionar…</option>
                  {trainings?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">
                  IDs de usuarios (separados por coma)
                </span>
                <input
                  type="text"
                  required
                  value={form.user_ids}
                  onChange={(e) => setForm((f) => ({ ...f, user_ids: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="user-1, user-2"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">
                  Fecha de vencimiento
                </span>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </label>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Asignar
                </button>
              </div>
              {createMutation.isError && (
                <p className="text-sm text-red-600">Error al crear la asignación.</p>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
