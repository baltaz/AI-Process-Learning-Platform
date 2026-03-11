import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { storeAuth } from "@/lib/auth";
import api from "@/services/api";
import { BookOpen, Loader2 } from "lucide-react";

export default function LoginPage() {
  const navigate = useNavigate();
  const [isRegister, setIsRegister] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "", location: "" });
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
      if (isRegister) {
        const { data } = await api.post("/auth/register", {
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role || undefined,
          location: form.location || undefined,
        });
        storeAuth(data.access_token, data.user);
      } else {
        const { data } = await api.post("/auth/login", {
          email: form.email,
          password: form.password,
        });
        storeAuth(data.access_token, data.user);
      }
      navigate("/trainings");
    } catch (err: any) {
      setError(err.response?.data?.detail ?? "Error al conectar con el servidor");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-200">
            <BookOpen className="h-7 w-7 text-white" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">MiniTraining AI</h1>
          <p className="mt-1 text-sm text-gray-500">
            {isRegister ? "Crea tu cuenta para comenzar" : "Inicia sesión en tu cuenta"}
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
                  required
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="Tu nombre completo"
                />
              </label>
              <label className="mb-4 block">
                <span className="mb-1 block text-sm font-medium text-gray-700">Rol</span>
                <input
                  type="text"
                  value={form.role}
                  onChange={(e) => set("role", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="Ej: Cocina, Operaciones"
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
            <span className="mb-1 block text-sm font-medium text-gray-700">Correo electrónico</span>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="tu@email.com"
            />
          </label>

          <label className="mb-6 block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Contraseña</span>
            <input
              type="password"
              required
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="••••••••"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {isRegister ? "Crear cuenta" : "Iniciar sesión"}
          </button>

          <p className="mt-4 text-center text-sm text-gray-500">
            {isRegister ? "¿Ya tienes cuenta?" : "¿No tienes cuenta?"}{" "}
            <button
              type="button"
              onClick={() => {
                setIsRegister(!isRegister);
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
