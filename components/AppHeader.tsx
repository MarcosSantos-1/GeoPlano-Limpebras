"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import clsx from "clsx";
import gsap from "gsap";
import { ThemeToggle } from "@/components/ThemeToggle";

const MENU_ITEMS = [
  {
    href: "/map" as const,
    icon: "fa-solid fa-map",
    label: "Mapa Interativo",
  },
  {
    href: "/acompanhamento" as const,
    icon: "fa-solid fa-list-check",
    label: "Acompanhamento de execução",
  },
  {
    href: "/aguardando-analise" as const,
    icon: "fa-solid fa-hourglass-half",
    label: "Aguardando Análise",
  },
];

function AppMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<(HTMLAnchorElement | null)[]>([]);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const hasOpenedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    gsap.set(panel, { display: "none", autoAlpha: 0, pointerEvents: "none" });
  }, []);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const items = itemsRef.current.filter(Boolean) as HTMLAnchorElement[];
    if (!panel) return;

    timelineRef.current?.kill();

    if (open) {
      hasOpenedRef.current = true;
      gsap.set(panel, { display: "block", pointerEvents: "auto" });
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.fromTo(
        panel,
        { autoAlpha: 0, y: -10, scale: 0.94, transformOrigin: "top right" },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.32 },
      ).fromTo(
        items,
        { autoAlpha: 0, x: 14, filter: "blur(4px)" },
        {
          autoAlpha: 1,
          x: 0,
          filter: "blur(0px)",
          duration: 0.28,
          stagger: 0.055,
          ease: "power2.out",
        },
        "-=0.16",
      );
      timelineRef.current = tl;
      return;
    }

    // Evita animar o fechamento no mount inicial
    if (!hasOpenedRef.current) return;

    // Orchestrated easeReverse no fechamento
    const tl = gsap.timeline({
      defaults: { ease: "power3.inOut" },
      onComplete: () => {
        gsap.set(panel, { display: "none", pointerEvents: "none" });
      },
    });
    tl.to(items, {
      autoAlpha: 0,
      x: 10,
      filter: "blur(3px)",
      duration: 0.18,
      stagger: { each: 0.04, from: "end" },
      ease: "power2.in",
    }).to(
      panel,
      { autoAlpha: 0, y: -8, scale: 0.94, duration: 0.22, ease: "power3.in" },
      "-=0.08",
    );
    timelineRef.current = tl;
  }, [open]);

  return (
    <div ref={rootRef} className="relative z-[5200]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 items-center gap-2 rounded-full border border-zinc-300/70 bg-white/50 px-4 text-sm font-semibold text-zinc-800 shadow-sm backdrop-blur-md transition hover:scale-[1.02] hover:border-sky-300 hover:bg-white/80 dark:border-zinc-600/70 dark:bg-zinc-900/40 dark:text-zinc-100 dark:hover:border-sky-500 dark:hover:bg-zinc-900/70"
        aria-expanded={open}
      >
        <i className="fa-solid fa-map-location-dot text-sky-600 dark:text-sky-300" aria-hidden />
        <span>Mapa</span>
        <i
          className={clsx(
            "fa-solid fa-chevron-down text-[11px] text-zinc-500 transition-transform duration-300",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      <div
        ref={panelRef}
        className="absolute right-0 top-full z-[5300] mt-2 w-64 overflow-hidden rounded-2xl border border-white/50 bg-white/70 p-2 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-zinc-950/75"
      >
        {MENU_ITEMS.map((item, index) => (
          <Link
            key={item.href}
            href={item.href}
            ref={(node) => {
              itemsRef.current[index] = node;
            }}
            onClick={() => setOpen(false)}
            className={clsx(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-800 transition hover:bg-sky-50/80 dark:text-zinc-100 dark:hover:bg-sky-500/10",
              index > 0 && "mt-1",
            )}
          >
            <i className={clsx(item.icon, "text-sky-600 dark:text-sky-300")} aria-hidden />
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function AppHeader({ compact = false }: { compact?: boolean }) {
  return (
    <header
      className={clsx(
        "relative z-[5100] mx-auto flex w-full max-w-6xl items-center justify-between px-5 sm:px-8",
        compact ? "py-4" : "py-5",
      )}
    >
      <Link
        href="/"
        className="group flex items-center gap-3 text-sm font-bold uppercase tracking-wide text-zinc-700 transition hover:text-sky-700 dark:text-zinc-200 dark:hover:text-sky-300"
      >
        <Image
          src="/GeoPlano_logo.png"
          alt="GeoPlano"
          width={36}
          height={36}
          className="h-9 w-9 object-contain transition group-hover:scale-105"
        />
        <span className="hidden sm:inline">GeoPlano</span>
      </Link>
      <div className="relative z-[5200] flex items-center gap-2">
        <ThemeToggle />
        <AppMenu />
      </div>
    </header>
  );
}
