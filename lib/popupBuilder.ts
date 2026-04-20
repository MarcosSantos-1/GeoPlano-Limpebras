import type { FeatureRecord } from "./types";

/** Códigos de planilha (401, 407, 3xx) em vez de texto de frequência. */
function isPlaceholderFrequency(value: string | null | undefined): boolean {
  if (value == null || value === "") return false;
  const t = value.trim().replace(",", ".");
  if (
    ["401", "403", "404", "405", "407", "302", "303", "304", "305", "306"].includes(t)
  ) {
    return true;
  }
  const n = Number.parseFloat(t);
  if (!Number.isNaN(n) && n === Math.floor(n) && n >= 300 && n <= 499) {
    return true;
  }
  return false;
}

function displayFrequency(value: string | null | undefined): string {
  if (value == null || value === "") return "—";
  if (isPlaceholderFrequency(value)) return "—";
  return value;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function row(label: string, value?: string | null): string {
  const display = value || "—";
  return (
    `<tr>` +
    `<th style="padding:3px 5px;text-align:left;background:#f3f4f6;border-bottom:1px solid #d1d5db;width:30%;font-size:11px;font-weight:600;color:#1f2937;">${escapeHtml(label)}</th>` +
    `<td style="padding:3px 5px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#111827;">${display === "—" ? "—" : escapeHtml(display)}</td>` +
    `</tr>`
  );
}

function formatCronograma(cron?: string | null): string {
  if (!cron) return "—";
  return cron
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .join("<br>");
}

export function buildPopupHtml(feature: FeatureRecord): string {
  const title = feature.name || feature.setor;
  const isEcoponto = feature.service === "ECO";
  const isPV = feature.service === "PV";

  let body = "";

  if (isEcoponto) {
    body += row("Ecoponto", feature.name);
    body += row("Endereço", feature.address || feature.logradouro);
    body += row("Subprefeitura", feature.subprefeitura);
  } else if (isPV) {
    body += row("ID", feature.setor);
    body += row("Endereço", feature.address || feature.logradouro);
    body += row("Subprefeitura", feature.subprefeitura);
    body += row("Volumetria", feature.volumetria);
    if (feature.status) {
      body += row("Status", feature.status);
    }
    if (feature.date) {
      body += row("Data", feature.date);
    }
  } else {
    body += row("Serviço", feature.serviceDisplay || feature.service);
    body += row("Setor", feature.setor);
    if (feature.service_type) {
      body += row("Tipo de Serviço", feature.service_type);
    }
    body += row("Nome", feature.name);
    body += row("Logradouro", feature.logradouro);
    body += row("Subprefeitura", feature.subprefeitura);
    body += row("Turno", feature.turno);
    body += row("Frequência", displayFrequency(feature.frequencia));
    if (feature.volumetria) {
      body += row("Volumetria", feature.volumetria);
    }
    const cronHtml = formatCronograma(feature.cronograma);
    body +=
      `<tr>` +
      `<th style="padding:3px 5px;text-align:left;background:#f3f4f6;border-bottom:1px solid #d1d5db;width:30%;font-size:11px;font-weight:600;color:#1f2937;">Cronograma</th>` +
      `<td style="padding:3px 5px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#111827;">${cronHtml}</td>` +
      `</tr>`;
  }

  return (
    `<table style="border-collapse:collapse;width:100%;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">` +
    `<tr><th colspan="2" style="padding:5px 8px;background:#1f6feb;color:#fff;text-align:left;font-size:12px;font-weight:600;">${escapeHtml(title)}</th></tr>` +
    body +
    `</table>`
  );
}

/** Várias linhas no mesmo trecho: mostra um bloco por setor/frequência. */
export function buildMultiPopupHtml(features: FeatureRecord[]): string {
  if (features.length === 0) return "";
  if (features.length === 1) return buildPopupHtml(features[0]);
  const intro =
    `<p style="margin:0 0 8px 0;padding:6px 8px;background:#fef3c7;color:#92400e;font-size:11px;border-radius:6px;border:1px solid #fcd34d;">` +
    `Várias rotas coincidem neste trecho. Seguem os dados de cada uma:` +
    `</p>`;
  const blocks = features
    .map((f) => `<div style="margin-bottom:10px;">${buildPopupHtml(f)}</div>`)
    .join("");
  return (
    `<div style="max-height:min(70vh,480px);overflow:auto;width:min(420px,92vw);font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">` +
    intro +
    blocks +
    `</div>`
  );
}
