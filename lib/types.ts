export type FeatureRecord = {
  id?: string;
  service: string;
  serviceDisplay?: string | null;
  setor: string;
  name: string;
  subprefeitura?: string | null;
  turno?: string | null;
  frequencia?: string | null;
  cronograma?: string | null;
  logradouro?: string | null;
  service_type?: string | null;
  service_type_code?: string | null;
  service_icon?: string | null;
  coords: [number, number][];
  centroid: [number, number];
  fillColor: string;
  lineColor?: string | null;
  lineWidth?: number | null;
  geometry?: "polygon" | "line" | "point";
  volumetria?: string | null;
  address?: string | null;
  date?: string | null;
  status?: string | null;
};

export type AddressIndexEntry = {
  logradouro: string;
  normalized: string;
  centroid: [number, number];
  setor: string;
  name: string;
  subprefeitura?: string | null;
};

export type FeatureCollection = {
  version?: number;
  splitByService?: boolean;
  serviceKeys?: string[];
  serviceLabels?: Record<string, string>;
  services: Record<string, FeatureRecord[]>;
  center: [number, number];
  bounds?: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  } | null;
  addressIndex?: AddressIndexEntry[];
};
