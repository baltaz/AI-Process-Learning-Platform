import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/services/api";
import { Search, Loader2, Clock, FileText, BarChart2 } from "lucide-react";
import { Link } from "react-router-dom";

interface SearchResult {
  training_id: string;
  training_title: string;
  snippet: string;
  start_time?: string;
  end_time?: string;
  score: number;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");

  const { data: results, isLoading } = useQuery<SearchResult[]>({
    queryKey: ["search", submitted],
    queryFn: () => api.get("/trainings/search", { params: { q: submitted } }).then((r) => r.data),
    enabled: !!submitted,
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) setSubmitted(query.trim());
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900">Búsqueda Semántica</h1>
      <p className="mt-1 text-sm text-gray-500">
        Busca contenido dentro de las capacitaciones por significado, no solo palabras exactas.
      </p>

      <form onSubmit={handleSearch} className="mt-6 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            placeholder="Ej: elaboración de chocotorta, seguridad en cocina…"
          />
        </div>
        <button
          type="submit"
          disabled={!query.trim() || isLoading}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Buscar
        </button>
      </form>

      <div className="mt-8">
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
          </div>
        )}

        {submitted && !isLoading && !results?.length && (
          <div className="rounded-xl border-2 border-dashed border-gray-200 py-14 text-center">
            <Search className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-3 text-sm text-gray-500">
              No se encontraron resultados para &ldquo;{submitted}&rdquo;
            </p>
          </div>
        )}

        {results && results.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">
              {results.length} resultado{results.length !== 1 && "s"}
            </p>
            {results.map((r, i) => (
              <Link
                key={i}
                to={`/trainings/${r.training_id}`}
                className="block rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 flex-shrink-0 text-indigo-500" />
                      <h3 className="truncate text-sm font-semibold text-gray-900">
                        {r.training_title}
                      </h3>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-gray-600">{r.snippet}</p>
                    {(r.start_time || r.end_time) && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-gray-400">
                        <Clock className="h-3 w-3" />
                        {r.start_time}
                        {r.end_time ? ` – ${r.end_time}` : ""}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
                    <BarChart2 className="h-3 w-3" />
                    {(r.score * 100).toFixed(0)}%
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
