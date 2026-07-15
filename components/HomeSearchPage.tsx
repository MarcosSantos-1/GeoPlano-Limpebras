"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import { AppHeader } from "@/components/AppHeader";
import { LoadingShimmerText } from "@/components/ui/loading-shimmer-text";
import { MagicCard } from "@/components/ui/magic-card";
import { Particles } from "@/components/ui/particles";
import { OVERLAPPING_LINE_PICK_METERS } from "@/lib/polylineDistance";
import { parseFeaturesJson } from "@/lib/parseFeaturesJson";
import {
  findNearestFeatureAtPoint,
  formatDateShort,
  isFeatureAtPoint,
  nextScheduleDateForFeature,
  parseScheduleDates,
  pickDatesAroundToday,
} from "@/lib/serviceSchedule";
import type { FeatureRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

type SearchSuggestion = {
  logradouro: string;
  name: string;
  setor: string;
  subprefeitura?: string | null;
  centroid?: [number, number];
  placeId?: string;
  source?: "local" | "google" | "google_geocode";
};

type SelectedAddress = {
  label: string;
  coords: [number, number];
  subprefeitura?: string | null;
};

type ServiceKey = "GO" | "MT" | "BL" | "VJ_VL";

const TARGET_SERVICES: ServiceKey[] = ["GO", "MT", "BL", "VJ_VL"];
const SERVICE_TITLES: Record<ServiceKey, string> = {
  GO: "Cata-Bagulho",
  MT: "Mutirão",
  BL: "Limpeza de Bueiros",
  VJ_VL: "Varrição Manual",
};
const SERVICE_ICON_ACCENTS: Record<ServiceKey, string> = {
  GO: "text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-500/10",
  MT: "text-sky-700 bg-sky-50 dark:text-sky-300 dark:bg-sky-500/10",
  BL: "text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-500/10",
  VJ_VL: "text-violet-700 bg-violet-50 dark:text-violet-300 dark:bg-violet-500/10",
};
const SERVICE_ICONS: Record<ServiceKey, string> = {
  GO: "fa-solid fa-couch",
  MT: "fa-solid fa-screwdriver-wrench",
  BL: "fa-solid fa-water",
  VJ_VL: "fa-solid fa-broom",
};
const SERVICE_GRADIENTS: Record<ServiceKey, { from: string; to: string; glow: string }> = {
  GO: { from: "#34d399", to: "#059669", glow: "#064e3b33" },
  MT: { from: "#38bdf8", to: "#2563eb", glow: "#0c4a6e33" },
  BL: { from: "#fbbf24", to: "#d97706", glow: "#78350f33" },
  VJ_VL: { from: "#a78bfa", to: "#7c3aed", glow: "#4c1d9533" },
};

function expandFrequency(value: string): string {
  const dayNames: Record<string, string> = {
    D: "Domingo",
    S: "Sábado",
    T: "Terça",
    Q: "Quarta",
    X: "Quinta",
    F: "Sexta",
    A: "Sábado",
  };
  return value.replace(/\b[DSTQXFA]{2,}\b/g, (match) => {
    if (!/^[DSTQXFA]+$/.test(match)) return match;
    const days = Array.from(match).map((letter) => dayNames[letter]).filter(Boolean);
    if (days.length < 2) return match;
    if (days.length === 2) return `${days[0]} e ${days[1]}`;
    return `${days.slice(0, -1).join(", ")} e ${days[days.length - 1]}`;
  });
}

function describeAddress(source: SearchSuggestion): string {
  if (source.subprefeitura) return `${source.logradouro} - ${source.subprefeitura}`;
  return source.logradouro;
}

async function searchNominatim(query: string): Promise<SearchSuggestion[]> {
  try {
    const params = new URLSearchParams({
      format: "json",
      q: `${query}, Sao Paulo, Brasil`,
      limit: "5",
      addressdetails: "0",
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { "Accept-Language": "pt-BR" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const results: Array<{ lat: string; lon: string; display_name?: string }> = await response.json();
    return results.map((result) => ({
      logradouro: result.display_name || query,
      centroid: [Number(result.lat), Number(result.lon)] as [number, number],
      setor: "",
      name: result.display_name || query,
      subprefeitura: null,
      source: "local" as const,
    }));
  } catch {
    return [];
  }
}

function PageCard({
  title,
  description,
  icon,
  href,
  disabled,
  delay = 0,
}: {
  title: string;
  description: string;
  icon: string;
  href?: "/" | "/home" | "/map" | "/acompanhamento" | "/aguardando-analise";
  disabled?: boolean;
  delay?: number;
}) {
  const content = (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      <MagicCard
        className="rounded-xl"
        gradientFrom="#38bdf8"
        gradientTo="#818cf8"
        gradientColor="#0ea5e933"
        gradientOpacity={0.55}
      >
        <div
          className={cn(
            "flex min-h-[150px] flex-col justify-between p-5 text-left",
            disabled && "opacity-70",
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-zinc-950 dark:text-white">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{description}</p>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200/80 bg-sky-50 text-sky-600 transition group-hover:scale-110 dark:border-zinc-700 dark:bg-sky-500/10 dark:text-sky-300">
              <i className={icon} aria-hidden />
            </span>
          </div>
          <div className="mt-5 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-zinc-500 transition group-hover:text-sky-600 dark:text-zinc-400 dark:group-hover:text-sky-300">
            <span>{disabled ? "Em breve" : "Abrir"}</span>
            <i className="fa-solid fa-arrow-right text-[11px] transition group-hover:translate-x-0.5" aria-hidden />
          </div>
        </div>
      </MagicCard>
    </motion.div>
  );
  if (href && !disabled) return <Link href={href}>{content}</Link>;
  return content;
}

function ScheduleCard({
  service,
  features,
  delay = 0,
}: {
  service: ServiceKey;
  features: FeatureRecord[];
  delay?: number;
}) {
  const primary = features[0];
  const isVarricao = service === "VJ_VL";
  const nextSchedule = primary && isVarricao ? nextScheduleDateForFeature(primary, service) : null;
  const scheduleDates = nextSchedule?.dates ?? [];
  const dateSlots = useMemo(() => {
    if (!primary || isVarricao) return [];
    return pickDatesAroundToday(parseScheduleDates(primary.cronograma), 2, 2);
  }, [primary, isVarricao]);
  const uniqueFrequencies = Array.from(
    new Set(features.map((feature) => feature.frequencia).filter(Boolean) as string[]),
  ).map(expandFrequency);
  const uniqueSectors = Array.from(new Set(features.map((feature) => feature.setor).filter(Boolean)));
  const uniqueDays = Array.from(new Set(features.map((feature) => feature.cronograma).filter(Boolean) as string[]));
  const gradient = SERVICE_GRADIENTS[service];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      <MagicCard
        className="rounded-xl"
        gradientFrom={gradient.from}
        gradientTo={gradient.to}
        gradientColor={gradient.glow}
        gradientOpacity={0.5}
      >
        <section className="p-4 text-zinc-900 dark:text-zinc-100">
          {uniqueSectors.length > 0 ? (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {uniqueSectors.slice(0, 3).map((setor) => (
                <span
                  key={setor}
                  className="rounded-md bg-sky-50 px-2 py-1 text-xs font-bold text-sky-700 ring-1 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30"
                >
                  {setor}
                </span>
              ))}
            </div>
          ) : null}
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide opacity-70">{service.replace("_", "/")}</p>
              <h3 className="mt-1 text-base font-semibold">{SERVICE_TITLES[service]}</h3>
            </div>
            <span
              className={clsx(
                "flex h-9 w-9 items-center justify-center rounded-xl text-lg shadow-sm transition group-hover:scale-110",
                SERVICE_ICON_ACCENTS[service],
              )}
            >
              <i className={SERVICE_ICONS[service]} aria-hidden />
            </span>
          </div>

          {features.length === 0 ? (
            <div className="mt-5 rounded-xl bg-zinc-50 px-3 py-3 text-sm text-zinc-600 dark:bg-zinc-800/70 dark:text-zinc-300">
              Sem rota encontrada neste ponto.
            </div>
          ) : isVarricao ? (
            <div className="mt-5 space-y-3">
              {scheduleDates.map((date, index) => (
                <div
                  key={`${service}-${date}-${index}`}
                  className="flex items-center justify-between rounded-xl border border-sky-400 bg-zinc-50 px-3 py-2 ring-2 ring-sky-200/70 dark:bg-zinc-800/70 dark:ring-sky-500/20"
                >
                  <span className="text-xs font-semibold uppercase tracking-wide opacity-60">
                    {index === 0 ? "Próxima" : "Depois"}
                  </span>
                  <span className="text-sm font-semibold">{date}</span>
                </div>
              ))}
              <div className="rounded-xl bg-zinc-50 px-3 py-3 dark:bg-zinc-800/70">
                <p className="text-xs font-semibold uppercase tracking-wide opacity-60">Frequência</p>
                <p className="mt-1 text-sm font-semibold">{uniqueFrequencies.join(" | ") || "Não informada"}</p>
              </div>
              <div className="rounded-xl bg-zinc-50 px-3 py-3 dark:bg-zinc-800/70">
                <p className="text-xs font-semibold uppercase tracking-wide opacity-60">Dias</p>
                <p className="mt-1 text-sm font-semibold">{uniqueDays.join(" | ") || "Não informado"}</p>
              </div>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              <div className="grid grid-cols-1 gap-2">
                {dateSlots.length > 0 ? (
                  dateSlots.map((slot, index) => (
                    <div
                      key={`${service}-${slot.label}-${slot.value.getTime()}-${index}`}
                      className={clsx(
                        "flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-2 dark:bg-zinc-800/70",
                        slot.label === "Próxima" &&
                          "border border-sky-400 ring-2 ring-sky-200/70 dark:border-sky-400 dark:ring-sky-500/20",
                      )}
                    >
                      <span className="text-xs font-semibold uppercase tracking-wide opacity-60">{slot.label}</span>
                      <span className="text-sm font-semibold">{formatDateShort(slot.value)}</span>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl bg-zinc-50 px-3 py-3 text-sm dark:bg-zinc-800/70">
                    Cronograma não informado.
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </MagicCard>
    </motion.div>
  );
}

function ScheduleCardSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
    >
      <div className="space-y-3">
        <div className="glass-skeleton h-3 w-16 rounded-full bg-zinc-200 dark:bg-zinc-700" />
        <div className="glass-skeleton h-5 w-32 rounded-full bg-zinc-200 dark:bg-zinc-700" />
        <div className="glass-skeleton mt-4 h-10 w-full rounded-xl bg-zinc-100 dark:bg-zinc-800" />
        <div className="glass-skeleton h-10 w-full rounded-xl bg-zinc-100 dark:bg-zinc-800" />
        <div className="glass-skeleton h-10 w-4/5 rounded-xl bg-zinc-100 dark:bg-zinc-800" />
      </div>
    </motion.div>
  );
}

export function HomeSearchPage() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [selectedAddress, setSelectedAddress] = useState<SelectedAddress | null>(null);
  const [serviceData, setServiceData] = useState<Partial<Record<ServiceKey, FeatureRecord[]>>>({});
  const [loadingServices, setLoadingServices] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [particleColor, setParticleColor] = useState("#0ea5e9");
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const searchShellControls = useAnimationControls();
  const hasQuery = query.trim().length > 0;

  useEffect(() => {
    const syncParticleColor = () => {
      const dark = document.documentElement.classList.contains("dark");
      setParticleColor(dark ? "#38bdf8" : "#0284c7");
    };
    syncParticleColor();
    window.addEventListener("themechange", syncParticleColor);
    return () => window.removeEventListener("themechange", syncParticleColor);
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (selectedAddress && term === selectedAddress.label.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      setIsSearching(false);
      return;
    }
    if (term.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      setIsSearching(false);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        setIsSearching(true);
        const signal = AbortSignal.timeout(8000);
        const [localRes, placesRes] = await Promise.all([
          fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal }),
          fetch(`/api/places-autocomplete?q=${encodeURIComponent(term)}`, { signal }),
        ]);
        const localJson = localRes.ok ? await localRes.json() : { results: [] };
        const placesJson = placesRes.ok ? await placesRes.json() : { results: [] };
        const localList: SearchSuggestion[] = (localJson.results || []).map((result: SearchSuggestion) => ({
          ...result,
          source: "local" as const,
        }));
        const googleList: SearchSuggestion[] = (placesJson.results || []).map((result: SearchSuggestion) => ({
          ...result,
          source: "google" as const,
        }));
        const merged = [...localList, ...googleList].slice(0, 12);
        setSuggestions(merged);
        setShowSuggestions(merged.length > 0);
        setSelectedIndex(-1);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setSuggestions([]);
        setShowSuggestions(false);
      } finally {
        setIsSearching(false);
      }
    }, 260);
    return () => window.clearTimeout(timer);
  }, [query, selectedAddress]);

  const loadTargetServices = useCallback(async () => {
    const missing = TARGET_SERVICES.filter((service) => !serviceData[service]?.length);
    if (missing.length === 0) return;
    setLoadingServices(true);
    try {
      const entries = await Promise.all(
        missing.map(async (service) => {
          const response = await fetch(`/api/features?service=${encodeURIComponent(service)}`);
          if (!response.ok) return [service, [] as FeatureRecord[]] as const;
          const parsed = (await parseFeaturesJson(await response.text())) as { features?: FeatureRecord[] };
          return [service, parsed.features ?? []] as const;
        }),
      );
      setServiceData((prev) => {
        const next = { ...prev };
        for (const [service, features] of entries) next[service] = features;
        return next;
      });
    } finally {
      setLoadingServices(false);
    }
  }, [serviceData]);

  const selectAddress = useCallback(
    async (suggestion: SearchSuggestion) => {
      let coords = suggestion.centroid;
      let label = suggestion.logradouro;
      if (suggestion.placeId) {
        const response = await fetch(`/api/places-details?placeId=${encodeURIComponent(suggestion.placeId)}`, {
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) return;
        const details = (await response.json()) as { lat?: number; lng?: number; formattedAddress?: string };
        if (typeof details.lat !== "number" || typeof details.lng !== "number") return;
        coords = [details.lat, details.lng];
        label = details.formattedAddress || label;
      }
      if (!coords) return;
      setSelectedAddress({ coords, label, subprefeitura: suggestion.subprefeitura });
      setQuery(label);
      setShowSuggestions(false);
      setSelectedIndex(-1);
      await loadTargetServices();
    },
    [loadTargetServices],
  );

  const runSearch = async () => {
    const term = query.trim();
    if (!term) return;
    if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
      await selectAddress(suggestions[selectedIndex]);
      return;
    }
    if (suggestions.length > 0) {
      await selectAddress(suggestions[0]);
      return;
    }
    setIsSearching(true);
    try {
      const googleRes = await fetch(`/api/google-geocode?q=${encodeURIComponent(term)}`, {
        signal: AbortSignal.timeout(10000),
      });
      const googleJson = googleRes.ok ? await googleRes.json() : { results: [] };
      const googleHits = (googleJson.results || []) as SearchSuggestion[];
      if (googleHits.length > 0) {
        await selectAddress(googleHits[0]);
        return;
      }
      const nominatim = await searchNominatim(term);
      if (nominatim.length > 0) await selectAddress(nominatim[0]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void runSearch();
  };

  const matchesByService = useMemo(() => {
    const result: Record<ServiceKey, FeatureRecord[]> = {
      GO: [],
      MT: [],
      BL: [],
      VJ_VL: [],
    };
    if (!selectedAddress) return result;
    for (const service of TARGET_SERVICES) {
      const features = serviceData[service] ?? [];
      if (service === "VJ_VL") {
        result[service] = features.filter((feature) => isFeatureAtPoint(feature, selectedAddress.coords));
        continue;
      }
      const nearest = findNearestFeatureAtPoint(
        features,
        selectedAddress.coords,
        OVERLAPPING_LINE_PICK_METERS,
      );
      result[service] = nearest ? [nearest] : [];
    }
    return result;
  }, [selectedAddress, serviceData]);

  const handleInputChange = (value: string) => {
    setQuery(value);
    setSelectedAddress(null);
    void searchShellControls.start({
      scale: [1, 1.012, 1],
      transition: { duration: 0.2, ease: "easeOut" },
    });
    if (!value.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void runSearch();
      return;
    }
    if (!showSuggestions || suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (event.key === "Escape") {
      setShowSuggestions(false);
      setSelectedIndex(-1);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-100 flex flex-col">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sky-100/80 via-zinc-50 to-zinc-50 dark:from-sky-950/40 dark:via-zinc-950 dark:to-zinc-950" />
      <Particles
        className="absolute inset-0"
        quantity={120}
        ease={70}
        staticity={40}
        size={0.5}
        color={particleColor}
      />

      <div className="relative z-10 flex min-h-screen flex-col">
        <AppHeader />

        <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 pb-12 pt-6 sm:px-8 sm:pt-10">
          <div
            className={clsx(
              "mx-auto w-full max-w-3xl text-center",
              selectedAddress
                ? "pt-0"
                : "flex flex-1 flex-col justify-center sm:block sm:flex-none sm:pt-10",
            )}
          >
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xs font-bold uppercase tracking-[0.2em] text-sky-700 dark:text-sky-300"
            >
              Plano de Trabalho
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="mt-4 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white sm:text-5xl"
            >
              Consulte um endereço
            </motion.h1>
            <form ref={formRef} onSubmit={handleSubmit} className="relative mt-8">
              <motion.div
                animate={searchShellControls}
                className="flex items-center gap-3 rounded-full border border-zinc-200/80 bg-white/80 p-2 shadow-lg shadow-sky-100/50 backdrop-blur-md transition focus-within:border-sky-300 focus-within:shadow-sky-200/60 dark:border-zinc-700/80 dark:bg-zinc-900/80 dark:shadow-black/20 dark:focus-within:border-sky-500"
              >
                <span className="ml-3 hidden sm:flex h-9 w-9 items-center justify-center rounded-full bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
                  <i className="fa-solid fa-magnifying-glass" aria-hidden />
                </span>
                <input
                  ref={inputRef}
                  value={query}
                  type="search"
                  onChange={(event) => handleInputChange(event.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={() => {
                    if (suggestions.length > 0) setShowSuggestions(true);
                  }}
                  onBlur={() => {
                    window.setTimeout(() => {
                      const active = document.activeElement;
                      if (!formRef.current?.contains(active)) setShowSuggestions(false);
                    }, 160);
                  }}
                  placeholder="Pesquise uma rua, avenida ou praça"
                  className="min-w-0 flex-1 bg-transparent py-3 pl-3 sm:pl-0 text-base text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                  autoComplete="off"
                />
                <button
                  type="submit"
                  disabled={isSearching || !query.trim()}
                  className="mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-600 p-0 text-sm font-semibold text-white transition hover:scale-105 hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50 sm:h-auto sm:w-auto sm:px-5 sm:py-3"
                >
                  {isSearching ? (
                    "..."
                  ) : (
                    <>
                      <span className="hidden sm:inline">Buscar</span>
                      <i className="fa-solid fa-magnifying-glass sm:hidden" aria-hidden />
                    </>
                  )}
                </button>
              </motion.div>

              <AnimatePresence>
                {showSuggestions && suggestions.length > 0 ? (
                  <motion.div
                    initial={{ opacity: 0, y: -8, filter: "blur(4px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: -6, filter: "blur(3px)" }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute left-0 top-full z-30 mt-2 max-h-80 w-full overflow-auto rounded-xl border border-zinc-200/80 bg-white/95 p-2 text-left shadow-xl backdrop-blur-md dark:border-zinc-700 dark:bg-zinc-900/95"
                  >
                    {suggestions.map((suggestion, index) => (
                      <motion.button
                        key={suggestion.placeId ?? `${suggestion.logradouro}-${index}`}
                        type="button"
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.03, duration: 0.2 }}
                        onMouseEnter={() => setSelectedIndex(index)}
                        onClick={() => {
                          void selectAddress(suggestion);
                          inputRef.current?.blur();
                        }}
                        className={clsx(
                          "flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition",
                          selectedIndex === index
                            ? "bg-sky-50/90 text-sky-900 dark:bg-sky-500/15 dark:text-sky-100"
                            : "text-zinc-700 hover:bg-white/60 dark:text-zinc-200 dark:hover:bg-white/5",
                        )}
                      >
                        <i className="fa-solid fa-location-dot mt-0.5 text-sky-600 dark:text-sky-300" aria-hidden />
                        <span>
                          <span className="block text-sm font-semibold">{suggestion.logradouro}</span>
                          <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
                            {suggestion.source === "google"
                              ? "Google Places"
                              : suggestion.subprefeitura || suggestion.setor || "Endereco"}
                          </span>
                        </span>
                      </motion.button>
                    ))}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </form>
          </div>

          {!hasQuery && !selectedAddress ? (
            <div className="hidden mt-12 gap-4 md:grid md:grid-cols-3">
              <PageCard
                title="Mapa Interativo"
                description="Camadas, busca geográfica e detalhes do plano de trabalho."
                icon="fa-solid fa-map"
                href="/map"
                delay={0.05}
              />
              <PageCard
                title="Acompanhamento de execução"
                description="Painel operacional para leitura de avanço e execução."
                icon="fa-solid fa-list-check"
                href="/acompanhamento"
                delay={0.12}
              />
              <PageCard
                title="Aguardando Análise"
                description="Fila de itens que precisam de validação."
                icon="fa-solid fa-hourglass-half"
                href="/aguardando-analise"
                delay={0.19}
              />
            </div>
          ) : null}

          {selectedAddress ? (
            <div className="mt-10">
              <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Resultado para
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-white">
                    {describeAddress({
                      logradouro: selectedAddress.label,
                      name: selectedAddress.label,
                      setor: "",
                      subprefeitura: selectedAddress.subprefeitura,
                    })}
                  </h2>
                </motion.div>
                {loadingServices ? <LoadingShimmerText /> : null}
              </div>

              <AnimatePresence mode="wait">
                {loadingServices ? (
                  <motion.div
                    key="skeletons"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, filter: "blur(4px)" }}
                    className="grid grid-cols-1 gap-4 lg:grid-cols-4"
                  >
                    {TARGET_SERVICES.map((service, index) => (
                      <ScheduleCardSkeleton key={`sk-${service}`} delay={index * 0.07} />
                    ))}
                  </motion.div>
                ) : (
                  <motion.div
                    key="cards"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="grid grid-cols-1 gap-4 lg:grid-cols-4"
                  >
                    {TARGET_SERVICES.map((service, index) => (
                      <ScheduleCard
                        key={service}
                        service={service}
                        features={matchesByService[service]}
                        delay={index * 0.08}
                      />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : hasQuery ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-auto mt-10 max-w-2xl rounded-xl border border-dashed border-zinc-300 bg-white/70 p-6 text-center text-sm text-zinc-500 backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-400"
            >
              Escolha uma sugestão para ver os cronogramas.
            </motion.div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
