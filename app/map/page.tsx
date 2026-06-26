import { MapView } from "@/components/MapView";
import { AppHeader } from "@/components/AppHeader";
import { loadFeatureData } from "@/lib/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MapPage() {
  const initialData = await loadFeatureData();
  return (
    <main className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white dark:bg-zinc-900">
      <AppHeader compact />

      <div className="flex flex-1 bg-white dark:bg-slate-900">
        <MapView data={initialData} />
      </div>
    </main>
  );
}
