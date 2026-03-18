import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BriefcaseBusiness, Loader2, Plus, X } from "lucide-react";
import { Link } from "react-router-dom";

import api from "@/services/api";

interface Role {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
}

export default function AdminRolesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", description: "" });

  const { data: roles, isLoading } = useQuery<Role[]>({
    queryKey: ["roles"],
    queryFn: () => api.get("/roles").then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: () => api.post("/roles", form).then((r) => r.data as Role),
    onSuccess: (createdRole) => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      setForm({ code: "", name: "", description: "" });
      setShowForm(false);
      void createdRole;
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Roles</h1>
          <p className="mt-1 text-sm text-gray-500">
            Definí roles operativos y entrá al detalle para editar su configuración.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Nuevo rol
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate();
          }}
          className="rounded-2xl border border-gray-200 bg-white p-6"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Crear rol</h2>
              <p className="mt-1 text-sm text-gray-500">Luego podés completar vínculos y ajustes en el detalle.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input
              required
              placeholder="Código"
              value={form.code}
              onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
              className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
            />
            <input
              required
              placeholder="Nombre"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
            />
            <textarea
              rows={3}
              placeholder="Descripción"
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              className="md:col-span-2 rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
            />
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Crear rol
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      ) : !roles?.length ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 py-16 text-center">
          <BriefcaseBusiness className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm font-medium text-gray-600">No hay roles definidos</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {roles.map((role) => (
            <Link
              key={role.id}
              to={`/roles/${role.id}`}
              className="rounded-2xl border border-gray-200 bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">{role.code}</p>
                  <h3 className="mt-1 text-lg font-semibold text-gray-900">{role.name}</h3>
                </div>
                <BriefcaseBusiness className="h-5 w-5 text-gray-300" />
              </div>
              <p className="mt-3 text-sm text-gray-600">{role.description || "Sin descripción."}</p>
              <div className="mt-4">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    role.is_active === false ? "bg-gray-100 text-gray-600" : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {role.is_active === false ? "Inactivo" : "Activo"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
