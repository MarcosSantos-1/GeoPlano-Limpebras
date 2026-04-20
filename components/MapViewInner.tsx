"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FeatureGroup,
  GeoJSON,
  LayerGroup,
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  Popup,
  TileLayer,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import clsx from "clsx";
import { renderToString } from "react-dom/server";
import {
  getServiceFaLayerSpec,
  getServiceIconMeta,
  ServiceGlyphForMap,
} from "@/lib/serviceIcons";
import { buildMultiPopupHtml, buildPopupHtml } from "@/lib/popupBuilder";
import {
  minDistancePointToPolylineMeters,
  OVERLAPPING_LINE_PICK_METERS,
} from "@/lib/polylineDistance";
import type {
  Feature as GeoJsonFeature,
  FeatureCollection as GeoJsonFeatureCollection,
  GeoJsonObject,
} from "geojson";
import type { FeatureCollection, FeatureRecord } from "@/lib/types";
import { parseFeaturesJson } from "@/lib/parseFeaturesJson";
import type * as Leaflet from "leaflet";

let LeafletLib: typeof Leaflet | undefined;

if (typeof window !== "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  LeafletLib = require("leaflet");
}

type MapViewProps = {
  data?: FeatureCollection;
};

function getFullscreenElement(): Element | null {
  const d = document as Document & {
    webkitFullscreenElement?: Element | null;
    mozFullScreenElement?: Element | null;
  };
  return document.fullscreenElement ?? d.webkitFullscreenElement ?? d.mozFullScreenElement ?? null;
}

/** Ícone no centróide da linha (popup no pin). MT/BL/GO/VM/VJ_VL: só traçado, sem pin na rua. */
const MARKER_ON_LINE_SERVICES = new Set(["CA", "CF_VF_LF"]);

/** Subprefeituras do lote (siglas oficiais no geodata da PMSP). */
const SUBPREFS_LOTE = [
  {
    sg: "CV",
    toggleKey: "_subprefCV",
    label: "Casa Verde-Limaão-Cachoeirinha",
    color: "#16a34a",
  },
  {
    sg: "JT",
    toggleKey: "_subprefJT",
    label: "Jaçanã-Tremembé",
    color: "#1e3a8a",
  },
  {
    sg: "MG",
    toggleKey: "_subprefMG",
    label: "Vila Maria-Vila Guilherme",
    color: "#06b6d4",
  },
  {
    sg: "ST",
    toggleKey: "_subprefST",
    label: "Santana-Tucuruvi",
    color: "#eab308",
  },
] as const;

const BASE_LAYERS = [
  { id: "esri-hybrid", emoji: "🛰️", label: "Satélite + Ruas (Esri)" },
  { id: "esri-sat", emoji: "🛰️", label: "Satélite (Esri)" },
  { id: "osm", emoji: "🗺️", label: "OpenStreetMap" },
  { id: "carto-light", emoji: "🗺️", label: "CartoDB Positron" },
  { id: "carto-dark", emoji: "🌑", label: "CartoDB Dark Matter" },
] as const;

function ActiveBaseLayers({ baseId }: { baseId: string }) {
  switch (baseId) {
    case "esri-hybrid":
      return (
        <LayerGroup>
          <TileLayer
            attribution='Imagery &copy; <a href="https://www.esri.com/">Esri</a>'
            url="https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          />
          <TileLayer
            attribution='Ruas &copy; <a href="https://www.esri.com/">Esri</a>'
            url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"
            opacity={0.75}
          />
          <TileLayer
            attribution='Limites &copy; <a href="https://www.esri.com/">Esri</a>'
            url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_And_Places/MapServer/tile/{z}/{y}/{x}"
            opacity={0.7}
          />
        </LayerGroup>
      );
    case "esri-sat":
      return (
        <TileLayer
          attribution='Imagery &copy; <a href="https://www.esri.com/">Esri</a>'
          url="https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        />
      );
    case "osm":
      return (
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
      );
    case "carto-light":
      return (
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
      );
    case "carto-dark":
      return (
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
      );
    default:
      return (
        <LayerGroup>
          <TileLayer
            attribution='Imagery &copy; <a href="https://www.esri.com/">Esri</a>'
            url="https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          />
          <TileLayer
            attribution='Ruas &copy; <a href="https://www.esri.com/">Esri</a>'
            url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"
            opacity={0.75}
          />
          <TileLayer
            attribution='Limites &copy; <a href="https://www.esri.com/">Esri</a>'
            url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_And_Places/MapServer/tile/{z}/{y}/{x}"
            opacity={0.7}
          />
        </LayerGroup>
      );
  }
}

/** Ícones claros precisam de círculo escuro no mapa e no menu claro. */
const FA_LAYER_DARK_BADGE = new Set(["MT", "VJ_VL", "VM", "PV"]);

function OverlayRowLeading({
  serviceKey,
  sample,
}: {
  serviceKey: string;
  sample?: FeatureRecord;
}) {
  const faSpec = getServiceFaLayerSpec(serviceKey);
  const legacyKey =
    sample?.service_icon ?? sample?.service_type_code ?? sample?.service_type ?? serviceKey;
  const iconMeta = faSpec ? null : getServiceIconMeta(legacyKey);
  const darkBadge = faSpec && FA_LAYER_DARK_BADGE.has(serviceKey);
  return (
    <span
      className={clsx(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border [&_svg]:h-3.5 [&_svg]:w-3.5",
        darkBadge
          ? "border-slate-600 bg-slate-700 dark:border-slate-500/50 dark:bg-slate-800/90"
          : "border-slate-300 bg-slate-100 dark:border-slate-500/40 dark:bg-slate-800/80",
      )}
    >
      {faSpec ? (
        <i
          className={clsx(faSpec.iconClass, "text-[13px] leading-none")}
          style={{ color: faSpec.color }}
          aria-hidden
        />
      ) : (
        iconMeta?.element
      )}
    </span>
  );
}

