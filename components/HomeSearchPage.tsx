"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { AppHeader } from "@/components/AppHeader";
import { minDistancePointToPolylineMeters, OVERLAPPING_LINE_PICK_METERS } from "@/lib/polylineDistance";
import { parseFeaturesJson } from "@/lib/parseFeaturesJson";
import type { FeatureRecord } from "@/lib/types";

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

type DateSlot = {
  value: Date;
  label: "Anterior" | "Próxima" | "Futura";
};

const TARGET_SERVICES: ServiceKey[] = ["GO", "MT", "BL", "VJ_VL"];
const SERVICE_TITLES: Record<ServiceKey, string> = {
  GO: "Cata-Bagulho",
  MT: "Mutirão",
  BL: "Limpeza de Bueiros",
  VJ_VL: "Varrição Manual",
};
const SERVICE_ACCENTS: Record<ServiceKey, string> = {
  GO: "border-emerald-300 bg-white text-zinc-900 dark:border-emerald-500/50 dark:bg-zinc-900 dark:text-zinc-100",
  MT: "border-sky-300 bg-white text-zinc-900 dark:border-sky-500/50 dark:bg-zinc-900 dark:text-zinc-100",
  BL: "border-amber-300 bg-white text-zinc-900 dark:border-amber-500/50 dark:bg-zinc-900 dark:text-zinc-100",
  VJ_VL: "border-violet-300 bg-white text-zinc-900 dark:border-violet-500/50 dark:bg-zinc-900 dark:text-zinc-100",
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
const PICK_RADIUS_METERS = 70;

function normalizeToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseScheduleDates(value?: string | null): Date[] {
  if (!value) return [];
  const seen = new Set<number>();
  return value
    .split(";")
    .map((part) => part.trim())
    .map((part) => {
      const match = part.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!match) return null;
      const [, dd, mm, yyyy] = match;
      return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    })
    .filter((date): date is Date => !!date && !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime())
    .filter((date) => {
      const time = date.getTime();
      if (seen.has(time)) return false;
      seen.add(time);
      return true;
    });
}

function pickDatesAroundToday(dates: Date[], previousCount: number, futureCount: number): DateSlot[] {
  if (dates.length === 0) return [];
  const today = normalizeToday().getTime();
  let pivot = dates.findIndex((date) => date.getTime() >= today);
  if (pivot < 0) pivot = dates.length - 1;
  const before = dates.slice(Math.max(0, pivot - previousCount), pivot);
  const current = dates[pivot] ? [dates[pivot]] : [];
  const after = dates.slice(pivot + 1, pivot + 1 + futureCount);
  return [
    ...before.map((value) => ({ value, label: "Anterior" as const })),
    ...current.map((value) => ({
      value,
      label: value.getTime() < today ? ("Anterior" as const) : ("Próxima" as const),
    })),
    ...after.map((value) => ({ value, label: "Futura" as const })),
  ];
}

