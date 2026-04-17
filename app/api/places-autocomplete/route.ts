import { NextRequest, NextResponse } from "next/server";

/** Centro aproximado de São Paulo (capital) para viés de resultados. */
const SP_CENTER = { latitude: -23.55, longitude: -46.633 };

export type PlacesAutocompleteItem = {
  logradouro: string;
  name: string;
  placeId: string;
  setor: string;
  subprefeitura: null;
  source: "google";
};

/**
 * Proxy para Places API (New) — Autocomplete.
 * Requer GOOGLE_MAPS_API_KEY no servidor e "Places API (New)" habilitada no projeto.
 */
export async function GET(request: NextRequest) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return NextResponse.json({ results: [] as PlacesAutocompleteItem[] }, { status: 200 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ results: [] as PlacesAutocompleteItem[] }, { status: 200 });
  }

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text",
      },
      body: JSON.stringify({
        input: q,
        languageCode: "pt-BR",
        includedRegionCodes: ["br"],
        regionCode: "br",
        locationBias: {
          circle: {
            center: SP_CENTER,
            radius: 45000,
          },
        },
      }),
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn("places-autocomplete HTTP", res.status, errText.slice(0, 500));
      return NextResponse.json({ results: [] as PlacesAutocompleteItem[] }, { status: 200 });
    }

    const data = (await res.json()) as {
      suggestions?: Array<{
        placePrediction?: {
          placeId?: string;
          text?: { text?: string };
        };
      }>;
    };

    const raw = data.suggestions ?? [];
    const results: PlacesAutocompleteItem[] = [];
    for (const s of raw) {
      const p = s.placePrediction;
      if (!p?.placeId) continue;
      const text = p.text?.text?.trim() || q;
      results.push({
        logradouro: text,
        name: text,
        placeId: p.placeId,
        setor: "",
        subprefeitura: null,
        source: "google",
      });
      if (results.length >= 8) break;
    }

    return NextResponse.json(
      { results },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, max-age=0, must-revalidate",
        },
      },
    );
  } catch (e) {
    console.warn("places-autocomplete", e);
    return NextResponse.json({ results: [] as PlacesAutocompleteItem[] }, { status: 200 });
  }
}
