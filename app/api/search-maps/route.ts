import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import type { FeatureRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

const SERVICE_KEYS = [
  "GO",
  "BL",
  "VJ_VL",
  "MT",
  "NH",
  "LM",
  "PV",
  "ECO",
  "LE",
  "CA",
  "CF_VF_LF",
  "VM",
  "VP",
];

const SERVICE_KEY_RE = /^[A-Z0-9_]+$/;

// Cache em memória dos arquivos de features por serviço
const featuresCache = new Map<string, { data: FeatureRecord[]; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutos

async function loadServiceFeatures(service: string): Promise<FeatureRecord[]> {
  if (!SERVICE_KEY_RE.test(service)) return [];
  const now = Date.now();
  const hit = featuresCache.get(service);
  if (hit && now - hit.ts < CACHE_TTL) {
    return hit.data;
  }

  const filePath = path.join(process.cwd(), "data", `features-${service}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as { features?: FeatureRecord[] };
    const features = Array.isArray(parsed.features) ? parsed.features : [];
    featuresCache.set(service, { data: features, ts: now });
    return features;
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const q = (searchParams.get("q") || "").trim();
    const servicesParam = (searchParams.get("services") || "").trim();

    if (!q || q.length < 1) {
      return NextResponse.json({ results: [] }, { status: 200 });
    }

    const targetServices = servicesParam
      ? servicesParam
          .split(",")
          .map((s) => s.trim())
          .filter((s) => SERVICE_KEY_RE.test(s))
      : SERVICE_KEYS;

    const qLower = q.toLowerCase();

    const allMatches: FeatureRecord[] = [];

    for (const serviceKey of targetServices) {
      const features = await loadServiceFeatures(serviceKey);
      for (const feature of features) {
        const nameLower = (feature.name || "").toLowerCase();
        const setorLower = (feature.setor || "").toLowerCase();
        const idLower = (feature.id || "").toLowerCase();
        const subprefLower = (feature.subprefeitura || "").toLowerCase();
        const serviceDisplayLower = (feature.serviceDisplay || "").toLowerCase();

        const matches =
          nameLower.includes(qLower) ||
          setorLower.includes(qLower) ||
          idLower.includes(qLower) ||
          subprefLower.includes(qLower) ||
          serviceDisplayLower.includes(qLower);

        if (matches) {
          allMatches.push(feature);
        }
      }
    }

    // Ordenar matches por relevância:
    // 1. Exato no setor ou name
    // 2. Termina com q (ex: 0001 em CV10500GO0001)
    // 3. Começa com q
    // 4. Outros
    allMatches.sort((a, b) => {
      const aSetorLower = (a.setor || a.name || "").toLowerCase();
      const bSetorLower = (b.setor || b.name || "").toLowerCase();

      const getScore = (val: string) => {
        if (val === qLower) return 4;
        if (val.endsWith(qLower)) return 3;
        if (val.startsWith(qLower)) return 2;
        return 1;
      };

      const scoreA = getScore(aSetorLower);
      const scoreB = getScore(bSetorLower);
      if (scoreA !== scoreB) return scoreB - scoreA;
      return aSetorLower.localeCompare(bSetorLower);
    });

    // Um resultado por setor (evita duplicar segmentos no autocomplete)
    const seenSetors = new Set<string>();
    const deduped: FeatureRecord[] = [];
    for (const feature of allMatches) {
      const key = `${feature.service}:${feature.setor || feature.name || feature.id || ""}`;
      if (seenSetors.has(key)) continue;
      seenSetors.add(key);
      deduped.push(feature);
    }

    const limited = deduped.slice(0, 50);

    return NextResponse.json(
      { results: limited },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    console.error("Erro em /api/search-maps:", error);
    return NextResponse.json(
      { error: "Erro ao buscar mapas" },
      { status: 500 },
    );
  }
}
