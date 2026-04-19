/**
 * Lê public/geoportal_subprefeitura_v2.geojson (EPSG:31983), filtra o lote
 * (CV / JT / MG / ST) e grava public/subprefeituras-lote-wgs84.geojson (WGS84, GeoJSON padrão lon,lat).
 */
const fs = require("fs");
const path = require("path");
const proj4 = require("proj4");

const SRC = path.join(__dirname, "..", "public", "geoportal_subprefeitura_v2.geojson");
const OUT = path.join(__dirname, "..", "public", "subprefeituras-lote-wgs84.geojson");
const LOT = new Set(["CV", "JT", "MG", "ST"]);

proj4.defs(
  "EPSG:31983",
  "+proj=utm +zone=23 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
);

function ring31983To4326(ring) {
  return ring.map(([e, n]) => {
    const [lon, lat] = proj4("EPSG:31983", "WGS84", [e, n]);
    return [lon, lat];
  });
}

function transformGeometry(geom) {
  if (geom.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: geom.coordinates.map(ring31983To4326),
    };
  }
  if (geom.type === "MultiPolygon") {
    return {
      type: "MultiPolygon",
      coordinates: geom.coordinates.map((poly) => poly.map(ring31983To4326)),
    };
  }
  throw new Error(`Geometria não suportada: ${geom.type}`);
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.warn("extract-subprefeituras-lote: arquivo de origem não encontrado, ignorando:", SRC);
    return;
  }
  const raw = JSON.parse(fs.readFileSync(SRC, "utf8"));
  const features = (raw.features || [])
    .filter((f) => LOT.has(f.properties?.sg_subprefeitura))
    .map((f) => ({
      type: "Feature",
      properties: {
        sg_subprefeitura: f.properties.sg_subprefeitura,
        nm_subprefeitura: f.properties.nm_subprefeitura,
      },
      geometry: transformGeometry(f.geometry),
    }));
  const out = { type: "FeatureCollection", features };
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(
    `extract-subprefeituras-lote: gravado ${OUT} (${features.length} subprefeituras).`,
  );
}

main();
