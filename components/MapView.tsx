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
  LayersControl,
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import clsx from "clsx";
import { renderToString } from "react-dom/server";
import { getServiceIconMeta } from "@/lib/serviceIcons";
import { buildPopupHtml } from "@/lib/popupBuilder";
import type { GeoJsonObject } from "geojson";
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

const { BaseLayer, Overlay } = LayersControl;

const MARKER_ON_LINE_SERVICES = new Set(["CA", "CF_VF_LF"]);

function overlayControlName(serviceKey: string, htmlLabel: string): string {
  return `<!--limpebras:${serviceKey}-->${htmlLabel}`;
}

function parseServiceFromOverlayName(name: string): string | null {
  const m = name.match(/<!--limpebras:([\w_]+)-->/);
  return m ? m[1] : null;
}

function OverlayLifecycle({
  splitByService,
  onServiceAdd,
  onServiceRemove,
}: {
  splitByService: boolean;
  onServiceAdd: (serviceKey: string) => void;
  onServiceRemove: (serviceKey: string) => void;
}) {
  const map = useMap();
  useEffect(() => {
    const onAdd = (e: Leaflet.LeafletEvent & { name?: string }) => {
      const key = parseServiceFromOverlayName(String(e.name ?? ""));
      if (!key || key === "_boundary") return;
      if (splitByService) onServiceAdd(key);
    };
    const onRemove = (e: Leaflet.LeafletEvent & { name?: string }) => {
      const key = parseServiceFromOverlayName(String(e.name ?? ""));
      if (!key || key === "_boundary") return;
      if (splitByService) onServiceRemove(key);
    };
    map.on("overlayadd", onAdd);
    map.on("overlayremove", onRemove);
    return () => {
      map.off("overlayadd", onAdd);
      map.off("overlayremove", onRemove);
    };
  }, [map, splitByService, onServiceAdd, onServiceRemove]);
  return null;
}

