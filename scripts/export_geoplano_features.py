#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Exporta os dados do GeoPlano (mesmos arquivos que alimentam /api/features) para:
  - JSON no formato da API por serviço: { "service", "features" }
  - GeoJSON FeatureCollection (coordenadas WGS84 lon,lat)
  - KML 2.2 com balões em HTML no mesmo estilo das tabelas do site (popupBuilder)

Uso típico (a partir da pasta limpebras-pt):
  python scripts/export_geoplano_features.py --output output

Opcional — buscar do servidor em execução:
  python scripts/export_geoplano_features.py --output output --api-base http://127.0.0.1:3000
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape as xml_escape

# Cores de acento por serviço (espelho de lib/serviceIcons.tsx — SERVICE_FA_LAYER)
SERVICE_ACCENT: dict[str, str] = {
    "VP": "#14532d",
    "NH": "#7f1d1d",
    "LM": "rgba(43, 141, 176, 1)",
    "PV": "rgba(207, 199, 235, 1)",
    "MT": "#ffffff",
    "GO": "rgba(115, 72, 40, 1)",
    "BL": "rgba(33, 112, 176, 1)",
    "VJ_VL": "#ffffff",
    "VM": "#ffffff",
    "CF_VF_LF": "rgba(176, 62, 19, 1)",
    "CA": "rgba(163, 38, 42, 1)",
    "LE": "rgba(33, 112, 176, 1)",
    "ECO": "rgba(22, 101, 52, 1)",
}

SERVICE_KEY_RE = re.compile(r"^[A-Z0-9_]+$")
PLACEHOLDER_FREQ = {
    "401",
    "403",
    "404",
    "405",
    "407",
    "302",
    "303",
    "304",
    "305",
    "306",
}


def _is_placeholder_frequency(value: str | None) -> bool:
    if value is None or value == "":
        return False
    t = value.strip().replace(",", ".")
    if t in PLACEHOLDER_FREQ:
        return True
    try:
        n = float(t)
        if n == int(n) and 300 <= n <= 499:
            return True
    except ValueError:
        pass
    return False


def _display_frequency(value: str | None) -> str:
    if value is None or value == "":
        return "—"
    if _is_placeholder_frequency(value):
        return "—"
    return value


def _format_cronograma(cron: str | None) -> str:
    if not cron:
        return "—"
    parts = [p.strip() for p in cron.split(";") if p.strip()]
    return "<br>".join(html.escape(p) for p in parts) if parts else "—"


def _row(label: str, value: str | None) -> str:
    display = value if (value is not None and value != "") else "—"
    th = (
        f'<th style="padding:3px 5px;text-align:left;background:#f3f4f6;'
        f'border-bottom:1px solid #d1d5db;width:30%;font-size:11px;'
        f'font-weight:600;color:#1f2937;">{html.escape(label)}</th>'
    )
    if display == "—":
        td = (
            '<td style="padding:3px 5px;border-bottom:1px solid #e5e7eb;'
            'font-size:11px;color:#111827;">—</td>'
        )
    else:
        td = (
            f'<td style="padding:3px 5px;border-bottom:1px solid #e5e7eb;'
            f'font-size:11px;color:#111827;">{html.escape(display)}</td>'
        )
    return f"<tr>{th}{td}</tr>"


