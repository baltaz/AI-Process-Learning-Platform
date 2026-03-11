import { Routes, Route, Navigate } from "react-router-dom";
import { isAuthenticated } from "./lib/auth";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import TrainingsPage from "./pages/TrainingsPage";
import TrainingBuilderPage from "./pages/TrainingBuilderPage";
import SearchPage from "./pages/SearchPage";
import AssignmentsPage from "./pages/AssignmentsPage";
import DashboardPage from "./pages/DashboardPage";
import IncidentsPage from "./pages/IncidentsPage";
import TasksPage from "./pages/TasksPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return isAuthenticated() ? <>{children}</> : <Navigate to="/login" />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/trainings" />} />
        <Route path="trainings" element={<TrainingsPage />} />
        <Route path="trainings/new" element={<TrainingBuilderPage />} />
        <Route path="trainings/:id" element={<TrainingBuilderPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="assignments" element={<AssignmentsPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="incidents" element={<IncidentsPage />} />
        <Route path="tasks" element={<TasksPage />} />
      </Route>
    </Routes>
  );
}