function getPopupHtml(feature: FeatureRecord): string {
  return buildPopupHtml(feature);
}

/** Texto opcional abaixo do pin (satélite): Ecopontos, NH, monumentos, PV (só ID). */
function mapLabelBelowPin(feature: FeatureRecord): string {
  switch (feature.service) {
    case "ECO":
      return (feature.name || feature.setor || "").trim();
    case "NH":
    case "LM":
      return (feature.name || feature.setor || "").trim();
    case "PV":
      return (feature.setor || "").trim();
    default:
      return "";
  }
}

type SearchSuggestion = {
  logradouro: string;
  name: string;
  setor: string;
  subprefeitura?: string | null;
  /** Presente para resultados do índice local / geocode; ausente até Place Details para Google Autocomplete. */
  centroid?: [number, number];
  placeId?: string;
  source?: "local" | "google" | "google_geocode";
};

// ── Componente de busca ──────────────────────────────────────────────
function SearchBar({
  mapRef,
  L,
  searchMarkerIcon,
}: {
  mapRef: React.RefObject<Leaflet.Map | null>;
  L: typeof Leaflet | undefined;
  searchMarkerIcon: Leaflet.DivIcon | null;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [hideSearchGlyph, setHideSearchGlyph] = useState(false);
  const searchMarkerRef = useRef<Leaflet.Marker | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query || query.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      setIsSearching(false);
      return;
    }

    const timeoutId = setTimeout(async () => {
      try {
        setIsSearching(true);
        const signal = AbortSignal.timeout(8000);
        const [localRes, placesRes] = await Promise.all([
          fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal }),
          fetch(`/api/places-autocomplete?q=${encodeURIComponent(query)}`, { signal }),
        ]);
        const localJson = localRes.ok ? await localRes.json() : { results: [] };
        const placesJson = placesRes.ok ? await placesRes.json() : { results: [] };
        const localList: SearchSuggestion[] = (localJson.results || []).map(
          (r: {
            logradouro: string;
            centroid: [number, number];
            setor: string;
            name: string;
            subprefeitura?: string | null;
          }) => ({
            ...r,
            source: "local" as const,
          }),
        );
        const googleList: SearchSuggestion[] = (placesJson.results || []).map(
          (r: { logradouro: string; name: string; placeId: string; setor: string; subprefeitura: null }) => ({
            logradouro: r.logradouro,
            name: r.name,
            placeId: r.placeId,
            setor: r.setor,
            subprefeitura: r.subprefeitura,
            source: "google" as const,
          }),
        );
        const merged = [...localList, ...googleList].slice(0, 14);
        setSuggestions(merged);
        setShowSuggestions(merged.length > 0);
        setSelectedIndex(-1);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        console.warn("Erro ao buscar endereços:", error);
        setSuggestions([]);
        setShowSuggestions(false);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      clearTimeout(timeoutId);
      setIsSearching(false);
    };
  }, [searchQuery]);

  const searchNominatim = async (query: string) => {
    try {
      const params = new URLSearchParams({
        format: "json",
        q: query + ", São Paulo, Brasil",
        limit: "5",
        addressdetails: "0",
      });
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?${params.toString()}`,
        { headers: { "Accept-Language": "pt-BR" } },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const results: Array<{ lat: string; lon: string; display_name?: string }> =
        await response.json();
      return results.map((r) => ({
        logradouro: r.display_name || query,
        centroid: [Number(r.lat), Number(r.lon)] as [number, number],
        setor: "",
        name: r.display_name || query,
        subprefeitura: null,
        source: "local" as const,
      }));
    } catch {
      return [];
    }
  };

  const selectAddress = useCallback(
    async (address: SearchSuggestion) => {
      if (!mapRef.current || !L) return;
      let lat: number;
      let lng: number;
      let label = address.logradouro;
      const subpref = address.subprefeitura;

      if (address.placeId) {
        try {
          const res = await fetch(
            `/api/places-details?placeId=${encodeURIComponent(address.placeId)}`,
            { signal: AbortSignal.timeout(10000) },
          );
          if (!res.ok) throw new Error("details");
          const d = (await res.json()) as { lat?: number; lng?: number; formattedAddress?: string };
          if (typeof d.lat !== "number" || typeof d.lng !== "number") throw new Error("coords");
          lat = d.lat;
          lng = d.lng;
          if (d.formattedAddress) label = d.formattedAddress;
        } catch {
          alert("Não foi possível obter a localização deste endereço no Google Places.");
          return;
        }
      } else if (address.centroid) {
        lat = address.centroid[0];
        lng = address.centroid[1];
      } else {
        return;
      }

      const destination = L.latLng(lat, lng);
      const map = mapRef.current;
      map.setView(destination, 18, { animate: true, duration: 0.75 });
      if (searchMarkerRef.current) {
        map.removeLayer(searchMarkerRef.current);
        searchMarkerRef.current = null;
      }
      if (searchMarkerIcon) {
        const marker = L.marker(destination, { icon: searchMarkerIcon }).addTo(map);
        const popupText = subpref ? `${label} — ${subpref}` : label;
        marker.bindPopup(popupText).openPopup();
        searchMarkerRef.current = marker;
      }
      setSearchQuery("");
      setShowSuggestions(false);
      setSelectedIndex(-1);
    },
    [mapRef, L, searchMarkerIcon],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query || !mapRef.current || !L) return;
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
      const googleRes = await fetch(`/api/google-geocode?q=${encodeURIComponent(query)}`, {
        signal: AbortSignal.timeout(10000),
      });
      const googleJson = googleRes.ok ? await googleRes.json() : { results: [] };
      const googleHits = (googleJson.results || []) as SearchSuggestion[];
      if (googleHits.length > 0) {
        await selectAddress(googleHits[0]);
        return;
      }
      const nominatimResults = await searchNominatim(query);
      if (nominatimResults.length > 0) {
        await selectAddress(nominatimResults[0]);
      } else {
        alert("Endereço não encontrado.");
      }
    } catch {
      alert("Não foi possível realizar a busca agora.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit(e);
      return;
    }
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === "Escape") {
      e.preventDefault();
      setShowSuggestions(false);
      setSelectedIndex(-1);
      setSearchQuery("");
    }
  };

  return (
    <div className="absolute left-6 top-6 z-[1000] w-[500px]" style={{ marginLeft: "60px" }}>
      <form ref={formRef} onSubmit={handleSubmit} className="relative">
        <div className="flex items-center gap-2 rounded-lg border-2 border-zinc-300 bg-white shadow-lg dark:border-zinc-600 dark:bg-zinc-800">
          <div className="relative min-w-0 flex flex-1 items-center">
            {!hideSearchGlyph && (
              <span
                className="pointer-events-none absolute left-3 z-[1] flex h-9 w-9 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-primary/25 dark:bg-primary/20 dark:ring-primary/35"
                aria-hidden
              >
                <i className="fa-solid fa-magnifying-glass text-base" />
              </span>
            )}
            <input
              ref={inputRef}
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                setHideSearchGlyph(true);
                if (suggestions.length > 0) setShowSuggestions(true);
              }}
              onBlur={() => {
                window.setTimeout(() => {
                  const active = document.activeElement;
                  if (!formRef.current?.contains(active)) {
                    setShowSuggestions(false);
                    setHideSearchGlyph(false);
                    setSelectedIndex(-1);
                  }
                }, 200);
              }}
              placeholder="Pesquisar endereço (ex: av ede 156)..."
              className={clsx(
                "min-w-0 flex-1 rounded-md border-none bg-transparent py-3 text-sm text-zinc-700 focus:outline-none focus:ring-0 dark:text-zinc-200 dark:placeholder:text-zinc-400",
                hideSearchGlyph ? "pl-3 pr-2" : "pl-14 pr-2",
              )}
              autoComplete="off"
            />
          </div>
          <button
            type="submit"
            disabled={isSearching || !searchQuery.trim()}
            className="mr-2 shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white uppercase tracking-wide shadow hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSearching ? "..." : "Buscar"}
          </button>
        </div>

        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute left-0 top-full z-[1001] mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-zinc-300 bg-white shadow-lg dark:border-zinc-600 dark:bg-zinc-800">
            <ul className="py-1">
              {suggestions.map((suggestion, index) => (
                <li key={suggestion.placeId ?? `${suggestion.logradouro}-${index}`}>
                  <button
                    type="button"
                    onClick={() => {
                      void selectAddress(suggestion);
                      inputRef.current?.blur();
                    }}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={clsx(
                      "w-full px-4 py-3 text-left text-sm transition-colors",
                      index === selectedIndex
                        ? "bg-primary/20 text-primary dark:bg-primary/30 dark:text-blue-400"
                        : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700",
                    )}
                  >
                    <div className="font-medium">{suggestion.logradouro}</div>
                    {suggestion.subprefeitura && (
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        {suggestion.subprefeitura}
                      </div>
                    )}
                    {suggestion.source === "google" && (
                      <div className="text-xs text-zinc-400 dark:text-zinc-500">Google Places</div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {isSearching && searchQuery.trim().length >= 2 && (
          <div className="absolute left-0 top-full z-[1001] mt-1 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-500 shadow-lg dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span>Buscando endereços...</span>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

// ── Componente lazy que renderiza features de um serviço ─────────────
function ServiceLayer({
  serviceKey,
  features,
  getMarkerIcon,
}: {
  serviceKey: string;
  features: FeatureRecord[];
  getMarkerIcon: (f: FeatureRecord) => Leaflet.DivIcon | null;
}) {
  const lineFeatures = useMemo(
    () => features.filter((f) => (f.geometry ?? "polygon") === "line"),
    [features],
  );
  const pointFeatures = useMemo(
    () => features.filter((f) => (f.geometry ?? "polygon") === "point"),
    [features],
  );
  const polygonFeatures = useMemo(
    () => features.filter((f) => (f.geometry ?? "polygon") === "polygon"),
    [features],
  );

  const showLineCentroidMarkers = MARKER_ON_LINE_SERVICES.has(serviceKey);

  return (
    <FeatureGroup>
      {lineFeatures.map((feature) => {
        const color = feature.lineColor || feature.fillColor || "#1f6feb";
        const weight = feature.lineWidth || 3.6;
        return (
          <Polyline
            key={feature.id ?? `${feature.service}-${feature.setor}-${feature.name}-line`}
            positions={feature.coords}
            pathOptions={{ color, weight, opacity: 0.9 }}
            eventHandlers={{
              click: (e) => {
                const ll = e.latlng;
                const p: [number, number] = [ll.lat, ll.lng];
                const scored = lineFeatures
                  .map((f) => ({
                    f,
                    d: minDistancePointToPolylineMeters(p, f.coords),
                  }))
                  .filter((x) => x.d <= OVERLAPPING_LINE_PICK_METERS)
                  .sort((a, b) => a.d - b.d);
                const seen = new Set<string>();
                const uniq: FeatureRecord[] = [];
                for (const { f } of scored) {
                  const k = f.id ?? `${f.service}-${f.setor}-${f.name}`;
                  if (seen.has(k)) continue;
                  seen.add(k);
                  uniq.push(f);
                }
                const html =
                  uniq.length === 0
                    ? getPopupHtml(feature)
                    : uniq.length === 1
                      ? getPopupHtml(uniq[0])
                      : buildMultiPopupHtml(uniq);
                e.target.bindPopup(html).openPopup();
              },
            }}
          />
        );
      })}

      {showLineCentroidMarkers &&
        lineFeatures.map((feature) => (
          <Marker
            key={`${feature.id ?? feature.setor}-lc`}
            position={feature.centroid}
            icon={getMarkerIcon(feature) ?? undefined}
          >
            <Popup>
              <div dangerouslySetInnerHTML={{ __html: getPopupHtml(feature) }} />
            </Popup>
          </Marker>
        ))}

      {polygonFeatures.map((feature) => (
        <Polygon
          key={feature.id ?? `${feature.service}-${feature.setor}-poly`}
          positions={feature.coords}
          pathOptions={{
            color: feature.fillColor || "#1f6feb",
            weight: feature.lineWidth || 2,
            fillOpacity: 0.35,
          }}
        >
          <Popup>
            <div dangerouslySetInnerHTML={{ __html: getPopupHtml(feature) }} />
          </Popup>
        </Polygon>
      ))}

      {polygonFeatures.map((feature) => (
        <Marker
          key={`${feature.id ?? feature.setor}-pm`}
          position={feature.centroid}
          icon={getMarkerIcon(feature) ?? undefined}
        >
          <Popup>
            <div dangerouslySetInnerHTML={{ __html: getPopupHtml(feature) }} />
          </Popup>
        </Marker>
      ))}

      {pointFeatures.map((feature) => {
        if (!feature.coords?.length) return null;
        const [lat, lon] = feature.coords[0];
        return (
          <Marker
            key={`${feature.id ?? feature.setor}-pt`}
            position={[lat, lon]}
            icon={getMarkerIcon(feature) ?? undefined}
          >
            <Popup>
              <div dangerouslySetInnerHTML={{ __html: getPopupHtml(feature) }} />
            </Popup>
          </Marker>
        );
      })}
    </FeatureGroup>
  );
}

// ── Componente principal ─────────────────────────────────────────────
export default function MapView({ data: initialData }: MapViewProps = {}) {
  const [isMounted, setIsMounted] = useState(false);
  const [data, setData] = useState<FeatureCollection | null>(initialData || null);
  const [isLoadingData, setIsLoadingData] = useState(!initialData);
  const [loadedByService, setLoadedByService] = useState<Record<string, FeatureRecord[]>>({});
  const loadedRef = useRef(loadedByService);
  loadedRef.current = loadedByService;

  useEffect(() => {
    setIsMounted(true);
    if (initialData) {
      setData(initialData);
      setIsLoadingData(false);
    } else {
      setIsLoadingData(true);
      fetch("/api/features")
        .then((res) => res.text())
        .then((t) => parseFeaturesJson(t))
        .then((loadedData) => {
          setData(loadedData as FeatureCollection);
          setIsLoadingData(false);
        })
        .catch((error) => {
          console.error("Erro ao carregar dados:", error);
          setIsLoadingData(false);
        });
    }
  }, [initialData]);

  useEffect(() => {
    if (!data) return;
    if (!data.splitByService && data.services && Object.keys(data.services).length > 0) {
      setLoadedByService(data.services);
    } else if (data.splitByService) {
      setLoadedByService({});
    }
  }, [data]);

  const handleServiceAdd = useCallback(async (serviceKey: string) => {
    if (loadedRef.current[serviceKey]?.length) return;
    try {
      const res = await fetch(`/api/features?service=${encodeURIComponent(serviceKey)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const parsed = (await parseFeaturesJson(text)) as { features?: FeatureRecord[] };
      const features = parsed.features ?? [];
      setLoadedByService((prev) => ({ ...prev, [serviceKey]: features }));
    } catch (e) {
      console.warn("Falha ao carregar camada", serviceKey, e);
    }
  }, []);

  const handleServiceRemove = useCallback((serviceKey: string) => {
    setLoadedByService((prev) => {
      const next = { ...prev };
      delete next[serviceKey];
      return next;
    });
  }, []);

  const L = isMounted ? LeafletLib : undefined;
  const mapRef = useRef<Leaflet.Map | null>(null);
  /** Só aplica fitBounds na primeira vez que o mapa existe (ref estável; evita reset ao abrir menus). */
  const initialBoundsFitDoneRef = useRef(false);
  const boundsRef = useRef<Leaflet.LatLngBounds | null>(null);
  const iconCache = useRef<Map<string, Leaflet.DivIcon>>(new Map());
  const [boundaryData, setBoundaryData] = useState<GeoJsonObject | null>(null);
  const [subprefLoteData, setSubprefLoteData] = useState<GeoJsonFeatureCollection | null>(null);
  const [searchError] = useState<string | null>(null);

  const [activeBaseId, setActiveBaseId] = useState<string>(BASE_LAYERS[0].id);
  const [layersMenuOpen, setLayersMenuOpen] = useState(false);
  const [basemapMenuOpen, setBasemapMenuOpen] = useState(false);
  const [overlayToggles, setOverlayToggles] = useState<Record<string, boolean>>({});
  const layersPanelRef = useRef<HTMLDivElement>(null);
  const basemapPanelRef = useRef<HTMLDivElement>(null);
  const fullscreenContainerRef = useRef<HTMLDivElement>(null);
  const [mapFullscreen, setMapFullscreen] = useState(false);

  const toggleMapFullscreen = useCallback(async () => {
    const el = fullscreenContainerRef.current;
    if (!el) return;
    try {
      if (getFullscreenElement() === el) {
        const d = document as Document & { webkitExitFullscreen?: () => Promise<void> };
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (d.webkitExitFullscreen) await d.webkitExitFullscreen();
      } else {
        const anyEl = el as HTMLElement & {
          webkitRequestFullscreen?: () => Promise<void> | void;
          mozRequestFullScreen?: () => Promise<void> | void;
        };
        if (el.requestFullscreen) await el.requestFullscreen();
        else if (anyEl.webkitRequestFullscreen) await Promise.resolve(anyEl.webkitRequestFullscreen());
        else if (anyEl.mozRequestFullScreen) await Promise.resolve(anyEl.mozRequestFullScreen());
      }
    } catch {
      /* gesto do usuário / API indisponível */
    }
  }, []);

  useEffect(() => {
    const syncFullscreen = () => {
      const root = fullscreenContainerRef.current;
      setMapFullscreen(!!root && getFullscreenElement() === root);
      window.setTimeout(() => mapRef.current?.invalidateSize(), 120);
      window.setTimeout(() => mapRef.current?.invalidateSize(), 450);
    };
    document.addEventListener("fullscreenchange", syncFullscreen);
    document.addEventListener("webkitfullscreenchange", syncFullscreen);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
      document.removeEventListener("webkitfullscreenchange", syncFullscreen);
    };
  }, []);

  useEffect(() => {
    if (!layersMenuOpen && !basemapMenuOpen) return;
    const onDocDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (layersPanelRef.current?.contains(t)) return;
      if (basemapPanelRef.current?.contains(t)) return;
      setLayersMenuOpen(false);
      setBasemapMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [layersMenuOpen, basemapMenuOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLayersMenuOpen(false);
        setBasemapMenuOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!data) return;
    setOverlayToggles((prev) => {
      const keys = data.splitByService
        ? [...(data.serviceKeys ?? [])]
        : Object.keys(data.services ?? {}).filter((k) => (data.services[k]?.length ?? 0) > 0);
      const next = { ...prev };
      if (next._boundary === undefined) next._boundary = false;
      for (const def of SUBPREFS_LOTE) {
        if (next[def.toggleKey] === undefined) next[def.toggleKey] = true;
      }
      for (const k of keys) {
        if (next[k] === undefined) next[k] = false;
      }
      return next;
    });
  }, [data]);

  const handleOverlayToggle = useCallback(
    (key: string, checked: boolean) => {
      setOverlayToggles((prev) => ({ ...prev, [key]: checked }));
      if (
        data?.splitByService &&
        key !== "_boundary" &&
        !key.startsWith("_subpref")
      ) {
        if (checked) void handleServiceAdd(key);
        else handleServiceRemove(key);
      }
    },
    [data?.splitByService, handleServiceAdd, handleServiceRemove],
  );

  const searchMarkerIcon = useMemo<Leaflet.DivIcon | null>(() => {
    if (!isMounted || !L) return null;
    const html = renderToString(
      <div className="flex h-8 w-8 items-center justify-center">
        <svg className="h-8 w-8 drop-shadow-md" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="search-pin-gradient" x1="50%" x2="50%" y1="0%" y2="100%">
              <stop offset="0%" stopColor="#f87171" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
          </defs>
          <path fill="url(#search-pin-gradient)" d="M16 29c-.58 0-1.14-.25-1.53-.68C12.9 26.61 6 18.93 6 12a10 10 0 1 1 20 0c0 6.93-6.9 14.61-8.47 16.32-.39.43-.95.68-1.53.68Z" />
          <circle cx="16" cy="12" r="4.5" fill="#fff" />
          <circle cx="16" cy="12" r="2.5" fill="#ea580c" />
        </svg>
      </div>,
    );
    return L.divIcon({
      html,
      className: "map-marker-icon search-marker-icon",
      iconSize: [32, 32],
      iconAnchor: [16, 30],
      popupAnchor: [0, -28],
    });
  }, [L, isMounted]);

  useEffect(() => {
    if (!isMounted || !mapRef.current || !L) return;
    const timer = setTimeout(() => mapRef.current?.invalidateSize(), 200);
    return () => clearTimeout(timer);
  }, [isMounted, L]);

  useEffect(() => {
    if (!isMounted) return;
    const controller = new AbortController();
    const loadBoundary = async () => {
      try {
        const response = await fetch(
          "https://raw.githubusercontent.com/tbrugz/geodata-br/master/geojson/geojs-35-mun.json",
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const geojson = (await response.json()) as GeoJSON.GeoJsonObject & {
          features?: Array<{ properties?: Record<string, unknown> }>;
        };
        if ("features" in geojson && Array.isArray(geojson.features)) {
          geojson.features = geojson.features.filter((feature) => {
            const props = feature.properties ?? {};
            const rawName =
              (props.NM_MUN as string | undefined) ??
              (props.name as string | undefined) ??
              "";
            return rawName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() === "SAO PAULO";
          });
        }
        setBoundaryData(geojson);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.warn("Falha ao carregar limite municipal:", error);
        }
      }
    };
    loadBoundary();
    return () => controller.abort();
  }, [isMounted]);

  useEffect(() => {
    if (!isMounted) return;
    const controller = new AbortController();
    const loadSubprefs = async () => {
      try {
        const response = await fetch("/subprefeituras-lote-wgs84.geojson", {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const geojson = (await response.json()) as GeoJsonFeatureCollection;
        if (geojson.type === "FeatureCollection" && Array.isArray(geojson.features)) {
          setSubprefLoteData(geojson);
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.warn("Falha ao carregar limites de subprefeituras do lote:", error);
        }
      }
    };
    void loadSubprefs();
    return () => controller.abort();
  }, [isMounted]);

  useEffect(() => {
    if (!L) return;
    const Icon = L.Icon.Default.prototype as L.Icon & { _getIconUrl?: string };
    if (Icon && !Icon._getIconUrl) {
      Icon.options.iconUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png";
      Icon.options.iconRetinaUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png";
      Icon.options.shadowUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png";
    }
  }, [L]);

  const bounds = useMemo(() => {
    if (!isMounted || !L || !data) return null;
    if (data.bounds) {
      return L.latLngBounds(
        [data.bounds.minLat, data.bounds.minLon],
        [data.bounds.maxLat, data.bounds.maxLon],
      );
    }
    return null;
  }, [data, L, isMounted]);

  boundsRef.current = bounds;

  const mapContainerRef = useCallback((instance: Leaflet.Map | null) => {
    if (instance) {
      mapRef.current = instance;
      const b = boundsRef.current;
      if (b && !initialBoundsFitDoneRef.current) {
        initialBoundsFitDoneRef.current = true;
        window.setTimeout(() => {
          const map = mapRef.current;
          const box = boundsRef.current;
          if (map && box) map.fitBounds(box, { padding: [24, 24] });
        }, 100);
      }
    } else {
      mapRef.current = null;
      initialBoundsFitDoneRef.current = false;
    }
  }, []);

  const subprefFeatureBySg = useMemo(() => {
    const m = new Map<string, GeoJsonFeature>();
    if (!subprefLoteData?.features) return m;
    for (const f of subprefLoteData.features) {
      const sg = (f.properties as { sg_subprefeitura?: string } | null)?.sg_subprefeitura;
      if (sg) m.set(sg, f);
    }
    return m;
  }, [subprefLoteData]);

  const orderedServiceKeys = useMemo(() => {
    if (!data) return [];
    const ESCALONADO_ORDER = ["MT", "GO", "BL", "VJ_VL"];
    /** Últimas camadas: NH → LM → PV → ECO */
    const TAIL_ORDER = ["NH", "LM", "PV", "ECO"];
    const sortMiddleThenTail = (keys: string[]) => {
      const tail = TAIL_ORDER.filter((k) => keys.includes(k));
      const middle = keys.filter((k) => !TAIL_ORDER.includes(k)).sort((a, b) => a.localeCompare(b));
      return [...middle, ...tail];
    };
    if (data.splitByService && data.serviceKeys?.length) {
      const keys = [...data.serviceKeys];
      const escalonados = keys
        .filter((k) => ESCALONADO_ORDER.includes(k))
        .sort((a, b) => ESCALONADO_ORDER.indexOf(a) - ESCALONADO_ORDER.indexOf(b));
      const outros = sortMiddleThenTail(keys.filter((k) => !ESCALONADO_ORDER.includes(k)));
      return [...escalonados, ...outros];
    }
    const entries = Object.entries(data.services).filter(([, f]) => f.length > 0);
    if (entries.length === 0) return [];
    const escalonados: string[] = [];
    const outros: string[] = [];
    entries.forEach(([key]) => {
      if (ESCALONADO_ORDER.includes(key)) escalonados.push(key);
      else outros.push(key);
    });
    escalonados.sort((a, b) => ESCALONADO_ORDER.indexOf(a) - ESCALONADO_ORDER.indexOf(b));
    const outrosSorted = sortMiddleThenTail(outros);
    return [...escalonados, ...outrosSorted];
  }, [data]);

  const mapCenter = useMemo(() => data?.center ?? [-23.491507, -46.610730], [data]);

  const getMarkerIcon = useCallback(
    (feature: FeatureRecord): Leaflet.DivIcon | null => {
      if (!isMounted || !L) return null;
      const legacyKey =
        feature.service_icon ?? feature.service_type_code ?? feature.service_type ?? "default";
      const faSpec = feature.service ? getServiceFaLayerSpec(feature.service) : undefined;
      const pinLabel = mapLabelBelowPin(feature);
      const cacheKey =
        pinLabel && ["ECO", "NH", "LM", "PV"].includes(feature.service)
          ? `fa-lbl:${feature.service}:${feature.id ?? feature.setor}:${pinLabel}`
          : faSpec
            ? `fa-svc:${feature.service}`
            : `leg:${legacyKey}`;
      if (!iconCache.current.has(cacheKey)) {
        const iconMeta = getServiceIconMeta(legacyKey);
        const darkPin =
          faSpec &&
          feature.service &&
          FA_LAYER_DARK_BADGE.has(feature.service);
        const pinCircle = (
          <div
            className={clsx(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border shadow-sm backdrop-blur",
              darkPin
                ? "border-slate-600 bg-slate-800/95 dark:border-slate-500 dark:bg-slate-900/95"
                : faSpec
                  ? "border-slate-200 bg-white/95 dark:border-slate-600/50 dark:bg-white/95"
                  : iconMeta.bgClass ?? "border-slate-200 bg-white/95",
            )}
          >
            <ServiceGlyphForMap serviceKey={feature.service} legacyIconKey={legacyKey} />
          </div>
        );
        const html = renderToString(
          pinLabel ? (
            <div className="flex flex-col items-center gap-0.5">
              {pinCircle}
              <span
                className="line-clamp-2 max-w-[7.25rem] whitespace-normal break-words text-center text-[10px] font-semibold leading-snug text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.95)]"
                title={pinLabel}
              >
                {pinLabel}
              </span>
            </div>
          ) : (
            pinCircle
          ),
        );
        const w = pinLabel ? 116 : 32;
        const h = pinLabel ? 52 : 32;
        iconCache.current.set(
          cacheKey,
          L.divIcon({
            html,
            className: "map-marker-icon",
            iconSize: [w, h],
            iconAnchor: [w / 2, h],
            popupAnchor: [0, -(h - 2)],
          }),
        );
      }
      return iconCache.current.get(cacheKey)!;
    },
    [L, isMounted],
  );

  const currentBaseLayer = useMemo(
    () => BASE_LAYERS.find((b) => b.id === activeBaseId) ?? BASE_LAYERS[0],
    [activeBaseId],
  );

  const wrapperClass = "relative flex flex-1 w-full flex-col overflow-hidden border-t border-slate-200 bg-black";
  const mapWrapperClass = "relative flex-1 h-full w-full bg-black";
  const mapClass = "h-full w-full bg-black";

  if (!isMounted || !L) {
    return (
      <div className={wrapperClass}>
        <div className="flex h-full w-full items-center justify-center bg-slate-100 dark:bg-slate-900">
          <div className="text-center">
            <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
            <p className="text-sm text-slate-600 dark:text-slate-400">Carregando mapa...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data && isLoadingData) {
    return (
      <div className={wrapperClass}>
        <div className="flex h-full w-full items-center justify-center bg-slate-100 dark:bg-slate-900">
          <div className="text-center">
            <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
            <p className="text-sm text-slate-600 dark:text-slate-400">Carregando dados do mapa...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={fullscreenContainerRef} className={wrapperClass}>
      {L && searchMarkerIcon && (
        <SearchBar mapRef={mapRef} L={L} searchMarkerIcon={searchMarkerIcon} />
      )}

      {searchError && (
        <div className="absolute left-6 top-6 z-[1300] max-w-md rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow dark:border-amber-500 dark:bg-amber-900/30 dark:text-amber-200">
          {searchError}
        </div>
      )}

      <div className={mapWrapperClass}>
        <MapContainer
          center={mapCenter as [number, number]}
          zoom={13}
          className={mapClass}
          style={{ width: "100%", height: "100%" }}
          preferCanvas={true}
          ref={mapContainerRef}
        >
          <ActiveBaseLayers baseId={activeBaseId} />

          {orderedServiceKeys.map((serviceKey) => {
            if (!overlayToggles[serviceKey]) return null;
            const features =
              loadedByService[serviceKey] ?? data?.services[serviceKey] ?? [];
            return (
              <ServiceLayer
                key={serviceKey}
                serviceKey={serviceKey}
                features={features}
                getMarkerIcon={getMarkerIcon}
              />
            );
          })}

          {SUBPREFS_LOTE.map((def) => {
            const feat = subprefFeatureBySg.get(def.sg);
            if (!feat || !overlayToggles[def.toggleKey]) return null;
            const singleFc: GeoJsonFeatureCollection = {
              type: "FeatureCollection",
              features: [feat],
            };
            return (
              <FeatureGroup key={def.sg}>
                <GeoJSON
                  data={singleFc}
                  style={() => ({
                    color: def.color,
                    weight: 2.5,
                    fillColor: def.color,
                    fillOpacity: 0.07,
                  })}
                  onEachFeature={(feature, layer) => {
                    const p = feature.properties as {
                      nm_subprefeitura?: string;
                    };
                    const title = p.nm_subprefeitura ?? def.label;
                    layer.bindPopup(
                      `<strong>${def.sg}</strong><br/><span style="font-size:12px">${title}</span>`,
                    );
                  }}
                />
              </FeatureGroup>
            );
          })}

          {boundaryData && overlayToggles._boundary ? (
            <FeatureGroup>
              <GeoJSON
                data={boundaryData}
                style={() => ({ color: "#374151", weight: 2.5, dashArray: "5 4", fillOpacity: 0 })}
              />
            </FeatureGroup>
          ) : null}
        </MapContainer>

        <div
          ref={layersPanelRef}
          className="pointer-events-auto absolute right-4 top-4 z-[2000] flex flex-col items-end gap-0"
        >
          <button
            type="button"
            aria-expanded={layersMenuOpen}
            aria-controls="limpebras-layers-panel"
            onClick={() => {
              setLayersMenuOpen((o) => !o);
              setBasemapMenuOpen(false);
            }}
            className="flex items-center gap-2 rounded-xl border border-slate-300/90 bg-white/95 px-3 py-2.5 text-left text-sm font-medium text-slate-900 shadow-lg backdrop-blur-md transition hover:bg-slate-50 dark:border-slate-600/50 dark:bg-slate-950/90 dark:text-slate-100 dark:hover:bg-slate-800/95"
          >
            <i className="fa-brands fa-buffer text-lg leading-none text-sky-600 dark:text-sky-400" aria-hidden />
            <span>Camadas</span>
            <i
              className={clsx(
                "fa-solid fa-chevron-down text-xs text-slate-500 transition dark:text-slate-400",
                layersMenuOpen && "rotate-180",
              )}
              aria-hidden
            />
          </button>
          {layersMenuOpen ? (
            <div
              id="limpebras-layers-panel"
              className="mt-2 w-[min(316px,calc(100vw-2rem))] max-h-[min(70vh,420px)] overflow-y-auto rounded-xl border border-slate-200/95 bg-white/95 p-3 text-slate-900 shadow-xl backdrop-blur-md [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden dark:border-slate-600/50 dark:bg-slate-950/95 dark:text-slate-100"
            >
              <div className="mb-2 border-b border-slate-200 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-600/50 dark:text-slate-400">
                Camadas
              </div>
              <ul className="space-y-1">
                {orderedServiceKeys.map((serviceKey) => {
                  const features =
                    loadedByService[serviceKey] ?? data?.services[serviceKey] ?? [];
                  const displayName =
                    data?.serviceLabels?.[serviceKey] ??
                    features[0]?.serviceDisplay ??
                    features[0]?.service ??
                    serviceKey;
                  return (
                    <li key={serviceKey}>
                      <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm text-slate-800 transition hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-700/50">
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 rounded border-slate-400 accent-sky-600 dark:border-slate-500 dark:accent-sky-500"
                          checked={!!overlayToggles[serviceKey]}
                          onChange={(e) => handleOverlayToggle(serviceKey, e.target.checked)}
                        />
                        <OverlayRowLeading serviceKey={serviceKey} sample={features[0]} />
                        <span className="min-w-0 flex-1 leading-snug">{displayName}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              {subprefLoteData && subprefLoteData.features.length > 0 ? (
                <>
                  <div className="my-2 border-t border-slate-200 dark:border-slate-600/50" />
                  <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Subprefeituras (lote)
                  </div>
                  <ul className="space-y-1">
                    {SUBPREFS_LOTE.map((def) => {
                      const hasGeom = subprefFeatureBySg.has(def.sg);
                      if (!hasGeom) return null;
                      return (
                        <li key={def.toggleKey}>
                          <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm text-slate-800 transition hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-700/50">
                            <input
                              type="checkbox"
                              className="h-4 w-4 shrink-0 rounded border-slate-400 accent-sky-600 dark:border-slate-500 dark:accent-sky-500"
                              checked={!!overlayToggles[def.toggleKey]}
                              onChange={(e) =>
                                handleOverlayToggle(def.toggleKey, e.target.checked)
                              }
                            />
                            <span
                              className={clsx(
                                "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold shadow-sm",
                                def.sg === "ST" ? "text-slate-900" : "text-white",
                              )}
                              style={{
                                borderColor: def.color,
                                backgroundColor: def.color,
                              }}
                              aria-hidden
                            >
                              {def.sg}
                            </span>
                            <span className="min-w-0 flex-1 leading-snug">{def.label}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : null}
              {boundaryData ? (
                <>
                  <div className="my-2 border-t border-slate-200 dark:border-slate-600/50" />
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm text-slate-800 transition hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-700/50">
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 rounded border-slate-400 accent-sky-600 dark:border-slate-500 dark:accent-sky-500"
                      checked={!!overlayToggles._boundary}
                      onChange={(e) => handleOverlayToggle("_boundary", e.target.checked)}
                    />
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-slate-200 dark:border-slate-500/40 dark:bg-slate-800/80">
                      <i
                        className="fa-solid fa-city text-[13px] text-slate-600 dark:text-slate-300"
                        aria-hidden
                      />
                    </span>
                    <span className="leading-snug">Limite Municipal (São Paulo)</span>
                  </label>
                </>
              ) : null}
            </div>
          ) : null}
        </div>

        <div
          ref={basemapPanelRef}
          className="pointer-events-auto absolute bottom-4 right-4 z-[2000] flex flex-col items-end"
        >
          {basemapMenuOpen ? (
            <div
              id="limpebras-basemap-panel"
              className="mb-2 w-[min(316px,calc(100vw-2rem))] max-h-[min(50vh,360px)] overflow-y-auto rounded-xl border border-slate-200/95 bg-white/95 p-2 text-slate-900 shadow-xl backdrop-blur-md dark:border-slate-600/50 dark:bg-slate-950/95 dark:text-slate-100"
            >
              <div className="mb-1 px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Mapa / visualização
              </div>
              <ul className="space-y-0.5">
                {BASE_LAYERS.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveBaseId(b.id);
                        setBasemapMenuOpen(false);
                      }}
                      className={clsx(
                        "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-slate-800 transition hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-700/55",
                        activeBaseId === b.id &&
                          "bg-sky-50 ring-1 ring-sky-300 dark:bg-sky-600/25 dark:ring-sky-500/40",
                      )}
                    >
                      <span className="text-lg leading-none" aria-hidden>
                        {b.emoji}
                      </span>
                      <span className="leading-snug">{b.label}</span>
                      {activeBaseId === b.id ? (
                        <i
                          className="fa-solid fa-check ml-auto text-xs text-sky-600 dark:text-sky-400"
                          aria-hidden
                        />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <button
            type="button"
            aria-expanded={basemapMenuOpen}
            aria-controls="limpebras-basemap-panel"
            onClick={() => {
              setBasemapMenuOpen((o) => !o);
              setLayersMenuOpen(false);
            }}
            className="flex max-w-[min(316px,calc(100vw-2rem))] items-center gap-2 rounded-xl border border-slate-300/90 bg-white/95 px-3 py-2.5 text-left text-sm font-medium text-slate-900 shadow-lg backdrop-blur-md transition hover:bg-slate-50 dark:border-slate-600/50 dark:bg-slate-950/90 dark:text-slate-100 dark:hover:bg-slate-800/95"
          >
            <span className="text-lg leading-none" aria-hidden>
              {currentBaseLayer.emoji}
            </span>
            <span className="min-w-0 truncate">{currentBaseLayer.label}</span>
            <i
              className={clsx(
                "fa-solid fa-chevron-up ml-1 shrink-0 text-xs text-slate-500 transition dark:text-slate-400",
                basemapMenuOpen && "rotate-180",
              )}
              aria-hidden
            />
          </button>
        </div>

        <button
          type="button"
          onClick={() => void toggleMapFullscreen()}
          aria-pressed={mapFullscreen}
          aria-label={mapFullscreen ? "Sair da tela cheia" : "Mapa em tela cheia"}
          title={mapFullscreen ? "Sair da tela cheia" : "Tela cheia"}
          className="pointer-events-auto absolute bottom-4 left-4 z-[2000] flex h-11 w-11 items-center justify-center rounded-xl border border-slate-300/90 bg-white/95 text-slate-800 shadow-lg backdrop-blur-md transition hover:bg-slate-50 dark:border-slate-600/50 dark:bg-slate-950/90 dark:text-slate-100 dark:hover:bg-slate-800/95"
        >
          <i
            className={clsx(
              "fa-solid text-base leading-none",
              mapFullscreen ? "fa-compress" : "fa-expand",
            )}
            aria-hidden
          />
        </button>
      </div>
    </div>
  );
}
