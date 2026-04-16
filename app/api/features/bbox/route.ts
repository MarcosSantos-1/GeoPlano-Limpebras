import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Placeholder for viewport queries backed by PostGIS (Neon / Supabase).
 * When `DATABASE_URL` is configured and segments are ingested, replace this
 * handler with `ST_Intersects(geom, ST_MakeEnvelope(...))` + GiST index.
 */
export async function GET(request: NextRequest) {
  const hasDb = Boolean(process.env.DATABASE_URL);
  if (!hasDb) {
    return NextResponse.json(
      {
        error: "PostGIS not configured",
        hint: "Set DATABASE_URL and apply schema from docs/postgis-setup.md",
        params: Object.fromEntries(request.nextUrl.searchParams),
      },
      { status: 501 },
    );
  }

  return NextResponse.json(
    {
      error: "PostGIS stub",
      hint: "Implement SQL query using minLon,minLat,maxLon,maxLat and service filter",
    },
    { status: 501 },
  );
}