def build_popup_html(feature: dict[str, Any]) -> str:
    """Replica lib/popupBuilder.ts — buildPopupHtml."""
    title = feature.get("name") or feature.get("setor") or "—"
    service = feature.get("service")
    is_eco = service == "ECO"
    is_pv = service == "PV"
    body_parts: list[str] = []

    if is_eco:
        body_parts.append(_row("Ecoponto", feature.get("name")))
        body_parts.append(_row("Endereço", feature.get("address") or feature.get("logradouro")))
        body_parts.append(_row("Subprefeitura", feature.get("subprefeitura")))
    elif is_pv:
        body_parts.append(_row("ID", feature.get("setor")))
        body_parts.append(_row("Endereço", feature.get("address") or feature.get("logradouro")))
        body_parts.append(_row("Subprefeitura", feature.get("subprefeitura")))
        body_parts.append(_row("Volumetria", feature.get("volumetria")))
        if feature.get("status"):
            body_parts.append(_row("Status", feature.get("status")))
        if feature.get("date"):
            body_parts.append(_row("Data", feature.get("date")))
    else:
        body_parts.append(
            _row("Serviço", feature.get("serviceDisplay") or feature.get("service"))
        )
        body_parts.append(_row("Setor", feature.get("setor")))
        if feature.get("service_type"):
            body_parts.append(_row("Tipo de Serviço", feature.get("service_type")))
        body_parts.append(_row("Nome", feature.get("name")))
        body_parts.append(_row("Logradouro", feature.get("logradouro")))
        body_parts.append(_row("Subprefeitura", feature.get("subprefeitura")))
        body_parts.append(_row("Turno", feature.get("turno")))
        body_parts.append(_row("Frequência", _display_frequency(feature.get("frequencia"))))
        if feature.get("volumetria"):
            body_parts.append(_row("Volumetria", feature.get("volumetria")))
        cron_html = _format_cronograma(feature.get("cronograma"))
        body_parts.append(
            "<tr>"
            '<th style="padding:3px 5px;text-align:left;background:#f3f4f6;'
            'border-bottom:1px solid #d1d5db;width:30%;font-size:11px;'
            'font-weight:600;color:#1f2937;">Cronograma</th>'
            f'<td style="padding:3px 5px;border-bottom:1px solid #e5e7eb;'
            f'font-size:11px;color:#111827;">{cron_html}</td>'
            "</tr>"
        )

    body = "".join(body_parts)
    header = (
        f'<tr><th colspan="2" style="padding:5px 8px;background:#1f6feb;color:#fff;'
        f'text-align:left;font-size:12px;font-weight:600;">{html.escape(str(title))}</th></tr>'
    )
    return (
        '<table style="border-collapse:collapse;width:100%;'
        "font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;"
        'border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">'
        f"{header}{body}</table>"
    )


def _parse_color_to_rgba(color: str | None) -> tuple[int, int, int, int] | None:
    if not color:
        return None
    c = color.strip()
    if c.startswith("#"):
        hx = c[1:]
        if len(hx) == 3:
            hx = "".join(ch * 2 for ch in hx)
        if len(hx) == 6:
            r = int(hx[0:2], 16)
            g = int(hx[2:4], 16)
            b = int(hx[4:6], 16)
            return (r, g, b, 255)
        return None
    m = re.match(
        r"rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?\s*\)",
        c,
        re.I,
    )
    if m:
        r, g, b = int(m.group(1)), int(m.group(2)), int(m.group(3))
        a = 255
        if m.group(4) is not None:
            a = max(0, min(255, int(round(float(m.group(4)) * 255))))
        return (r, g, b, a)
    return None


def color_to_kml_abgr(color: str | None, fallback: str | None, default_alpha: int = 255) -> str:
    """KML uses aabbggrr hex."""
    rgba = _parse_color_to_rgba(color) or _parse_color_to_rgba(fallback)
    if not rgba:
        rgba = (31, 111, 235, default_alpha)
    r, g, b, a = rgba
    return f"{a:02x}{b:02x}{g:02x}{r:02x}"


def _accent_for_service(service: str | None) -> str | None:
    if not service:
        return None
    return SERVICE_ACCENT.get(service)


def latlon_ring_to_lonlat_coords(ring: list[list[float]]) -> str:
    parts: list[str] = []
    for pt in ring:
        if len(pt) < 2:
            continue
        lat, lon = float(pt[0]), float(pt[1])
        parts.append(f"{lon:.7f},{lat:.7f},0")
    return " ".join(parts)


