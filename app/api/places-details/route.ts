import { NextRequest, NextResponse } from "next/server";

/**
 * Place Details (New) — retorna lat/lng e endereço formatado.
 * Requer GOOGLE_MAPS_API_KEY e "Places API (New)".
 */
export async function GET(request: NextRequest) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  const placeId = request.nextUrl.searchParams.get("placeId")?.trim();
  if (!key || !placeId) {
    return NextResponse.json({ error: "missing_key_or_place" }, { status: 400 });
  }

  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;

  try {
    const res = await fetch(url, {
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "location,formattedAddress,displayName",
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn("places-details HTTP", res.status, errText.slice(0, 400));
      return NextResponse.json({ error: "upstream" }, { status: 502 });
    }

    const data = (await res.json()) as {
      location?: { latitude?: number; longitude?: number };
      formattedAddress?: string;
      displayName?: { text?: string };
    };

    const lat = data.location?.latitude;
    const lng = data.location?.longitude;
    if (typeof lat !== "number" || typeof lng !== "number") {
      return NextResponse.json({ error: "no_location" }, { status: 404 });
    }

    const formatted =
      data.formattedAddress ?? data.displayName?.text ?? placeId;

    return NextResponse.json(
      { lat, lng, formattedAddress: formatted },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, max-age=3600",
        },
      },
    );
  } catch (e) {
    console.warn("places-details", e);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
