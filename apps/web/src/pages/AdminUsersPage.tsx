import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Loader2, Mail, MapPin, Plus, Users } from "lucide-react";
import { Link } from "react-router-dom";

import api from "@/services/api";

interface UserRoleAssignment {
  id: string;
  role: {
    id: string;
    code: string;
    name: string;
  };
}

interface UserRecord {
  id: string;
  name: string;
  email: string;
  location: string | null;
  created_at: string;
  role_assignments: UserRoleAssignment[];
}

export default function AdminUsersPage() {
  const { data: users, isLoading } = useQuery<UserRecord[]>({
    queryKey: ["users"],
    queryFn: () => api.get("/users").then((r) => r.data),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usuarios</h1>
          <p className="mt-1 text-sm text-gray-500">
            Administrá usuarios, sus datos base y las asignaciones de rol activas.
          </p>
        </div>
        <Link
          to="/users/new"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Nuevo usuario
        </Link>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      ) : !users?.length ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 py-16 text-center">
          <Users className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm font-medium text-gray-600">No hay usuarios registrados</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {users.map((user) => (
            <Link
              key={user.id}
              to={`/users/${user.id}`}
              className="rounded-2xl border border-gray-200 bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-gray-900">{user.name}</h2>
                  <p className="mt-1 flex items-center gap-2 text-sm text-gray-500">
                    <Mail className="h-4 w-4 text-gray-400" />
                    <span className="truncate">{user.email}</span>
                  </p>
                </div>
                <ArrowRight className="h-5 w-5 flex-shrink-0 text-gray-300" />
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1">
                  <MapPin className="h-3 w-3" />
                  {user.location || "Sin ubicación"}
                </span>
                <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-indigo-700">
                  {user.role_assignments.length} roles
                </span>
              </div>

              {user.role_assignments.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {user.role_assignments.slice(0, 3).map((assignment) => (
                    <span
                      key={assignment.id}
                      className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                    >
                      {assignment.role.name}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