def record_to_geojson_feature(rec: dict[str, Any]) -> dict[str, Any] | None:
    coords = rec.get("coords")
    if not isinstance(coords, list) or not coords:
        return None
    geom_kind = rec.get("geometry")
    props = {k: v for k, v in rec.items() if k != "coords"}

    try:
        if geom_kind == "point" or (len(coords) == 1 and geom_kind != "polygon"):
            lat, lon = float(coords[0][0]), float(coords[0][1])
            geometry = {"type": "Point", "coordinates": [lon, lat]}
        elif geom_kind == "line" or geom_kind == "linestring":
            geometry = {
                "type": "LineString",
                "coordinates": [[float(p[1]), float(p[0])] for p in coords if len(p) >= 2],
            }
        elif geom_kind == "polygon":
            geometry = {
                "type": "Polygon",
                "coordinates": [
                    [[float(p[1]), float(p[0])] for p in coords if len(p) >= 2]
                ],
            }
        else:
            # Infer: fechado e 4+ vértices => polígono; 2 pontos => linha; senão ponto
            if len(coords) >= 4:
                first, last = coords[0], coords[-1]
                if (
                    len(first) >= 2
                    and len(last) >= 2
                    and abs(float(first[0]) - float(last[0])) < 1e-7
                    and abs(float(first[1]) - float(last[1])) < 1e-7
                ):
                    geometry = {
                        "type": "Polygon",
                        "coordinates": [
                            [[float(p[1]), float(p[0])] for p in coords if len(p) >= 2]
                        ],
                    }
                else:
                    geometry = {
                        "type": "LineString",
                        "coordinates": [
                            [float(p[1]), float(p[0])] for p in coords if len(p) >= 2
                        ],
                    }
            elif len(coords) == 2:
                geometry = {
                    "type": "LineString",
                    "coordinates": [[float(p[1]), float(p[0])] for p in coords if len(p) >= 2],
                }
            else:
                lat, lon = float(coords[0][0]), float(coords[0][1])
                geometry = {"type": "Point", "coordinates": [lon, lat]}
    except (TypeError, ValueError, IndexError):
        return None

    fid = rec.get("id")
    feat: dict[str, Any] = {"type": "Feature", "properties": props, "geometry": geometry}
    if fid is not None:
        feat["id"] = fid
    return feat


def load_service_keys(data_dir: Path) -> list[str]:
    manifest_path = data_dir / "features-manifest.json"
    if manifest_path.is_file():
        try:
            m = json.loads(manifest_path.read_text(encoding="utf-8"))
            keys = m.get("serviceKeys")
            if isinstance(keys, list) and keys:
                return [str(k) for k in keys if SERVICE_KEY_RE.match(str(k))]
        except (json.JSONDecodeError, OSError):
            pass
    keys_set: set[str] = set()
    for p in data_dir.glob("features-*.json"):
        name = p.stem  # features-BL
        if name == "features-manifest" or name == "features.sample":
            continue
        if name.startswith("features-"):
            k = name[len("features-") :]
            if SERVICE_KEY_RE.match(k):
                keys_set.add(k)
    return sorted(keys_set)


def read_service_file(data_dir: Path, service: str) -> dict[str, Any] | None:
    path = data_dir / f"features-{service}.json"
    if not path.is_file():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    if not isinstance(raw, dict):
        return None
    feats = raw.get("features")
    if not isinstance(feats, list):
        return None
    return {"service": raw.get("service") or service, "features": feats}


def fetch_service_api(base: str, service: str) -> dict[str, Any] | None:
    url = f"{base.rstrip('/')}/api/features?service={service}"
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return None
    if not isinstance(raw, dict):
        return None
    feats = raw.get("features")
    if not isinstance(feats, list):
        return None
    return {"service": raw.get("service") or service, "features": feats}


def fetch_service_keys_from_api(base: str) -> list[str] | None:
    """GET /api/features sem parâmetro — retorna manifest com serviceKeys."""
    url = f"{base.rstrip('/')}/api/features"
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return None
    if not isinstance(raw, dict):
        return None
    keys = raw.get("serviceKeys")
    if not isinstance(keys, list):
        return None
    out = [str(k) for k in keys if SERVICE_KEY_RE.match(str(k))]
    return out or None


def _kml_cdata_body(html_inner: str) -> str:
    safe = html_inner.replace("]]>", "]]]]><![CDATA[>")
    return f"<![CDATA[{safe}]]>"


