import Link from "next/link";
import { MapView } from "@/components/MapView";
import { ThemeToggle } from "@/components/ThemeToggle";
import { loadFeatureData } from "@/lib/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MapPage() {
  const initialData = await loadFeatureData();
  return (
    <main className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white dark:bg-zinc-900">
      <header className="mx-auto w-full max-w-5xl space-y-2 bg-white px-6 py-8 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              aria-label="Abrir inicio"
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
                <path d="M3 10.5 12 3l9 7.5" />
                <path d="M5 10v10h14V10" />
                <path d="M9 20v-6h6v6" />
              </svg>
            </Link>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary dark:text-blue-400">
              <i
                className="fa-solid fa-map text-[15px] leading-none opacity-90"
                aria-hidden
              />
              <span>Plano de Trabalho - LIMPEBRAS</span>
            </p>
          </div>
          <ThemeToggle />
        </div>
        <h1 className="text-3xl font-semibold text-slate-900 dark:text-slate-100">
          Visualize o Plano de Trabalho em um Mapa Interativo
        </h1>
        <p className="max-w-5xl text-sm text-slate-600 dark:text-slate-400">
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
