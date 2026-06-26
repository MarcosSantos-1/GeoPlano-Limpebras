"use client";

import dynamic from "next/dynamic";

export type FlipSacMapPoint = {
  id: string;
  service: string;
  address: string;
  regional: string;
  lat: number;
  lon: number;
};

const FlipSacMapClient = dynamic(() => import("./FlipSacMapInner"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[560px] items-center justify-center rounded-lg border border-zinc-200 bg-zinc-100 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
      Carregando mapa dos SACs...
    </div>
  ),
});

export function FlipSacMap({ points }: { points: FlipSacMapPoint[] }) {
  return <FlipSacMapClient points={points} />;
}
