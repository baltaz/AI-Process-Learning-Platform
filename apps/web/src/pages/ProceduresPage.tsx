import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BookCopy, FilePlus2, Loader2, Network, Plus } from "lucide-react";
import api from "@/services/api";

interface ProcedureVersion {
  id: string;
  version_number: number;
  status: string;
  change_summary?: string | null;
}

interface Procedure {
  id: string;
  code: string;
  title: string;
  description?: string | null;
  owner_role_name?: string | null;
  latest_version?: ProcedureVersion | null;
}

export default function ProceduresPage() {
  const { data: procedures, isLoading } = useQuery<Procedure[]>({
    queryKey: ["procedures"],
    queryFn: () => api.get("/procedures").then((r) => r.data),
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Procedimientos</h1>
          <p className="mt-1 text-sm text-gray-500">
            Biblioteca versionada que actúa como fuente de verdad operativa.
          </p>
        </div>
        <Link
          to="/procedures/new"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Nuevo procedimiento
        </Link>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      ) : !procedures?.length ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 py-16 text-center">
          <BookCopy className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm font-medium text-gray-600">Todavía no hay procedimientos</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {procedures.map((procedure) => (
            <Link
              key={procedure.id}
              to={`/procedures/${procedure.id}`}
              className="rounded-2xl border border-gray-200 bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                    {procedure.code}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-gray-900">{procedure.title}</h2>
                </div>
                <Network className="h-5 w-5 text-gray-300" />
              </div>
              <p className="mt-3 text-sm text-gray-600">
                {procedure.description || "Sin descripción cargada."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-500">
                <span className="rounded-full bg-gray-100 px-2.5 py-1">
                  Owner: {procedure.owner_role_name || "Sin rol"}
                </span>
                <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-indigo-700">
                  v{procedure.latest_version?.version_number ?? 0}
                </span>
                <span className="rounded-full bg-gray-100 px-2.5 py-1">
                  {procedure.latest_version?.status ?? "Sin versión"}
                </span>
              </div>
              {procedure.latest_version?.change_summary && (
                <div className="mt-4 flex items-start gap-2 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  <FilePlus2 className="mt-0.5 h-3.5 w-3.5 text-gray-400" />
                  <span>{procedure.latest_version.change_summary}</span>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