function formatDateShort(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateLong(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

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

function pointInPolygon(point: [number, number], ring: [number, number][]): boolean {
  if (ring.length < 3) return false;
  const [lat, lon] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [latI, lonI] = ring[i];
    const [latJ, lonJ] = ring[j];
    const intersects =
      latI > lat !== latJ > lat &&
      lon < ((lonJ - lonI) * (lat - latI)) / (latJ - latI || Number.EPSILON) + lonI;
    if (intersects) inside = !inside;
  }
  return inside;
}

function isFeatureAtPoint(feature: FeatureRecord, point: [number, number]): boolean {
  const geometry = feature.geometry ?? "polygon";
  if (geometry === "line" || geometry === "multiline") {
    return minDistancePointToPolylineMeters(point, feature.coords) <= OVERLAPPING_LINE_PICK_METERS;
  }
  if (geometry === "point") {
    const coords = feature.coords as [number, number][];
    const first = coords[0];
    return !!first && minDistancePointToPolylineMeters(point, [first, first]) <= PICK_RADIUS_METERS;
  }
  const coords = feature.coords as [number, number][];
  return pointInPolygon(point, coords) || minDistancePointToPolylineMeters(point, coords) <= PICK_RADIUS_METERS;
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
}: {
  title: string;
  description: string;
  icon: string;
  href?: "/" | "/home" | "/map" | "/acompanhamento" | "/aguardando-analise";
  disabled?: boolean;
}) {
  const content = (
    <div
      className={clsx(
        "group flex min-h-[150px] flex-col justify-between rounded-lg border bg-white p-5 text-left shadow-sm transition dark:border-zinc-700 dark:bg-zinc-900",
        disabled
          ? "border-zinc-200 opacity-70 dark:border-zinc-700"
          : "border-zinc-200 hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md dark:hover:border-sky-500",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-950 dark:text-white">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{description}</p>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-sky-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-sky-300">
          <i className={icon} aria-hidden />
        </span>
      </div>
      <div className="mt-5 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        <span>{disabled ? "Em breve" : "Abrir"}</span>
        <i className="fa-solid fa-arrow-right text-[11px]" aria-hidden />
      </div>
    </div>
  );
  if (href && !disabled) return <Link href={href}>{content}</Link>;
  return content;
}

function ScheduleCard({
  service,
  features,
}: {
  service: ServiceKey;
  features: FeatureRecord[];
}) {
  const primary = features[0];
  const isVarricao = service === "VJ_VL";
  const dates = useMemo(() => {
    if (!primary || isVarricao) return [];
    return pickDatesAroundToday(parseScheduleDates(primary.cronograma), service === "GO" ? 2 : 1, service === "GO" ? 2 : 1);
  }, [isVarricao, primary, service]);
  const uniqueFrequencies = Array.from(
    new Set(features.map((feature) => feature.frequencia).filter(Boolean) as string[]),
  ).map(expandFrequency);

  return (
    <section className={clsx("rounded-lg border p-4 shadow-sm", SERVICE_ACCENTS[service])}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide opacity-70">{service.replace("_", "/")}</p>
          <h3 className="mt-1 text-base font-semibold">{SERVICE_TITLES[service]}</h3>
        </div>
        <span className={clsx("flex h-9 w-9 items-center justify-center rounded-lg text-lg shadow-sm", SERVICE_ICON_ACCENTS[service])}>
          <i className={SERVICE_ICONS[service]} aria-hidden />
        </span>
      </div>

      {features.length === 0 ? (
        <div className="mt-5 rounded-md bg-zinc-50 px-3 py-3 text-sm text-zinc-600 dark:bg-zinc-800/70 dark:text-zinc-300">
          Sem rota encontrada neste ponto.
        </div>
      ) : isVarricao ? (
        <div className="mt-5 space-y-3">
          <div className="rounded-md bg-zinc-50 px-3 py-3 dark:bg-zinc-800/70">
            <p className="text-xs font-semibold uppercase tracking-wide opacity-60">Frequência</p>
            <p className="mt-1 text-sm font-semibold">{uniqueFrequencies.join(" | ") || "Não informada"}</p>
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          <div className="grid grid-cols-1 gap-2">
            {dates.length > 0 ? (
              dates.map((slot) => (
                <div
                  key={`${service}-${slot.value.getTime()}-${slot.label}`}
                  className={clsx(
                    "flex items-center justify-between rounded-md bg-zinc-50 px-3 py-2 dark:bg-zinc-800/70",
                    slot.label === "Próxima" &&
                      "border border-sky-400 ring-2 ring-sky-200/70 dark:border-sky-400 dark:ring-sky-500/20",
                  )}
                >
                  <span className="text-xs font-semibold uppercase tracking-wide opacity-60">{slot.label}</span>
                  <span className="text-sm font-semibold">
                    <span className="sm:hidden">{formatDateLong(slot.value)}</span>
                    <span className="hidden sm:inline">{formatDateShort(slot.value)}</span>
                  </span>
                </div>
              ))
            ) : (
              <div className="rounded-md bg-zinc-50 px-3 py-3 text-sm dark:bg-zinc-800/70">Cronograma não informado.</div>
            )}
          </div>
        </div>
      )}
    </section>
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
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const hasQuery = query.trim().length > 0;

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
      result[service] = features.filter((feature) => isFeatureAtPoint(feature, selectedAddress.coords));
    }
    return result;
  }, [selectedAddress, serviceData]);

  const handleInputChange = (value: string) => {
    setQuery(value);
    setSelectedAddress(null);
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
    <main className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-zinc-900 dark:text-zinc-100 flex flex-col">
      <AppHeader />

      <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 pb-12 pt-6 sm:px-8 sm:pt-10">
        <div
          className={clsx(
            "mx-auto w-full max-w-3xl text-center",
            selectedAddress
              ? "pt-0"
              : "flex flex-1 flex-col justify-center sm:block sm:flex-none sm:pt-10"
          )}
        >
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-700 dark:text-sky-300">Plano de Trabalho</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-normal text-zinc-950 dark:text-white sm:text-5xl">
            Consulte um endereço
          </h1>
          <form ref={formRef} onSubmit={handleSubmit} className="relative mt-8">
            <div className="flex items-center gap-3 rounded-full border border-zinc-200 bg-white p-2 shadow-lg shadow-zinc-200/60 dark:border-zinc-700 dark:bg-zinc-800 dark:shadow-black/20">
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
                className="mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-600 p-0 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50 sm:h-auto sm:w-auto sm:px-5 sm:py-3"
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
            </div>

            {showSuggestions && suggestions.length > 0 ? (
              <div className="absolute left-0 top-full z-30 mt-2 max-h-80 w-full overflow-auto rounded-lg border border-zinc-200 bg-white p-2 text-left shadow-xl dark:border-zinc-700 dark:bg-zinc-800">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={suggestion.placeId ?? `${suggestion.logradouro}-${index}`}
                    type="button"
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={() => {
                      void selectAddress(suggestion);
                      inputRef.current?.blur();
                    }}
                    className={clsx(
                      "flex w-full items-start gap-3 rounded-md px-3 py-3 text-left transition",
                      selectedIndex === index
                        ? "bg-sky-50 text-sky-900 dark:bg-sky-500/15 dark:text-sky-100"
                        : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700",
                    )}
                  >
                    <i className="fa-solid fa-location-dot mt-0.5 text-sky-600 dark:text-sky-300" aria-hidden />
                    <span>
                      <span className="block text-sm font-semibold">{suggestion.logradouro}</span>
                      <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
                        {suggestion.source === "google" ? "Google Places" : suggestion.subprefeitura || suggestion.setor || "Endereco"}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </form>
        </div>

        {!hasQuery && !selectedAddress ? (
          <div className="hidden mt-12 gap-4 md:grid md:grid-cols-3">
            <PageCard
              title="Mapa Interativo"
              description="Camadas, busca geográfica e detalhes do plano de trabalho."
              icon="fa-solid fa-map"
              href="/map"
            />
            <PageCard
              title="Acompanhamento de execução"
              description="Painel operacional para leitura de avanço e execução."
              icon="fa-solid fa-list-check"
              href="/acompanhamento"
            />
            <PageCard
              title="Aguardando Análise"
              description="Fila de itens que precisam de validação."
              icon="fa-solid fa-hourglass-half"
              href="/aguardando-analise"
            />
          </div>
        ) : null}

        {selectedAddress ? (
          <div className="mt-10">
            <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Resultado para</p>
                <h2 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-white">{describeAddress({
                  logradouro: selectedAddress.label,
                  name: selectedAddress.label,
                  setor: "",
                  subprefeitura: selectedAddress.subprefeitura,
                })}</h2>
              </div>
              {loadingServices ? (
                <span className="inline-flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" />
                  Carregando cronogramas
                </span>
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
              {TARGET_SERVICES.map((service) => (
                <ScheduleCard key={service} service={service} features={matchesByService[service]} />
              ))}
            </div>
          </div>
        ) : hasQuery ? (
          <div className="mx-auto mt-10 max-w-2xl rounded-lg border border-dashed border-zinc-300 bg-white/70 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-400">
            Escolha uma sugestão para ver os cronogramas.
          </div>
        ) : null}
      </section>
    </main>
  );
}
