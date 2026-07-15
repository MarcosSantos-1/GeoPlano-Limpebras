"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ThemeToggle } from "@/components/ThemeToggle";

function AppMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 items-center gap-2 rounded-full border border-zinc-300/80 bg-white/90 px-4 text-sm font-semibold text-zinc-800 shadow-sm backdrop-blur transition hover:scale-[1.02] hover:border-sky-300 hover:bg-sky-50 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-100 dark:hover:border-sky-500 dark:hover:bg-zinc-800"
        aria-expanded={open}
      >
        <i className="fa-solid fa-map-location-dot text-sky-600 dark:text-sky-300" aria-hidden />
        <span>Mapa</span>
        <i className={clsx("fa-solid fa-chevron-down text-[11px] text-zinc-500 transition", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-zinc-200/80 bg-white/95 p-2 shadow-xl backdrop-blur-md dark:border-zinc-700 dark:bg-zinc-950/95">
          <Link
            href="/map"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-800 transition hover:translate-x-0.5 hover:bg-sky-50 dark:text-zinc-100 dark:hover:bg-sky-500/10"
          >
            <i className="fa-solid fa-map text-sky-600 dark:text-sky-300" aria-hidden />
            Mapa Interativo
          </Link>
          <Link
            href="/acompanhamento"
            className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-zinc-800 transition hover:translate-x-0.5 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            <i className="fa-solid fa-list-check" aria-hidden />
            Acompanhamento de execução
          </Link>
          <Link
            href="/aguardando-analise"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-zinc-800 transition hover:translate-x-0.5 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            <i className="fa-solid fa-hourglass-half" aria-hidden />
            Aguardando Análise
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function AppHeader({ compact = false }: { compact?: boolean }) {
  return (
    <header className={clsx("mx-auto flex w-full max-w-6xl items-center justify-between px-5 sm:px-8", compact ? "py-4" : "py-5")}>
      <Link
        href="/"
        className="group flex items-center gap-3 text-sm font-bold uppercase tracking-wide text-zinc-700 transition hover:text-sky-700 dark:text-zinc-200 dark:hover:text-sky-300"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/90 p-1.5 shadow-sm ring-1 ring-zinc-200 backdrop-blur transition group-hover:scale-105 group-hover:ring-sky-300 dark:bg-zinc-800/90 dark:ring-zinc-700 dark:group-hover:ring-sky-500">
          <Image src="/GeoPlano_logo.png" alt="" width={28} height={28} className="h-7 w-7 object-contain" />
        </span>
        <span className="hidden sm:inline">GeoPlano</span>
      </Link>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <AppMenu />
      </div>
    </header>
  );
}
