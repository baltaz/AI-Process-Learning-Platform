import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import Layout from "./components/Layout";
import { getDemoRole, isAuthenticated, type DemoRole } from "./lib/auth";
import { getHomePath } from "./lib/demoAccess";
import AdminIncidentsPage from "./pages/AdminIncidentsPage";
import AdminRolesPage from "./pages/AdminRolesPage";
import AdminUsersPage from "./pages/AdminUsersPage";
import AssignmentsPage from "./pages/AssignmentsPage";
import ChangeEventsPage from "./pages/ChangeEventsPage";
import CompliancePage from "./pages/CompliancePage";
import DashboardPage from "./pages/DashboardPage";
import DevSeedPage from "./pages/DevSeedPage";
import IncidentDetailPage from "./pages/IncidentDetailPage";
import LoginPage from "./pages/LoginPage";
import OperatorHomePage from "./pages/OperatorHomePage";
import OperatorIncidentDetailPage from "./pages/OperatorIncidentDetailPage";
import OperatorIncidentsPage from "./pages/OperatorIncidentsPage";
import OperatorProcedureDetailPage from "./pages/OperatorProcedureDetailPage";
import OperatorProceduresPage from "./pages/OperatorProceduresPage";
import OperatorTrainingPage from "./pages/OperatorTrainingPage";
import OperatorTrainingsPage from "./pages/OperatorTrainingsPage";
import ProcedureCreatePage from "./pages/ProcedureCreatePage";
import ProcedureDetailPage from "./pages/ProcedureDetailPage";
import ProcedureUpdatePage from "./pages/ProcedureUpdatePage";
import ProceduresPage from "./pages/ProceduresPage";
import ProfilePage from "./pages/ProfilePage";
import RoleDetailPage from "./pages/RoleDetailPage";
import SearchPage from "./pages/SearchPage";
import TrainingBuilderPage from "./pages/TrainingBuilderPage";
import TrainingsPage from "./pages/TrainingsPage";
import UserDetailPage from "./pages/UserDetailPage";

interface AppRoute {
  path: string;
  element: ReactNode;
}

const appRoutesByRole: Record<DemoRole, AppRoute[]> = {
  admin: [
    { path: "dashboard", element: <DashboardPage /> },
    { path: "users", element: <AdminUsersPage /> },
    { path: "users/new", element: <UserDetailPage /> },
    { path: "users/:id", element: <UserDetailPage /> },
    { path: "roles", element: <AdminRolesPage /> },
    { path: "roles/:id", element: <RoleDetailPage /> },
    { path: "procedures", element: <ProceduresPage /> },
    { path: "procedures/new", element: <ProcedureCreatePage /> },
    { path: "procedures/:id", element: <ProcedureDetailPage /> },
    { path: "procedures/:id/update", element: <ProcedureUpdatePage /> },
    { path: "incidents", element: <AdminIncidentsPage /> },
    { path: "incidents/new", element: <IncidentDetailPage /> },
    { path: "incidents/:id", element: <IncidentDetailPage /> },
    { path: "search", element: <SearchPage /> },
    { path: "profile", element: <ProfilePage /> },
    { path: "compliance", element: <CompliancePage /> },
    { path: "change-events", element: <ChangeEventsPage /> },
    { path: "trainings", element: <TrainingsPage /> },
    { path: "trainings/:id", element: <TrainingBuilderPage /> },
    { path: "assignments", element: <AssignmentsPage /> },
    { path: "dev/seed", element: <DevSeedPage /> },
  ],
  operator: [
    { path: "home", element: <OperatorHomePage /> },
    { path: "procedures", element: <OperatorProceduresPage /> },
    { path: "procedures/:id", element: <OperatorProcedureDetailPage /> },
    { path: "trainings", element: <OperatorTrainingsPage /> },
    { path: "trainings/:id", element: <OperatorTrainingPage /> },
    { path: "incidents", element: <OperatorIncidentsPage /> },
    { path: "incidents/:id", element: <OperatorIncidentDetailPage /> },
    { path: "search", element: <SearchPage /> },
    { path: "profile", element: <ProfilePage /> },
  ],
};

function ProtectedRoute({ children }: { children: ReactNode }) {
  return isAuthenticated() ? <>{children}</> : <Navigate to="/login" replace />;
}

function LoginRoute() {
  if (!isAuthenticated()) {
    return <LoginPage />;
  }

  return <Navigate to={getHomePath(getDemoRole())} replace />;
}

function AppIndexRedirect() {
  return <Navigate to={getHomePath(getDemoRole())} replace />;
}

function ProtectedFallback() {
  return <Navigate to={getHomePath(getDemoRole())} replace />;
}

export default function App() {
  const location = useLocation();
  const role = getDemoRole();
  const availableRoutes = role ? appRoutesByRole[role] : [];

  return (
    <Routes location={location}>
      <Route path="/login" element={<LoginRoute />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AppIndexRedirect />} />
        {availableRoutes.map((route) => (
          <Route key={route.path} path={route.path} element={route.element} />
        ))}
        <Route path="*" element={<ProtectedFallback />} />
      </Route>
      <Route
        path="*"
        element={<Navigate to={isAuthenticated() ? getHomePath(getDemoRole()) : "/login"} replace />}
      />
    </Routes>
  );
}
