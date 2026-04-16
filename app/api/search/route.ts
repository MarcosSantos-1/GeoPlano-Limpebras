import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const ADDRESS_INDEX_PATH = path.join(process.cwd(), "data", "addressIndex.json");

// Cache em memória para evitar ler o arquivo múltiplas vezes
let addressIndexCache: Array<{
  logradouro: string;
  normalized: string;
  centroid: [number, number];
  setor: string;
  name: string;
  subprefeitura?: string | null;
}> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function loadAddressIndex(): Promise<Array<{
  logradouro: string;
  normalized: string;
  centroid: [number, number];
  setor: string;
  name: string;
  subprefeitura?: string | null;
}>> {
  const now = Date.now();
  
  // Retorna cache se ainda válido
  if (addressIndexCache && (now - cacheTimestamp) < CACHE_TTL) {
    return addressIndexCache;
  }

  try {
    const fileContent = await fs.readFile(ADDRESS_INDEX_PATH, "utf-8");
    const parsed = JSON.parse(fileContent) as Array<{
      logradouro: string;
      normalized: string;
      centroid: [number, number];
      setor: string;
      name: string;
      subprefeitura?: string | null;
    }>;
    addressIndexCache = parsed;
    cacheTimestamp = now;
    return parsed;
  } catch (error) {
    console.error("Erro ao carregar índice de endereços:", error);
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("q");

    if (!query || query.length < 2) {
      return NextResponse.json({ results: [] }, { status: 200 });
    }

    // Carrega índice de endereços (com cache)
    const addressIndex = await loadAddressIndex();

    // Busca nos endereços (otimizada)
    const normalizedQuery = normalizeText(query);
    const queryWords = normalizedQuery.split(" ").filter((w) => w.length > 0);
    
    // Filtra endereços que contêm todas as palavras da query
    const results = addressIndex
      .filter((addr) => {
        // Verifica se todas as palavras da query estão no endereço normalizado
        return queryWords.every((word) => addr.normalized.includes(word));
      })
      .slice(0, 10) // Limita a 10 resultados
      .map((addr) => ({
        logradouro: addr.logradouro,
        centroid: addr.centroid,
        setor: addr.setor,
        name: addr.name,
        subprefeitura: addr.subprefeitura,
      }));

    return NextResponse.json(
      { results },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (error) {
    console.error("Erro na busca:", error);
    return NextResponse.json(
      { error: "Erro ao processar busca" },
      { status: 500 }
    );
  }
}

