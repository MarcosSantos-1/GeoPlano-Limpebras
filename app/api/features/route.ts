import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { loadFeatureData } from "@/lib/data";
import type { FeatureRecord } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SERVICE_KEY_RE = /^[A-Z0-9_]+$/;

let featuresCache: Awaited<ReturnType<typeof loadFeatureData>> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 10 * 60 * 1000;

const perServiceCache = new Map<string, { data: FeatureRecord[]; ts: number }>();

async function readServiceFile(service: string): Promise<FeatureRecord[] | null> {
  const safe = SERVICE_KEY_RE.test(service) ? service : null;
  if (!safe) {
    return null;
  }
  const filePath = path.join(process.cwd(), "data", `features-${safe}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as { service?: string; features?: FeatureRecord[] };
    if (Array.isArray(parsed.features)) {
      return parsed.features;
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const service = request.nextUrl.searchParams.get("service");

    if (service) {
      if (!SERVICE_KEY_RE.test(service)) {
        return NextResponse.json({ error: "Invalid service key" }, { status: 400 });
      }
      const now = Date.now();
      const hit = perServiceCache.get(service);
      if (hit && now - hit.ts < CACHE_TTL) {
        return NextResponse.json(
          { service, features: hit.data },
          {
            headers: {
              "Cache-Control": "public, s-maxage=600, stale-while-revalidate=300",
              "Content-Type": "application/json",
            },
          },
        );
      }
      const features = await readServiceFile(service);
      if (!features) {
        return NextResponse.json({ error: "Service data not found" }, { status: 404 });
      }
      perServiceCache.set(service, { data: features, ts: now });
      return NextResponse.json(
        { service, features },
        {
          headers: {
            "Cache-Control": "public, s-maxage=600, stale-while-revalidate=300",
            "Content-Type": "application/json",
          },
        },
      );
    }

    const now = Date.now();
    if (featuresCache && now - cacheTimestamp < CACHE_TTL) {
      return NextResponse.json(featuresCache, {
        headers: {
          "Cache-Control": "public, s-maxage=600, stale-while-revalidate=300",
          "Content-Type": "application/json",
        },
      });
    }

    const data = await loadFeatureData();
    featuresCache = data;
    cacheTimestamp = now;

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=300",
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Erro ao carregar features:", error);
    return NextResponse.json({ error: "Erro ao carregar dados" }, { status: 500 });
  }
}
