import { NextRequest, NextResponse } from "next/server";

/**
 * Geocoding API — texto livre → coordenadas (fallback do botão Buscar).
 * Requer GOOGLE_MAPS_API_KEY e "Geocoding API" habilitada.
 */
export async function GET(request: NextRequest) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return NextResponse.json({ results: [] }, { status: 200 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ results: [] }, { status: 200 });
  }

  const address = `${q}, São Paulo, SP, Brasil`;
  const params = new URLSearchParams({
    address,
    key,
    region: "br",
    language: "pt-BR",
    components: "country:BR|administrative_area:SP",
  });

  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`, {
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      return NextResponse.json({ results: [] }, { status: 200 });
    }
    const data = (await res.json()) as {
      status: string;
      results?: Array<{
        formatted_address?: string;
        geometry?: { location?: { lat: number; lng: number } };
      }>;
    };

    if (data.status !== "OK" || !data.results?.length) {
      return NextResponse.json({ results: [] }, { status: 200 });
    }

    const top = data.results[0];
    const loc = top.geometry?.location;
    if (!loc) {
      return NextResponse.json({ results: [] }, { status: 200 });
    }

    return NextResponse.json(
      {
        results: [
          {
            logradouro: top.formatted_address ?? q,
            centroid: [loc.lat, loc.lng] as [number, number],
            setor: "",
            name: top.formatted_address ?? q,
            subprefeitura: null as string | null,
            source: "google_geocode" as const,
          },
        ],
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, max-age=0, must-revalidate",
        },
      },
    );
  } catch (e) {
    console.warn("google-geocode", e);
    return NextResponse.json({ results: [] }, { status: 200 });
  }
}