function getPopupHtml(feature: FeatureRecord): string {
  return buildPopupHtml(feature);
}

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
  const [suggestions, setSuggestions] = useState<Array<{
    logradouro: string;
    centroid: [number, number];
    setor: string;
    name: string;
    subprefeitura?: string | null;
  }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchMarkerRef = useRef<Leaflet.Marker | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) throw new Error("Erro na busca");
        const data = await response.json();
        setSuggestions(data.results || []);
        setShowSuggestions((data.results || []).length > 0);
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
      }));
    } catch {
      return [];
    }
  };

  const selectAddress = useCallback(
    async (address: (typeof suggestions)[0]) => {
      if (!mapRef.current || !L) return;
      const destination = L.latLng(address.centroid[0], address.centroid[1]);
      const map = mapRef.current;
      map.setView(destination, 18, { animate: true, duration: 0.75 });
      if (searchMarkerRef.current) {
        map.removeLayer(searchMarkerRef.current);
        searchMarkerRef.current = null;
      }
      if (searchMarkerIcon) {
        const marker = L.marker(destination, { icon: searchMarkerIcon }).addTo(map);
        const popupText = address.subprefeitura
          ? `${address.logradouro} - ${address.subprefeitura}`
          : address.logradouro;
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
      selectAddress(suggestions[selectedIndex]);
      return;
    }
    if (suggestions.length > 0) {
      selectAddress(suggestions[0]);
      return;
    }
    setIsSearching(true);
    try {
      const nominatimResults = await searchNominatim(query);
      if (nominatimResults.length > 0) {
        selectAddress(nominatimResults[0]);
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
    <div className="absolute left-6 top-6 z-[1000] w-[400px]" style={{ marginLeft: "60px" }}>
      <form onSubmit={handleSubmit} className="relative">
        <div className="flex items-center gap-2 rounded-lg border-2 border-slate-300 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-800">
          <input
            ref={inputRef}
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (suggestions.length > 0) setShowSuggestions(true);
            }}
            onBlur={() => {
              const root = inputRef.current;
              window.setTimeout(() => {
                const active = document.activeElement;
                if (!root || !active || !root.contains(active)) {
                  setShowSuggestions(false);
                }
              }, 200);
            }}
            placeholder="Pesquisar endereço (ex: av ede 156)..."
            className="flex-1 rounded-md border-none bg-transparent px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-0 dark:text-slate-200 dark:placeholder:text-slate-400"
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={isSearching || !searchQuery.trim()}
            className="mr-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white uppercase tracking-wide shadow hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSearching ? "..." : "Buscar"}
          </button>
        </div>

        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute left-0 top-full z-[1001] mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-300 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-800">
            <ul className="py-1">
              {suggestions.map((suggestion, index) => (
                <li key={`${suggestion.logradouro}-${index}`}>
                  <button
                    type="button"
                    onClick={() => {
                      selectAddress(suggestion);
                      inputRef.current?.blur();
                    }}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={clsx(
                      "w-full px-4 py-3 text-left text-sm transition-colors",
                      index === selectedIndex
                        ? "bg-primary/20 text-primary dark:bg-primary/30 dark:text-blue-400"
                        : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700",
                    )}
                  >
                    <div className="font-medium">{suggestion.logradouro}</div>
                    {suggestion.subprefeitura && (
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {suggestion.subprefeitura}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {isSearching && searchQuery.trim().length >= 2 && (
          <div className="absolute left-0 top-full z-[1001] mt-1 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-500 shadow-lg dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400">
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

  const showLineMarkers = MARKER_ON_LINE_SERVICES.has(serviceKey);

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
          >
            <Popup>
              <div dangerouslySetInnerHTML={{ __html: getPopupHtml(feature) }} />
            </Popup>
          </Polyline>
        );
      })}

      {showLineMarkers &&
        lineFeatures.map((feature) => (
          <Marker
            key={`${feature.id ?? feature.setor}-lm`}
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
export function MapView({ data: initialData }: MapViewProps = {}) {
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
  const iconCache = useRef<Map<string, Leaflet.DivIcon>>(new Map());
  const [boundaryData, setBoundaryData] = useState<GeoJsonObject | null>(null);
  const [searchError] = useState<string | null>(null);

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

  const orderedServiceKeys = useMemo(() => {
    if (!data) return [];
    const ESCALONADO_ORDER = ["MT", "GO", "BL", "VJ_VL"];
    if (data.splitByService && data.serviceKeys?.length) {
      const keys = [...data.serviceKeys];
      const escalonados = keys
        .filter((k) => ESCALONADO_ORDER.includes(k))
        .sort((a, b) => ESCALONADO_ORDER.indexOf(a) - ESCALONADO_ORDER.indexOf(b));
      const outros = keys
        .filter((k) => !ESCALONADO_ORDER.includes(k))
        .sort((a, b) => a.localeCompare(b));
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
    outros.sort((a, b) => a.localeCompare(b));
    return [...escalonados, ...outros];
  }, [data]);

  const mapCenter = useMemo(() => data?.center ?? [-23.491507, -46.610730], [data]);

  const getMarkerIcon = useCallback(
    (feature: FeatureRecord): Leaflet.DivIcon | null => {
      if (!isMounted || !L) return null;
      const key = feature.service_icon ?? feature.service_type_code ?? feature.service_type ?? "default";
      if (!iconCache.current.has(key)) {
        const iconMeta = getServiceIconMeta(key);
        const html = renderToString(
          <div className={clsx("flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 shadow-sm backdrop-blur", iconMeta.bgClass ?? "bg-white/95")}>
            {iconMeta.element}
          </div>,
        );
        iconCache.current.set(
          key,
          L.divIcon({
            html,
            className: "map-marker-icon",
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -30],
          }),
        );
      }
      return iconCache.current.get(key)!;
    },
    [L, isMounted],
  );

  const renderBaseLayerLabel = useCallback(
    (icon: string, label: string) =>
      renderToString(
        <span className="layer-label-text">
          <span className="layer-label-emoji">{icon}</span>
          <span>{label}</span>
        </span>,
      ),
    [],
  );

  const renderOverlayLabel = useCallback(
    (serviceKey: string, displayName: string, sample?: FeatureRecord) => {
      const iconKey = sample?.service_icon ?? sample?.service_type_code ?? sample?.service_type ?? serviceKey;
      const iconMeta = getServiceIconMeta(iconKey);
      return renderToString(
        <span className="layer-label-text">
          <span className={clsx("layer-service-icon", iconMeta.bgClass ?? "bg-white")}>
            {iconMeta.element}
          </span>
          <span>{displayName}</span>
        </span>,
      );
    },
    [],
  );

  const wrapperClass = "relative flex flex-1 w-full flex-col overflow-hidden border-t border-slate-200 bg-black";
  const mapWrapperClass = "flex-1 h-full w-full bg-black";
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
    <div className={wrapperClass}>
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
          ref={(instance) => {
            if (instance) {
              mapRef.current = instance;
              if (bounds) {
                setTimeout(() => {
                  if (instance && bounds) instance.fitBounds(bounds, { padding: [24, 24] });
                }, 100);
              }
            }
          }}
        >
          <LayersControl position="topright" collapsed={false}>
            <BaseLayer checked name={renderBaseLayerLabel("🛰️", "Satélite + Ruas (Esri)")}>
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
            </BaseLayer>

            <BaseLayer name={renderBaseLayerLabel("🛰️", "Satélite (Esri)")}>
              <TileLayer
                attribution='Imagery &copy; <a href="https://www.esri.com/">Esri</a>'
                url="https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              />
            </BaseLayer>

            <BaseLayer name={renderBaseLayerLabel("🗺️", "OpenStreetMap")}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
            </BaseLayer>

            <BaseLayer name={renderBaseLayerLabel("🗺️", "CartoDB Positron")}>
              <TileLayer
                attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              />
            </BaseLayer>

            <BaseLayer name={renderBaseLayerLabel("🌑", "CartoDB Dark Matter")}>
              <TileLayer
                attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              />
            </BaseLayer>

            <BaseLayer name={renderBaseLayerLabel("🏔️", "Stamen Terrain")}>
              <TileLayer
                attribution='Map tiles by <a href="http://stamen.com">Stamen Design</a>'
                url="https://stamen-tiles-{s}.a.ssl.fastly.net/terrain/{z}/{x}/{y}{r}.png"
              />
            </BaseLayer>

            {orderedServiceKeys.map((serviceKey) => {
              const features =
                loadedByService[serviceKey] ?? data?.services[serviceKey] ?? [];
              const displayName =
                data?.serviceLabels?.[serviceKey] ??
                features[0]?.serviceDisplay ??
                features[0]?.service ??
                serviceKey;
              const labelHtml = renderOverlayLabel(serviceKey, displayName, features[0]);
              return (
                <Overlay
                  key={serviceKey}
                  name={overlayControlName(serviceKey, labelHtml)}
                >
                  <ServiceLayer
                    serviceKey={serviceKey}
                    features={features}
                    getMarkerIcon={getMarkerIcon}
                  />
                </Overlay>
              );
            })}

            {boundaryData && (
              <Overlay
                key="boundary"
                name={overlayControlName(
                  "_boundary",
                  renderOverlayLabel("boundary", "Limite Municipal (São Paulo)", undefined),
                )}
                checked
              >
                <FeatureGroup>
                  <GeoJSON
                    data={boundaryData}
                    style={() => ({ color: "#374151", weight: 2.5, dashArray: "5 4", fillOpacity: 0 })}
                  />
                </FeatureGroup>
              </Overlay>
            )}
          </LayersControl>
          {data?.splitByService ? (
            <OverlayLifecycle
              splitByService
              onServiceAdd={handleServiceAdd}
              onServiceRemove={handleServiceRemove}
            />
          ) : null}
        </MapContainer>
      </div>

      <style jsx global>{`
        .leaflet-control-layers {
          background: rgba(17, 24, 39, 0.88);
          border-radius: 14px;
          border: 1px solid rgba(148, 163, 184, 0.35);
          box-shadow: 0 18px 40px -24px rgba(15, 23, 42, 0.65);
          backdrop-filter: blur(6px);
          color: #f8fafc;
        }
        .leaflet-control-layers-expanded {
          padding: 12px 16px;
          width: 260px;
        }
        .leaflet-control-layers-list {
          overflow-y: auto;
          max-height: 320px;
          padding-right: 2px;
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .leaflet-control-layers-list::-webkit-scrollbar { display: none; }
        .leaflet-control-layers-base label,
        .leaflet-control-layers-overlays label {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 4px 0;
          padding: 6px 8px;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.15s ease, transform 0.15s ease;
        }
        .leaflet-control-layers-base label:hover,
        .leaflet-control-layers-overlays label:hover {
          background: rgba(148, 163, 184, 0.15);
          transform: translateX(2px);
        }
        .layer-label-text {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          color: #f8fafc;
          font-size: 0.85rem;
          line-height: 1.1;
        }
        .layer-label-emoji {
          display: inline-flex;
          font-size: 1.2rem;
          line-height: 1;
        }
        .layer-service-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 1.75rem;
          height: 1.75rem;
          border-radius: 999px;
          border: 1px solid rgba(148, 163, 184, 0.4);
          overflow: hidden;
        }
        .layer-service-icon svg { width: 1rem; height: 1rem; }
        .leaflet-control-layers-selector {
          transform: scale(1.05);
          margin-right: 6px;
          accent-color: #2563eb;
        }
        .leaflet-control-layers-separator {
          border-top: 1px solid rgba(148, 163, 184, 0.35);
          margin: 10px -4px;
        }
      `}</style>
    </div>
  );
}
