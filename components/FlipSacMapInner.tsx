"use client";

import { useEffect, useMemo } from "react";
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
  const center = useMemo<LatLngExpression>(() => {
    const first = points[0];
    return first ? [first.lat, first.lon] : DEFAULT_CENTER;
  }, [points]);

  return (
    <div className="h-[420px] overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950">
      {points.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center px-6 text-center text-zinc-500 dark:text-zinc-400">
          <i className="fa-solid fa-location-dot text-3xl text-zinc-300 dark:text-zinc-600" aria-hidden />
          <p className="mt-3 text-sm font-semibold">Nenhuma coordenada válida para mostrar no mapa.</p>
          <p className="mt-1 text-xs">Confira se a planilha possui latitude/longitude na coluna de coordenadas.</p>
        </div>
      ) : (
        <MapContainer center={center} zoom={13} className="h-full w-full" scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitPoints points={points} />
          {points.map((point) => (
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
      )}
    </div>
  );
}
