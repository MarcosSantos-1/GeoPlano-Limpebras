import { ThemeToggle } from "@/components/ThemeToggle";
import { loadFeatureData } from "@/lib/data";
import dynamicImport from "next/dynamic";

// Carrega MapView apenas no cliente (Leaflet não funciona no servidor)
const MapView = dynamicImport(
  () => import("@/components/MapView").then((mod) => mod.MapView),
  {
    ssr: false,
    // Não mostra loading se os dados já estão disponíveis
    loading: () => null,
  }
);

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  // Carrega dados no servidor para já vir no HTML inicial
  const initialData = await loadFeatureData();
  return (
    <main className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white dark:bg-slate-900">
      <header className="mx-auto w-full max-w-5xl space-y-2 bg-white px-6 py-8 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              aria-label="Voltar"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                <path d="m12 19-7-7 7-7" />
                <path d="M19 12H5" />
              </svg>
            </button>
            <p className="text-xs font-bold uppercase tracking-widest text-primary dark:text-blue-400">
              Plano de Trabalho - LIMPEBRAS
            </p>
          </div>
          <ThemeToggle />
        </div>
        <h1 className="text-3xl font-semibold text-slate-900 dark:text-slate-100">
          Visualize o Plano de Trabalho em um Mapa Interativo
        </h1>
        <p className="max-w-3xl text-sm text-slate-600 dark:text-slate-400">
          Use o mapa para ativar camadas específicas, pesquisar endereços e
          explorar cada área com os detalhes completos do cronograma.
        </p>
      </header>

            <div className="flex flex-1 bg-white dark:bg-slate-900">
              <MapView data={initialData} />
            </div>
    </main>
  );
}
