import { useQuery } from "@tanstack/react-query";
import api from "@/services/api";
import {
  BookOpen,
  CheckCircle2,
  BarChart3,
  AlertTriangle,
  Loader2,
  TrendingUp,
  GitBranch,
  BriefcaseBusiness,
  ShieldAlert,
  Radar,
  ArrowRight,
  Plus,
} from "lucide-react";
import { Link } from "react-router-dom";

interface DashboardData {
  total_trainings: number;
  total_procedures: number;
  total_roles: number;
  completion_rate: number;
  average_score: number;
  overdue_count: number;
  compliance_gap_count: number;
  open_change_events: number;
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: () => api.get("/dashboard").then((r) => r.data),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  const stats = [
    {
      label: "Procedimientos",
      value: data?.total_procedures ?? 0,
      icon: GitBranch,
      color: "bg-indigo-50 text-indigo-600",
      ring: "ring-indigo-500/20",
    },
    {
      label: "Roles activos",
      value: data?.total_roles ?? 0,
      icon: BriefcaseBusiness,
      color: "bg-sky-50 text-sky-600",
      ring: "ring-sky-500/20",
    },
    {
      label: "Trainings",
      value: data?.total_trainings ?? 0,
      icon: BookOpen,
      color: "bg-blue-50 text-blue-600",
      ring: "ring-blue-500/20",
    },
    {
      label: "Cumplimiento",
      value: `${(data?.completion_rate ?? 0).toFixed(0)}%`,
      icon: CheckCircle2,
      color: "bg-green-50 text-green-600",
      ring: "ring-green-500/20",
    },
    {
      label: "Brechas de compliance",
      value: data?.compliance_gap_count ?? 0,
      icon: ShieldAlert,
      color: "bg-amber-50 text-amber-600",
      ring: "ring-amber-500/20",
    },
    {
      label: "Asignaciones Vencidas",
      value: data?.overdue_count ?? 0,
      icon: AlertTriangle,
      color: "bg-red-50 text-red-600",
      ring: "ring-red-500/20",
    },
    {
      label: "Change Events abiertos",
      value: data?.open_change_events ?? 0,
      icon: Radar,
      color: "bg-fuchsia-50 text-fuchsia-600",
      ring: "ring-fuchsia-500/20",
    },
    {
      label: "Puntaje Promedio",
      value: `${(data?.average_score ?? 0).toFixed(0)}%`,
      icon: TrendingUp,
      color: "bg-emerald-50 text-emerald-600",
      ring: "ring-emerald-500/20",
    },
  ];

  const sections = [
    {
      title: "Usuarios",
      description: "Gestioná perfiles, ubicaciones y roles asignados.",
      to: "/users",
      createTo: "/users/new",
    },
    {
      title: "Roles",
      description: "Definí responsabilidades y vinculá procedimientos.",
      to: "/roles",
      createTo: "/roles",
    },
    {
      title: "Procedimientos",
      description: "Mantené la biblioteca operativa y sus versiones.",
      to: "/procedures",
      createTo: "/procedures/new",
    },
    {
      title: "Incidencias",
      description: "Consultá eventos registrados y abrí nuevos casos.",
      to: "/incidents",
      createTo: "/incidents/new",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Vista ejecutiva del entorno admin con accesos rápidos a las entidades principales.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.color} ring-4 ${s.ring}`}
                >
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-4 text-2xl font-bold text-gray-900">{s.value}</p>
              <p className="mt-1 text-sm text-gray-500">{s.label}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-10 rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2 text-gray-900">
          <BarChart3 className="h-5 w-5 text-indigo-600" />
          <h2 className="text-lg font-semibold">Resumen</h2>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          El sistema cuenta con{" "}
          <span className="font-medium text-gray-700">{data?.total_procedures ?? 0}</span>{" "}
          procedimientos,{" "}
          <span className="font-medium text-gray-700">{data?.total_roles ?? 0}</span> roles y{" "}
          <span className="font-medium text-gray-700">{data?.total_trainings ?? 0}</span> trainings
          derivados. La tasa de cumplimiento es del{" "}
          <span className="font-medium text-gray-700">
            {(data?.completion_rate ?? 0).toFixed(0)}%
          </span>{" "}
          con un puntaje promedio de{" "}
          <span className="font-medium text-gray-700">
            {(data?.average_score ?? 0).toFixed(0)}%
          </span>
          . Hay{" "}
          <span className="font-medium text-gray-700">{data?.open_change_events ?? 0}</span>{" "}
          change events abiertos y{" "}
          <span className="font-medium text-gray-700">{data?.compliance_gap_count ?? 0}</span>{" "}
          brechas de compliance detectadas.
          {(data?.overdue_count ?? 0) > 0 && (
            <span className="text-red-600">
              {" "}
              Hay {data?.overdue_count} asignaciones vencidas que requieren atención.
            </span>
          )}
        </p>
      </div>

      <div className="mt-10 grid gap-4 lg:grid-cols-2">
        {sections.map((section) => (
          <div key={section.title} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900">{section.title}</h3>
            <p className="mt-2 text-sm text-gray-500">{section.description}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                to={section.to}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <ArrowRight className="h-4 w-4" />
                Ver listado
              </Link>
              <Link
                to={section.createTo}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                <Plus className="h-4 w-4" />
                Crear
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
