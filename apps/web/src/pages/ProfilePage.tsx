import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Mail, MapPin, UserCircle2 } from "lucide-react";

import { getStoredUser } from "@/lib/auth";
import { roleLabels } from "@/lib/demoAccess";
import api from "@/services/api";

interface UserRoleAssignment {
  id: string;
  status: string;
  role: {
    id: string;
    name: string;
  };
}

interface ProfileUser {
  id: string;
  role_assignments: UserRoleAssignment[];
}

export default function ProfilePage() {
  const user = getStoredUser();
  const { data: profileUser } = useQuery<ProfileUser>({
    queryKey: ["profile-user", user?.id],
    queryFn: () => api.get(`/users/${user?.id}`).then((r) => r.data),
    enabled: !!user?.id,
  });

  if (!user) {
    return null;
  }

  const activeRoles = profileUser?.role_assignments.filter((assignment) => assignment.status === "active") ?? [];
  const roleText = activeRoles.length
    ? activeRoles.map((assignment) => assignment.role.name).join(", ")
    : "Sin rol asignado";

  return (
    <div className="mx-auto max-w-5xl space-y-6 pt-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mi perfil</h1>
        <p className="mt-1 text-sm text-gray-500">
          Datos de la sesión actual y contexto de navegación de la demo.
        </p>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
            <UserCircle2 className="h-8 w-8" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-gray-900">{user.name}</h2>
            <p className="mt-1 text-sm text-gray-500">
              Vista actual: <span className="font-medium text-indigo-700">{roleLabels[user.demoRole]}</span>
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl bg-gray-50 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Mail className="h-4 w-4 text-gray-400" />
              Correo electrónico
            </div>
            <p className="mt-2 text-sm text-gray-900">{user.email}</p>
          </div>

          <div className="rounded-xl bg-gray-50 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <UserCircle2 className="h-4 w-4 text-gray-400" />
              Rol
            </div>
            <p className="mt-2 text-sm text-gray-900">{roleText}</p>
          </div>

          <div className="rounded-xl bg-gray-50 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <MapPin className="h-4 w-4 text-gray-400" />
              Ubicación
            </div>
            <p className="mt-2 text-sm text-gray-900">{user.location || "No informada"}</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5">
        <div className="flex items-start gap-3">
          <BadgeCheck className="mt-0.5 h-5 w-5 text-indigo-600" />
          <div>
            <h3 className="text-sm font-semibold text-indigo-900">Sesión y experiencia</h3>
            <p className="mt-1 text-sm text-indigo-800">
              El usuario autenticado es real, pero la experiencia visual depende del perfil demo
              seleccionado al iniciar sesión.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
