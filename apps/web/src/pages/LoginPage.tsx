import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GitBranch, Loader2 } from "lucide-react";

import { storeAuth, type DemoRole } from "@/lib/auth";
import { demoRoleOptions, getHomePath } from "@/lib/demoAccess";
import api from "@/services/api";

export default function LoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    location: "",
    demoRole: "admin" as DemoRole,
  });
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data } = isRegister
        ? await api.post("/auth/register", {
            name: form.name,
            email: form.email,
            password: form.password,
            location: form.location || undefined,
          })
        : await api.post("/auth/login", {
            email: form.email,
            password: form.password,
          });

      storeAuth(data.access_token, data.user, form.demoRole);
      navigate(getHomePath(form.demoRole));
    } catch (err: any) {
      setError(err.response?.data?.detail ?? "No se pudo iniciar sesion");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-200">
            <GitBranch className="h-7 w-7 text-white" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">Mento</h1>
          <p className="mt-1 text-sm text-gray-500">
            {isRegister
              ? "Creá tu usuario y elegí el perfil visual de la demo"
              : "Iniciá sesión y elegí el perfil que querés visualizar en la demo"}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm"
        >
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          {isRegister && (
            <>
              <label className="mb-4 block">
                <span className="mb-1 block text-sm font-medium text-gray-700">Nombre</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="Tu nombre"
                />
              </label>

              <label className="mb-4 block">
                <span className="mb-1 block text-sm font-medium text-gray-700">Ubicación</span>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => set("location", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="Ej: Sucursal Centro"
                />
              </label>
            </>
          )}

          <label className="mb-4 block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Correo electronico</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="tu@email.com"
            />
          </label>

          <label className="mb-4 block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Contrasena</span>
            <input
              type="password"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="••••••••"
            />
          </label>

          <fieldset className="mb-6">
            <legend className="mb-3 text-sm font-medium text-gray-700">Perfil demo</legend>
            <div className="space-y-3">
              {demoRoleOptions.map((option) => {
                const selected = option.value === form.demoRole;

                return (
                  <label
                    key={option.value}
                    className={`block cursor-pointer rounded-xl border p-4 transition-colors ${
                      selected
                        ? "border-indigo-500 bg-indigo-50"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="demoRole"
                      value={option.value}
                      checked={selected}
                      onChange={(e) => set("demoRole", e.target.value)}
                      className="sr-only"
                    />
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{option.label}</p>
                        <p className="mt-1 text-sm text-gray-500">{option.description}</p>
                      </div>
                      <div
                        className={`mt-0.5 h-4 w-4 rounded-full border ${
                          selected ? "border-indigo-600 bg-indigo-600" : "border-gray-300"
                        }`}
                      />
                    </div>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {isRegister ? "Crear cuenta" : "Iniciar sesion"}
          </button>

          <p className="mt-4 text-center text-sm text-gray-500">
            {isRegister ? "¿Ya tenés cuenta?" : "¿No tenés cuenta?"}{" "}
            <button
              type="button"
              onClick={() => {
                setIsRegister((current) => !current);
                setError("");
              }}
              className="font-medium text-indigo-600 hover:text-indigo-500"
            >
              {isRegister ? "Iniciar sesión" : "Registrarse"}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