def _kml_geometry_fragment(rec: dict[str, Any], coords: list[Any]) -> str | None:
    geom_kind = rec.get("geometry")
    try:
        if geom_kind == "point" or (len(coords) == 1 and geom_kind != "polygon"):
            lat, lon = float(coords[0][0]), float(coords[0][1])
            return f"<Point><coordinates>{lon:.7f},{lat:.7f},0</coordinates></Point>"
        if geom_kind == "line" or geom_kind == "linestring":
            return (
                "<LineString><coordinates>"
                f"{latlon_ring_to_lonlat_coords(coords)}"
                "</coordinates></LineString>"
            )
        if geom_kind == "polygon":
            return (
                "<Polygon><outerBoundaryIs><LinearRing><coordinates>"
                f"{latlon_ring_to_lonlat_coords(coords)}"
                "</coordinates></LinearRing></outerBoundaryIs></Polygon>"
            )
        if len(coords) >= 4:
            first, last = coords[0], coords[-1]
            if (
                len(first) >= 2
                and len(last) >= 2
                and abs(float(first[0]) - float(last[0])) < 1e-7
                and abs(float(first[1]) - float(last[1])) < 1e-7
            ):
                return (
                    "<Polygon><outerBoundaryIs><LinearRing><coordinates>"
                    f"{latlon_ring_to_lonlat_coords(coords)}"
                    "</coordinates></LinearRing></outerBoundaryIs></Polygon>"
                )
            return (
                "<LineString><coordinates>"
                f"{latlon_ring_to_lonlat_coords(coords)}"
                "</coordinates></LineString>"
            )
        if len(coords) == 2:
            return (
                "<LineString><coordinates>"
                f"{latlon_ring_to_lonlat_coords(coords)}"
                "</coordinates></LineString>"
            )
        lat, lon = float(coords[0][0]), float(coords[0][1])
        return f"<Point><coordinates>{lon:.7f},{lat:.7f},0</coordinates></Point>"
    except (TypeError, ValueError, IndexError):
        return None


def kml_style_and_placemark(rec: dict[str, Any], index: int, service: str) -> str | None:
    coords = rec.get("coords")
    if not isinstance(coords, list) or not coords:
        return None
    geom_xml = _kml_geometry_fragment(rec, coords)
    if not geom_xml:
        return None

    title = rec.get("name") or rec.get("setor") or f"{service}-{index}"
    geom_kind = rec.get("geometry")
    fill = rec.get("fillColor")
    line_c = rec.get("lineColor")
    accent = _accent_for_service(rec.get("service") or service)
    line_fallback = line_c or fill or accent
    poly_fill = fill or accent or "#1f6feb"
    line_width = rec.get("lineWidth")
    try:
        lw = float(line_width) if line_width is not None else None
    except (TypeError, ValueError):
        lw = None
    if lw is None:
        lw = 3.0 if geom_kind in ("line", "linestring") or (
            geom_kind != "point" and geom_kind != "polygon" and len(coords) >= 2
        ) else 2.0

    style_id = f"s-{service}-{index}"
    line_color = color_to_kml_abgr(line_c, line_fallback, 220)
    fill_color = color_to_kml_abgr(fill, poly_fill, 140)
    icon_tint = color_to_kml_abgr(fill, poly_fill, 255)

    style = f"""<Style id="{xml_escape(style_id)}">
<LineStyle><color>{line_color}</color><width>{lw:.1f}</width></LineStyle>
<PolyStyle><color>{fill_color}</color></PolyStyle>
<IconStyle><color>{icon_tint}</color><scale>0.55</scale>
<Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon>
</IconStyle>
<LabelStyle><scale>0.65</scale></LabelStyle>
</Style>"""

    desc_inner = build_popup_html(rec)
    pm = (
        f"<Placemark><name>{xml_escape(str(title))}</name>"
        f"<styleUrl>#{xml_escape(style_id)}</styleUrl>"
        f"<description>{_kml_cdata_body(desc_inner)}</description>"
        f"{geom_xml}</Placemark>"
    )
    return style + pm


def build_kml_string(service: str, service_label: str | None, feature_list: list[Any]) -> str:
    disp = xml_escape(service_label or service)
    chunks: list[str] = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<kml xmlns="http://www.opengis.net/kml/2.2">',
        "<Document>",
        f"<name>GeoPlano — {disp}</name>",
        "<open>1</open>",
    ]
    idx = 0
    for rec in feature_list:
        if not isinstance(rec, dict):
            continue
        block = kml_style_and_placemark(rec, idx, service)
        if block:
            chunks.append(block)
            idx += 1
    chunks.append("</Document></kml>")
    return "\n".join(chunks)


