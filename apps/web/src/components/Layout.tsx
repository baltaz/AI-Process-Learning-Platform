import { FormEvent, useEffect, useState } from "react";
import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { clearAuth, getDemoRole, getStoredUser } from "@/lib/auth";
import { getNavItemsForRole, getSecondaryActionsForRole, roleLabels } from "@/lib/demoAccess";
import {
  Search,
  GitBranch,
  LogOut,
  Menu,
  X,
} from "lucide-react";

export default function Layout() {
  const user = getStoredUser();
  const role = getDemoRole() ?? "operator";
  const navItems = getNavItemsForRole(role);
  const secondaryActions = getSecondaryActionsForRole(role);
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  useEffect(() => {
    if (!location.pathname.startsWith("/search")) {
      return;
    }

    const params = new URLSearchParams(location.search);
    setSearchValue(params.get("q") ?? "");
  }, [location.pathname, location.search]);

  function handleLogout() {
    clearAuth();
    navigate("/login");
  }

  function handleSearchSubmit(event: FormEvent) {
    event.preventDefault();
    const value = searchValue.trim();
    if (!value) return;
    navigate(`/search?q=${encodeURIComponent(value)}`);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-white border-r border-gray-200 transition-transform lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center gap-2 border-b border-gray-200 px-6">
          <GitBranch className="h-6 w-6 text-indigo-600" />
          <div className="min-w-0">
            <span className="block truncate text-lg font-bold text-gray-900">Mento</span>
            <span className="block text-xs font-medium uppercase tracking-wide text-indigo-600">
              Vista {roleLabels[role]}
            </span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`
              }
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900">
                {user?.name ?? "Usuario"}
              </p>
              <p className="truncate text-xs text-gray-500">{user?.email}</p>
              <p className="mt-1 text-xs font-medium text-indigo-600">{roleLabels[role]}</p>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              title="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center gap-4 border-b border-gray-200 bg-white px-4 lg:px-6">
          <button
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 lg:hidden"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          {role === "admin" ? (
            <form onSubmit={handleSearchSubmit} className="hidden max-w-md flex-1 lg:block">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder="Buscar procedimientos..."
                  className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
            </form>
          ) : (
            <div className="flex-1" />
          )}
          <div className="ml-auto flex items-center gap-4">
            {secondaryActions.length > 0 && (
              <div className="flex items-center gap-2">
                {secondaryActions.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      `inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-indigo-50 text-indigo-700"
                          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      }`
                    }
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{label}</span>
                  </NavLink>
                ))}
              </div>
            )}
            <div className="text-right">
              <span className="block text-sm text-gray-600">
                Hola, <span className="font-medium text-gray-900">{user?.name ?? "Usuario"}</span>
              </span>
              <span className="block text-xs font-medium uppercase tracking-wide text-indigo-600">
                {roleLabels[role]}
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
