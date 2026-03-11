import { useQuery } from "@tanstack/react-query";
import api from "@/services/api";
import {
  BookOpen,
  CheckCircle2,
  BarChart3,
  AlertTriangle,
  Loader2,
  TrendingUp,
} from "lucide-react";

interface DashboardData {
  total_trainings: number;
  completion_rate: number;
  average_score: number;
  overdue_count: number;
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
      label: "Total Capacitaciones",
      value: data?.total_trainings ?? 0,
      icon: BookOpen,
      color: "bg-indigo-50 text-indigo-600",
      ring: "ring-indigo-500/20",
    },
    {
      label: "Tasa de Finalización",
      value: `${(data?.completion_rate ?? 0).toFixed(0)}%`,
      icon: CheckCircle2,
      color: "bg-green-50 text-green-600",
      ring: "ring-green-500/20",
    },
    {
      label: "Puntaje Promedio",
      value: `${(data?.average_score ?? 0).toFixed(0)}%`,
      icon: TrendingUp,
      color: "bg-blue-50 text-blue-600",
      ring: "ring-blue-500/20",
    },
    {
      label: "Asignaciones Vencidas",
      value: data?.overdue_count ?? 0,
      icon: AlertTriangle,
      color: "bg-red-50 text-red-600",
      ring: "ring-red-500/20",
    },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Resumen general de las capacitaciones y asignaciones
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
          <span className="font-medium text-gray-700">{data?.total_trainings ?? 0}</span>{" "}
          capacitaciones creadas. La tasa de finalización es del{" "}
          <span className="font-medium text-gray-700">
            {(data?.completion_rate ?? 0).toFixed(0)}%
          </span>{" "}
          con un puntaje promedio de{" "}
          <span className="font-medium text-gray-700">
            {(data?.average_score ?? 0).toFixed(0)}%
          </span>
          .
          {(data?.overdue_count ?? 0) > 0 && (
            <span className="text-red-600">
              {" "}
              Hay {data?.overdue_count} asignaciones vencidas que requieren atención.
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
