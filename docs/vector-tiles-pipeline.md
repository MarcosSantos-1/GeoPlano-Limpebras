# Vector tiles (PMTiles / MBTiles) — máxima performance

Quando o volume de geometrias crescer de novo, a solução mais escalável é **servir tiles vetoriais** em vez de JSON grande: o navegador só baixa o que está visível no zoom atual.

## 1. Export GeoJSON

A partir dos `features-*.json` ou direto do pipeline Python, gere um arquivo GeoJSON com `LineString` / `Polygon` por feature (uma geometria por registro).

## 2. tippecanoe (Mapbox)

Instale [tippecanoe](https://github.com/felt/tippecanoe) e gere um `.mbtiles`:

```bash
tippecanoe -o limpebras.mbtiles -Z10 -z16 -Bg --drop-densest-as-needed plano.geojson
```

- Ajuste `-Z` / `-z` ao zoom útil do seu público.
- `--drop-densest-as-needed` ajuda em linhas muito densas.

## 3. PMTiles (opcional)

Converta MBTiles → PMTiles com [pmtiles](https://github.com/protomaps/PMTiles) para hospedar um único arquivo estático em CDN.

## 4. Cliente de mapa

- **MapLibre GL** + fonte `pmtiles://` ou URL de tiles XYZ.
- Ou **Leaflet** com `leaflet.vectorgrid` apontando para serviço de tiles gerado a partir do MBTiles.

## 5. Atributos

Inclua nos tiles propriedades mínimas (`setor`, `name`, `service`) e monte o popup no cliente a partir delas (mesma ideia do `buildPopupHtml` atual).
