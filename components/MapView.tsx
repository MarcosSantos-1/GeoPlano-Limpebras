"use client";

import dynamic from "next/dynamic";
import type { FeatureCollection } from "@/lib/types";

/**
 * Leaflet/react-leaflet só existem no browser. Este wrapper garante que o
 * módulo pesado (MapViewInner) não é avaliado no SSR — evita `window is not defined`.
 */
const MapViewClient = dynamic(() => import("./MapViewInner"), {
  ssr: false,
  loading: () => null,
});

export type MapViewProps = {
  data?: FeatureCollection;
};

export function MapView({ data }: MapViewProps = {}) {
  return <MapViewClient data={data} />;
}
