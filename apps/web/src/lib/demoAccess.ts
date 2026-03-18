import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  CircleUserRound,
  GitBranch,
  House,
  Search,
  Users,
} from "lucide-react";

import type { DemoRole } from "./auth";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: DemoRole[];
}

export interface SecondaryAction {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const roleLabels: Record<DemoRole, string> = {
  admin: "Administrador",
  operator: "Operador",
};

export const demoRoleOptions: Array<{ value: DemoRole; label: string; description: string }> = [
  {
    value: "admin",
    label: "Administrador",
    description: "Vista completa con acceso a la navegacion ejecutiva y de configuracion.",
  },
  {
    value: "operator",
    label: "Operador",
    description: "Vista operativa enfocada en ejecucion, seguimiento e incidentes.",
  },
];

const navItems: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: BarChart3, roles: ["admin"] },
  { to: "/home", label: "Home", icon: House, roles: ["operator"] },
  { to: "/procedures", label: "Procedimientos", icon: GitBranch, roles: ["admin", "operator"] },
  { to: "/roles", label: "Roles", icon: BriefcaseBusiness, roles: ["admin"] },
  { to: "/users", label: "Usuarios", icon: Users, roles: ["admin"] },
  { to: "/incidents", label: "Incidentes", icon: AlertTriangle, roles: ["admin", "operator"] },
  { to: "/trainings", label: "Trainings", icon: BookOpen, roles: ["operator"] },
];

const secondaryActionsByRole: Partial<Record<DemoRole, SecondaryAction[]>> = {
  admin: [{ to: "/profile", label: "Perfil", icon: CircleUserRound }],
  operator: [
    { to: "/search", label: "Búsqueda", icon: Search },
    { to: "/profile", label: "Perfil", icon: CircleUserRound },
  ],
};

export function getNavItemsForRole(role: DemoRole) {
  return navItems.filter((item) => item.roles.includes(role));
}

export function getSecondaryActionsForRole(role: DemoRole) {
  return secondaryActionsByRole[role] ?? [];
}

export function getHomePath(role: DemoRole | null | undefined) {
  return role === "admin" ? "/dashboard" : "/home";
}
