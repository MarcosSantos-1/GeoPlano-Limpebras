"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import L from "leaflet";
import type { FlipSacMapPoint } from "@/components/FlipSacMap";

const DEFAULT_CENTER: LatLngExpression = [-23.535, -46.575];

function FitPoints({ points }: { points: FlipSacMapPoint[] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lon]));
    if (!bounds.isValid()) return;
    map.fitBounds(bounds, {
      animate: false,
      maxZoom: 16,
      padding: [36, 36],
    });
  }, [map, points]);

  return null;
}

export default function FlipSacMapInner({ points }: { points: FlipSacMapPoint[] }) {
  const [isDark, setIsDark] = useState(false);
  const [query, setQuery] = useState("");
  const filteredPoints = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    if (!needle) return points;
    return points.filter((point) => (
      point.id.toLocaleLowerCase("pt-BR").includes(needle) ||
      point.service.toLocaleLowerCase("pt-BR").includes(needle) ||
      point.address.toLocaleLowerCase("pt-BR").includes(needle) ||
      point.regional.toLocaleLowerCase("pt-BR").includes(needle)
    ));
  }, [points, query]);
  const center = useMemo<LatLngExpression>(() => {
    const first = filteredPoints[0];
    return first ? [first.lat, first.lon] : DEFAULT_CENTER;
  }, [filteredPoints]);

  useEffect(() => {
    const syncTheme = () => {
      setIsDark(document.documentElement.classList.contains("dark"));
    };
    syncTheme();
    window.addEventListener("themechange", syncTheme);
    return () => window.removeEventListener("themechange", syncTheme);
  }, []);

  return (
    <div className="relative h-[560px] overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950">
      {points.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center px-6 text-center text-zinc-500 dark:text-zinc-400">
          <i className="fa-solid fa-location-dot text-3xl text-zinc-300 dark:text-zinc-600" aria-hidden />
          <p className="mt-3 text-sm font-semibold">Nenhuma coordenada válida para mostrar no mapa.</p>
          <p className="mt-1 text-xs">Confira se a planilha possui latitude/longitude na coluna de coordenadas.</p>
        </div>
      ) : (
        <>
          <div className="pointer-events-none absolute left-4 right-4 top-4 z-[500] sm:left-5 sm:right-auto sm:w-[420px]">
            <label className="pointer-events-auto flex h-12 items-center gap-3 rounded-lg border border-zinc-200 bg-white/95 px-4 text-sm text-zinc-900 shadow-lg backdrop-blur-md dark:border-zinc-700 dark:bg-zinc-950/95 dark:text-zinc-100">
              <i className="fa-solid fa-magnifying-glass text-zinc-400" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar SAC, serviço, endereço ou regional"
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-zinc-400"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  aria-label="Limpar busca"
                >
                  <i className="fa-solid fa-xmark" aria-hidden />
                </button>
              ) : null}
            </label>
            <div className="pointer-events-auto mt-2 inline-flex rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-zinc-600 shadow-md backdrop-blur-md dark:bg-zinc-950/95 dark:text-zinc-300">
              {filteredPoints.length} de {points.length} pontos
            </div>
          </div>
          <MapContainer center={center} zoom={13} className="h-full w-full" scrollWheelZoom>
          <TileLayer
            key={isDark ? "carto-dark" : "carto-light"}
            attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
            url={
              isDark
                ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            }
          />
          <FitPoints points={filteredPoints} />
          {filteredPoints.map((point) => (
            <CircleMarker
              key={point.id}
              center={[point.lat, point.lon]}
              radius={7}
              pathOptions={{
                color: "#0369a1",
                fillColor: "#0ea5e9",
                fillOpacity: 0.85,
                opacity: 0.95,
                weight: 2,
              }}
            >
              <Popup>
                <div className="min-w-[220px] space-y-2 text-sm">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">SAC</p>
                    <p className="font-semibold text-slate-950">{point.id}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Serviço</p>
                    <p className="text-slate-800">{point.service}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Endereço</p>
                    <p className="text-slate-800">{point.address}</p>
                  </div>
                  <p className="text-xs font-medium text-slate-500">{point.regional}</p>
                </div>
              </Popup>
            </CircleMarker>
          ))}
          </MapContainer>
        </>
      )}
    </div>
  );
}
