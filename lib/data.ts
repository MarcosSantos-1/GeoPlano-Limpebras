import { promises as fs } from "fs";
import path from "path";
import type { FeatureCollection } from "./types";

const DEFAULT_DATA_PATH = path.join(process.cwd(), "data", "features.json");
const MANIFEST_PATH = path.join(process.cwd(), "data", "features-manifest.json");
const SAMPLE_DATA_PATH = path.join(process.cwd(), "data", "features.sample.json");

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

const EMPTY: FeatureCollection = {
  services: {},
  center: [-23.491507, -46.610730],
  bounds: null,
  addressIndex: [],
};

/**
 * Carga inicial leve: manifest (center/bounds/lista de serviços) ou JSON completo legado.
 * Geometrias por serviço vêm de /api/features?service=... no cliente (lazy).
 */
export async function loadFeatureData(): Promise<FeatureCollection> {
  const explicit = process.env.FEATURES_JSON_PATH;
  const primaryPath = explicit ?? DEFAULT_DATA_PATH;

  const fromPrimary = await readJsonFile<FeatureCollection>(primaryPath);
  if (fromPrimary) {
    const { addressIndex, ...rest } = fromPrimary as FeatureCollection & {
      addressIndex?: unknown;
    };
    if (rest.splitByService && rest.serviceKeys?.length) {
      return {
        ...rest,
        services: rest.services ?? {},
        addressIndex: [],
      };
    }
    return {
      ...rest,
      addressIndex: [],
    };
  }

  const manifest = await readJsonFile<FeatureCollection>(MANIFEST_PATH);
  if (manifest?.splitByService && manifest.serviceKeys?.length) {
    return {
      ...manifest,
      services: {},
      addressIndex: [],
    };
  }

  const sample = await readJsonFile<FeatureCollection>(SAMPLE_DATA_PATH);
  if (sample) {
    const { addressIndex, ...rest } = sample;
    return { ...rest, addressIndex: [] };
  }

  return EMPTY;
}
