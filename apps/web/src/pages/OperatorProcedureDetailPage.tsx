import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpenCheck, ClipboardList, Loader2 } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { getStoredUser } from "@/lib/auth";
import type { ComplianceItem } from "@/lib/operatorData";
import api from "@/services/api";

interface ProcedureStructure {
  objectives?: string[];
  steps?: Array<{
    title: string;
    description: string;
    evidence?: { segment_range?: string };
    origin?: string;
    edited?: boolean;
  }>;
  critical_points?: Array<{ text: string; why: string; evidence?: { segment_range?: string } }>;
}

interface ProcedureVersion {
  id: string;
  version_number: number;
  status: string;
  content_text?: string | null;
  content_json?: ProcedureStructure | null;
  source_result?: {
    structure?: ProcedureStructure;
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

export default function OperatorProcedureDetailPage() {
  const { id } = useParams<{ id: string }>();
  const user = getStoredUser();

  const { data: compliance = [], isLoading: complianceLoading } = useQuery<ComplianceItem[]>({
    queryKey: ["operator-procedure-compliance", user?.id],
    queryFn: () => api.get("/compliance", { params: { user_id: user?.id } }).then((r) => r.data),
    enabled: Boolean(user?.id),
  });

  const { data: procedure, isLoading: procedureLoading } = useQuery<ProcedureDetail>({
    queryKey: ["operator-procedure-detail", id],
    queryFn: () => api.get(`/procedures/${id}`).then((r) => r.data),
    enabled: Boolean(id),
  });

  const complianceItem = useMemo(
    () => compliance.find((item) => item.procedure_id === id) ?? null,
    [compliance, id],
  );

  const latestVersion = useMemo(() => {
    const versions = procedure?.versions ?? [];
    return [...versions].sort((a, b) => b.version_number - a.version_number)[0] ?? null;
  }, [procedure]);
  const displayStructure = latestVersion?.content_json ?? latestVersion?.source_result?.structure ?? null;

  if (complianceLoading || procedureLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!procedure || !complianceItem) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
        <h1 className="text-lg font-semibold">Procedimiento no disponible</h1>
        <p className="mt-2 text-sm">
          Este procedimiento no está asociado a los roles activos del usuario o no pudo cargarse.
        </p>
        <Link to="/procedures" className="mt-4 inline-flex text-sm font-medium text-amber-900 underline">
          Volver a procedimientos
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-3">
        <Link
          to="/procedures"
          className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a procedimientos
        </Link>
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">{procedure.code}</p>
              <h1 className="mt-1 text-2xl font-bold text-gray-900">{procedure.title}</h1>
              <p className="mt-2 max-w-3xl text-sm text-gray-600">
                {procedure.description || "Sin descripción disponible."}
              </p>
            </div>

            {complianceItem.assignment_id && (
              <Link
                to={`/trainings/${complianceItem.assignment_id}`}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
              >
                <BookOpenCheck className="h-4 w-4" />
                Ir al training
              </Link>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-500">
            <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-indigo-700">
              {complianceItem.role_name || "Rol activo"}
            </span>
            <span className="rounded-full bg-gray-100 px-2.5 py-1">
              {latestVersion ? `Versión v${latestVersion.version_number}` : "Sin versión"}
            </span>
            {complianceItem.last_score != null && (
              <span className="rounded-full bg-green-50 px-2.5 py-1 text-green-700">
                Último score: {complianceItem.last_score}%
              </span>
            )}
          </div>
        </div>
      </div>

      {displayStructure ? (
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Pasos operativos</h2>
            <div className="mt-4 space-y-4">
              {displayStructure.steps?.map((step, index) => (
                <div key={`${step.title}-${index}`} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                    Paso {index + 1}
                  </p>
                  <h3 className="mt-1 text-sm font-semibold text-gray-900">{step.title}</h3>
                  <p className="mt-2 text-sm text-gray-600">{step.description}</p>
                  {step.evidence?.segment_range && (
                    <p className="mt-2 text-xs text-gray-400">Evidencia: {step.evidence.segment_range}</p>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">Objetivos</h2>
              <ul className="mt-4 space-y-2 text-sm text-gray-600">
                {displayStructure.objectives?.map((objective, index) => (
                  <li key={`${objective}-${index}`} className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-500" />
                    <span>{objective}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-indigo-600" />
                <h2 className="text-lg font-semibold text-gray-900">Puntos críticos</h2>
              </div>
              <div className="mt-4 space-y-3">
                {displayStructure.critical_points?.map((point, index) => (
                  <div key={`${point.text}-${index}`} className="rounded-xl bg-gray-50 p-4">
                    <p className="text-sm font-medium text-gray-900">{point.text}</p>
                    <p className="mt-1 text-sm text-gray-600">{point.why}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      ) : (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Contenido del procedimiento</h2>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-gray-600">
            {latestVersion?.content_text || "Todavía no hay un contenido estructurado disponible."}
          </p>
        </section>
      )}
    </div>
  );
}
