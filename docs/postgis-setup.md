# PostGIS (Neon / Supabase) — consulta por viewport

Use este caminho quando `/api/features?service=…` ainda for pesado demais (muitos segmentos num único serviço). A ideia é guardar cada **segmento** como uma `LINESTRING` e devolver só o que cruza o retângulo do mapa.

## 1. Extensão

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

## 2. Tabela sugerida

```sql
CREATE TABLE map_segments (
  id BIGSERIAL PRIMARY KEY,
  service TEXT NOT NULL,
  setor TEXT NOT NULL,
  name TEXT,
  props JSONB NOT NULL DEFAULT '{}',
  geom geometry(LineString, 4326) NOT NULL
);

CREATE INDEX map_segments_geom_gix ON map_segments USING GIST (geom);
CREATE INDEX map_segments_service_idx ON map_segments (service);
```

## 3. Exemplo de query (bbox)

Parâmetros: `minLon`, `minLat`, `maxLon`, `maxLat`, `service` (opcional).

```sql
SELECT id, service, setor, name, props, ST_AsGeoJSON(geom)::json AS geom
FROM map_segments
WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
  AND ST_Intersects(geom, ST_MakeEnvelope($1, $2, $3, $4, 4326))
  AND ($5::text IS NULL OR service = $5)
LIMIT 5000;
```

## 4. API Next.js

Substitua o corpo de [`app/api/features/bbox/route.ts`](../app/api/features/bbox/route.ts) para executar a query acima com o cliente `postgres` ou `@vercel/postgres`, usando `DATABASE_URL`.

## 5. Ingestão

Exporte os segmentos do `script.py` (mesma geometria que alimenta `features-{service}.json`) para CSV/GeoJSON e use `ogr2ogr` ou um script Node/Python com `COPY` para popular `map_segments`.