def export_service(
    out_root: Path,
    service: str,
    payload: dict[str, Any],
    service_label: str | None,
) -> None:
    feature_list = payload.get("features")
    if not isinstance(feature_list, list):
        raise ValueError(f"features inválido para {service}")
    folder = out_root / service
    folder.mkdir(parents=True, exist_ok=True)

    api_shape = {"service": payload.get("service") or service, "features": feature_list}
    (folder / "features.json").write_text(
        json.dumps(api_shape, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    gj_features: list[dict[str, Any]] = []
    for rec in feature_list:
        if not isinstance(rec, dict):
            continue
        gf = record_to_geojson_feature(rec)
        if gf:
            gj_features.append(gf)
    fc = {"type": "FeatureCollection", "features": gj_features}
    (folder / "features.geojson").write_text(
        json.dumps(fc, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    (folder / "features.kml").write_text(
        build_kml_string(service, service_label, feature_list),
        encoding="utf-8",
    )


def load_service_labels(data_dir: Path) -> dict[str, str]:
    p = data_dir / "features-manifest.json"
    if not p.is_file():
        return {}
    try:
        m = json.loads(p.read_text(encoding="utf-8"))
        sl = m.get("serviceLabels")
        if isinstance(sl, dict):
            return {str(k): str(v) for k, v in sl.items()}
    except (json.JSONDecodeError, OSError):
        pass
    return {}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Exporta features para JSON, GeoJSON e KML por serviço.")
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=None,
        help="Pasta data (default: <repo>/limpebras-pt/data relativo ao script)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("output"),
        help="Pasta de saída (default: ./output)",
    )
    parser.add_argument(
        "--api-base",
        type=str,
        default=None,
        help="Se definido, busca /api/features?service= em vez de arquivos locais",
    )
    parser.add_argument(
        "--services",
        type=str,
        default=None,
        help="Lista separada por vírgula (ex: GO,BL,VM). Default: todos do manifest/arquivos.",
    )
    parser.add_argument(
        "--copy-manifest",
        action="store_true",
        help="Copia features-manifest.json para a raiz de --output",
    )
    args = parser.parse_args(argv)

    script_dir = Path(__file__).resolve().parent
    default_data = script_dir.parent / "data"
    data_dir = (args.data_dir or default_data).resolve()
    out_root = args.output.resolve()

    if not args.api_base and not data_dir.is_dir():
        print(f"Data dir não encontrado: {data_dir}", file=sys.stderr)
        return 1

    if args.services:
        services = [s.strip() for s in args.services.split(",") if s.strip()]
        for s in services:
            if not SERVICE_KEY_RE.match(s):
                print(f"Chave de serviço inválida: {s}", file=sys.stderr)
                return 1
    elif args.api_base:
        services = fetch_service_keys_from_api(args.api_base) or []
        if not services and data_dir.is_dir():
            services = load_service_keys(data_dir)
    else:
        services = load_service_keys(data_dir)

    labels = load_service_labels(data_dir) if data_dir.is_dir() else {}

    if not services:
        print(
            "Nenhum serviço para exportar. Use --services ou garanta features-manifest.json / arquivos features-*.json.",
            file=sys.stderr,
        )
        return 1

    out_root.mkdir(parents=True, exist_ok=True)
    if args.copy_manifest and not args.api_base:
        man = data_dir / "features-manifest.json"
        if man.is_file():
            dest = out_root / "features-manifest.json"
            dest.write_text(man.read_text(encoding="utf-8"), encoding="utf-8")

    errors = 0
    for svc in services:
        if args.api_base:
            payload = fetch_service_api(args.api_base, svc)
        else:
            payload = read_service_file(data_dir, svc)
        if not payload:
            print(f"Aviso: sem dados para servico {svc}", file=sys.stderr)
            errors += 1
            continue
        try:
            export_service(out_root, svc, payload, labels.get(svc))
            print(f"OK {svc} -> {out_root / svc}")
        except OSError as e:
            print(f"Erro ao escrever {svc}: {e}", file=sys.stderr)
            errors += 1

    return 1 if errors >= len(services) else 0


if __name__ == "__main__":
    raise SystemExit(main())
