"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import * as XLSX from "xlsx";
import { AppHeader } from "@/components/AppHeader";
import { FlipSacMap, type FlipSacMapPoint } from "@/components/FlipSacMap";
import { parseFeaturesJson } from "@/lib/parseFeaturesJson";
import {
  ESCALONADO_SERVICES,
  ESCALONADO_SERVICE_TITLES,
  type EscalonadoServiceKey,
  type ScheduleMatch,
  findScheduleMatch,
  formatDateKey,
} from "@/lib/serviceSchedule";
import type { FeatureRecord } from "@/lib/types";

type FlipMode = "execution" | "analysis";

type FlipSacRecord = {
  rowNumber: number;
  chamado: string;
  origem: string;
  status: string;
  regional: string;
  serviceRaw: string;
  service: string;
  addressRaw: string;
  address: string;
  syncDate: string;
  scheduleDate: string;
  coordinates: string;
  lat: number | null;
  lon: number | null;
  issues: string[];
};

type AnalysisRecord = FlipSacRecord & {
  scheduleMatches: Partial<Record<EscalonadoServiceKey, ScheduleMatch | null>>;
  primarySchedule: ScheduleMatch | null;
};

type AnswerStatus = "procede" | "executado" | "nao-procede" | "fora-escopo" | "outro";

type AnswerTemplate = {
  code: string;
  title: string;
  status: AnswerStatus;
  message: string;
};

type AnswerService = {
  number: string;
  title: string;
  templates: AnswerTemplate[];
};

type AnswerPatternPayload = {
  services: Record<string, AnswerService>;
};

type RegionalTheme = {
  accent: string;
  bg: string;
  text: string;
  ring: string;
};

type ParseResult = {
  fileName: string;
  records: FlipSacRecord[];
  valid: FlipSacRecord[];
  isolated: FlipSacRecord[];
};

const EXPECTED_STATUS: Record<FlipMode, string> = {
  execution: "Em Execução",
  analysis: "Aguardando Análise",
};

const SERVICE_LABELS: Record<string, string> = {
  "Equipe de Mutirão de Zeladoria de Vias e Logradouros Públicos": "Equipe de Mutirão",
  "Limpeza e desobstrução de bueiros, bocas de lobo e bocas de leão": "Limpeza de Bueiros",
  "Coleta programada e transporte de objetos volumosos e de entulho (Cata-Bagulho)": "Cata-Bagulho",
  "Limpeza e conservação de monumentos públicos": "Limpeza de Monumentos",
  "Lavagem especial de equipamentos públicos": "Lavagem Especial",
  "Coleta manual de resíduos de varrição e de feiras-livres com compactador": "Coleta de Varrição",
  "Varrição manual de vias e logradouros públicos": "Varrição Manual",
  "Remoção de animais mortos de proprietários não identificados em vias e logradouros públicos": "Animal Morto",
  "Coleta e transporte de entulho e grandes objetos depositados irregularmente nas vias, logradouros e áreas públicas": "Coleta e transporte de entulho e G.O.",
};

const COLS = {
  chamado: 2,
  origem: 3,
  status: 4,
  regional: 9,
  service: 11,
  address: 16,
  syncDate: 17,
  scheduleDate: 20,
  coordinates: 26,
} as const;

const DEFAULT_REGIONAL_THEME: RegionalTheme = {
  accent: "#64748b",
  bg: "#f8fafc",
  text: "#334155",
  ring: "#cbd5e1",
};

const REGIONAL_THEMES: Array<{ matches: string[]; theme: RegionalTheme }> = [
  {
    matches: ["casa verde", "cachoeirinha"],
    theme: {
      accent: "#84cc16",
      bg: "#f7fee7",
      text: "#365314",
      ring: "#bef264",
    },
  },
  {
    matches: ["jacana", "tremembe"],
    theme: {
      accent: "#1d4ed8",
      bg: "#eff6ff",
      text: "#1e3a8a",
      ring: "#93c5fd",
    },
  },
  {
    matches: ["jacana", "tucuruvi"],
    theme: {
      accent: "#1d4ed8",
      bg: "#eff6ff",
      text: "#1e3a8a",
      ring: "#93c5fd",
    },
  },
  {
    matches: ["vila maria", "vila guilherme"],
    theme: {
      accent: "#06b6d4",
      bg: "#ecfeff",
      text: "#155e75",
      ring: "#67e8f9",
    },
  },
  {
    matches: ["santana", "tucuruvi"],
    theme: {
      accent: "#eab308",
      bg: "#fefce8",
      text: "#713f12",
      ring: "#fde047",
    },
  },
];

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeKey(value: string): string {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function detectScheduleService(record: FlipSacRecord): EscalonadoServiceKey | null {
  const serviceNumber = detectAnswerServiceNumber(record);
  if (serviceNumber === "8") return null;
  if (serviceNumber === "9") return "GO";
  const key = normalizeKey(`${record.serviceRaw} ${record.service} ${record.addressRaw}`);
  if (key.includes("varricao manual")) return "VJ_VL";
  if (key.includes("mutirao") || key.includes("zeladoria")) return "MT";
  if (key.includes("bueiro") || key.includes("boca de lobo") || key.includes("boca de leao")) return "BL";
  if (key.includes("cata-bagulho") || key.includes("cata bagulho") || key.includes("residuos volumosos")) return "GO";
  return null;
}

function detectAnswerServiceNumber(record: FlipSacRecord): string | null {
  const key = normalizeKey(`${record.serviceRaw} ${record.service}`);
  if (key.includes("mutirao") || key.includes("zeladoria")) return "2";
  if (key.includes("bueiro") || key.includes("boca de lobo") || key.includes("boca de leao")) return "3";
  if (key.includes("varricao manual")) return "5";
  if (key.includes("lixeira") || key.includes("papeleira")) return "7";
  if (key.includes("coleta e transporte de entulho") || key.includes("grandes objetos depositados")) return "8";
  if (key.includes("cata-bagulho") || key.includes("cata bagulho") || key.includes("residuos volumosos")) return "9";
  if (key.includes("lavagem")) return "11";
  return null;
}

function pickPrimarySchedule(record: FlipSacRecord, matches: Partial<Record<EscalonadoServiceKey, ScheduleMatch | null>>): ScheduleMatch | null {
  const serviceNumber = detectAnswerServiceNumber(record);
  if (serviceNumber === "8") return getColetaEntulhoSchedule(record);
  const target = detectScheduleService(record);
  if (target && matches[target]) return matches[target] ?? null;
  return null;
}

function parsePtBrDate(value: string): Date | null {
  const match = value.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(date.getDate() + days);
  return next;
}

function getTodayDateKey(): string {
  return formatDateKey(new Date());
}

function getColetaEntulhoSchedule(record: FlipSacRecord): ScheduleMatch | null {
  const syncDate = parsePtBrDate(record.syncDate);
  if (!syncDate) return null;
  const scheduledDate = addDays(syncDate, 2);
  return {
    service: "GO",
    serviceName: "Coleta e transporte de entulho e G.O.",
    setor: "Item 8",
    featureName: "Agendamento por data de sincronizacao",
    nextDate: formatDateKey(scheduledDate),
    dates: [formatDateKey(scheduledDate)],
    source: "sync-plus-days",
  };
}

function getTemplatesForRecord(record: FlipSacRecord, answerPatterns: Record<string, AnswerService>): AnswerTemplate[] {
  const serviceNumber = detectAnswerServiceNumber(record);
  if (!serviceNumber) return [];
  return answerPatterns[serviceNumber]?.templates ?? [];
}

function getDefaultNoProcedeTemplate(templates: AnswerTemplate[]): AnswerTemplate | null {
  const options = templates.filter((template) => template.status === "nao-procede");
  return (
    options.find((template) => {
      const key = normalizeKey(template.title);
      return key.includes("limpo") || key.includes("sem constatacao");
    }) ??
    options[0] ??
    null
  );
}

function getProcedeTemplate(templates: AnswerTemplate[]): AnswerTemplate | null {
  return (
    templates.find((template) => template.status === "procede" && normalizeKey(template.title).includes("agendar")) ??
    templates.find((template) => template.status === "procede") ??
    templates.find((template) => template.status === "executado") ??
    null
  );
}

function getForaEscopoTemplate(templates: AnswerTemplate[]): AnswerTemplate | null {
  return templates.find((template) => template.status === "fora-escopo") ?? null;
}

function withScheduleDate(message: string, date?: string | null): string {
  if (!date) return message;
  const placeholder = /XX\/XX\/(?:XX|XXXX)/i;
  if (placeholder.test(message)) return message.replace(placeholder, date);
  const datePattern = /\b\d{2}\/\d{2}\/\d{2,4}\b/;
  if (datePattern.test(message)) return message.replace(datePattern, date);
  return message;
}

const DEFAULT_FORA_ESCOPO_MESSAGE =
  "Prezada(o) cidadã(o), verificamos que sua solicitação está fora do escopo de atendimento da LIMPEBRAS e foi redirecionada para o órgão responsável. Agradecemos o contato. Equipe LIMPEBRAS";

function getRegionalTheme(regional: string): RegionalTheme {
  const key = normalizeKey(regional);
  return REGIONAL_THEMES.find(({ matches }) => matches.every((match) => key.includes(match)))?.theme ?? DEFAULT_REGIONAL_THEME;
}

function formatCell(value: unknown): string {
  if (value instanceof Date) {
    return new Intl.DateTimeFormat("pt-BR").format(value);
  }
  return normalizeText(value);
}

function shortService(value: string): string {
  const clean = normalizeText(value);
  return SERVICE_LABELS[clean] ?? clean;
}

function shortAddress(value: string): string {
  return normalizeText(value)
    .replace(/,\s*\d{5}-?\d{3},\s*São Paulo,\s*SP,\s*Brasil$/i, "")
    .replace(/,\s*São Paulo,\s*SP,\s*Brasil$/i, "")
    .replace(/,\s*Brasil$/i, "");
}

function parseCoordinates(value: string): { lat: number | null; lon: number | null } {
  const match = value.match(/(-?\d+(?:[.,]\d+)?)\s*[;,]\s*(-?\d+(?:[.,]\d+)?)/);
  if (!match) return { lat: null, lon: null };
  const lat = Number(match[1].replace(",", "."));
  const lon = Number(match[2].replace(",", "."));
  return {
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
  };
}

function parseWorkbook(fileName: string, buffer: ArrayBuffer, mode: FlipMode): ParseResult {
  const workbook = XLSX.read(buffer, { cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
    raw: false,
  });
  const expectedStatus = EXPECTED_STATUS[mode];
  const records = rows.slice(2).map((row, index) => {
    const coordinates = formatCell(row[COLS.coordinates]);
    const parsedCoords = parseCoordinates(coordinates);
    const origem = formatCell(row[COLS.origem]);
    const status = formatCell(row[COLS.status]);
    const serviceRaw = formatCell(row[COLS.service]);
    const scheduleDate = formatCell(row[COLS.scheduleDate]);
    const issues: string[] = [];
    if (origem !== "SAC") issues.push(`Origem diferente de SAC: ${origem || "vazio"}`);
    if (status !== expectedStatus) issues.push(`Status diferente de ${expectedStatus}: ${status || "vazio"}`);
    if (mode === "execution" && !scheduleDate) issues.push("Sem Data Acionamento Agendamento");
    if (parsedCoords.lat === null || parsedCoords.lon === null) issues.push("Coordenadas ausentes ou inválidas");
    return {
      rowNumber: index + 3,
      chamado: formatCell(row[COLS.chamado]),
      origem,
      status,
      regional: formatCell(row[COLS.regional]) || "Sem regional",
      serviceRaw,
      service: shortService(serviceRaw),
      addressRaw: formatCell(row[COLS.address]),
      address: shortAddress(formatCell(row[COLS.address])),
      syncDate: formatCell(row[COLS.syncDate]),
      scheduleDate,
      coordinates,
      lat: parsedCoords.lat,
      lon: parsedCoords.lon,
      issues,
    };
  }).filter((record) => record.chamado || record.address || record.status);

  return {
    fileName,
    records,
    valid: records.filter((record) => record.issues.length === 0),
    isolated: records.filter((record) => record.issues.length > 0),
  };
}

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function downloadCsv(records: FlipSacRecord[], mode: FlipMode) {
  const headers = ["Nº Chamado", "Regional", "Serviço", "Endereço", "Data Sincronização", "Data Agendamento", "Coordenadas"];
  const lines = [
    headers.map(csvEscape).join(";"),
    ...records.map((record) => [
      record.chamado,
      record.regional,
      record.service,
      record.address,
      record.syncDate,
      record.scheduleDate,
      record.coordinates,
    ].map(csvEscape).join(";")),
  ];
  const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = mode === "execution" ? "sacs-em-execucao-tratados.csv" : "sacs-aguardando-analise-tratados.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function groupBy<T>(items: T[], getKey: (item: T) => string): Array<[string, T[]]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = getKey(item);
    map.set(key, [...(map.get(key) ?? []), item]);
  }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, "pt-BR"));
}

async function loadEscalonadoFeatures(): Promise<Partial<Record<EscalonadoServiceKey, FeatureRecord[]>>> {
  const entries = await Promise.all(
    ESCALONADO_SERVICES.map(async (service) => {
      const response = await fetch(`/api/features?service=${encodeURIComponent(service)}`);
      if (!response.ok) return [service, [] as FeatureRecord[]] as const;
      const parsed = (await parseFeaturesJson(await response.text())) as { features?: FeatureRecord[] };
      return [service, parsed.features ?? []] as const;
    }),
  );
  return Object.fromEntries(entries) as Partial<Record<EscalonadoServiceKey, FeatureRecord[]>>;
}

async function loadAnswerPatterns(): Promise<Record<string, AnswerService>> {
  const response = await fetch("/api/answer-patterns", { cache: "no-store" });
  if (!response.ok) return {};
  const payload = (await response.json()) as AnswerPatternPayload;
  return payload.services ?? {};
}

function sortRecordsByService(records: FlipSacRecord[]): FlipSacRecord[] {
  return [...records].sort((a, b) => (
    a.service.localeCompare(b.service, "pt-BR", { sensitivity: "base" }) ||
    a.chamado.localeCompare(b.chamado, "pt-BR", { numeric: true, sensitivity: "base" })
  ));
}

function dateKeyToTime(value: string): number {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const [, day, month, year] = match;
  return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
}

function dateKeyToInput(value: string): string {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return "";
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function inputToDateKey(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

function getImportHealth(result: ParseResult, mode: FlipMode) {
  const expectedStatus = EXPECTED_STATUS[mode];
  const wrongOrigin = result.records.filter((record) => record.origem !== "SAC").length;
  const wrongStatus = result.records.filter((record) => record.status !== expectedStatus).length;

  if (wrongOrigin > 0) {
    return {
      tone: "danger" as const,
      icon: "fa-solid fa-circle-xmark",
      title: "Arquivo fora do padrão SAC",
      message: `${wrongOrigin} linha(s) não vieram como origem SAC. Confira os detalhes isolados abaixo.`,
    };
  }

  if (wrongStatus > 0) {
    return {
      tone: "warning" as const,
      icon: "fa-solid fa-triangle-exclamation",
      title: `SACs fora de ${expectedStatus}`,
      message: `${wrongStatus} linha(s) estão com status diferente de ${expectedStatus}.`,
    };
  }

  if (result.isolated.length > 0) {
    return {
      tone: "warning" as const,
      icon: "fa-solid fa-circle-exclamation",
      title: "Arquivo carregado com pendências",
      message: `${result.isolated.length} linha(s) precisam de conferência antes do encaminhamento.`,
    };
  }

  return {
    tone: "ok" as const,
    icon: "fa-solid fa-circle-check",
    title: "Arquivo validado",
    message: `${result.records.length} linhas carregadas para validação de ${expectedStatus}.`,
  };
}

function Dropzone({
  mode,
  result,
  processing,
  progress,
  onFile,
}: {
  mode: FlipMode;
  result: ParseResult | null;
  processing: boolean;
  progress: number;
  onFile: (file: File) => void;
}) {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const expectedStatus = EXPECTED_STATUS[mode];
  const health = result ? getImportHealth(result, mode) : null;
  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragActive(false);
        const file = event.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      className={clsx(
        "mx-auto w-full max-w-7xl rounded-lg border border-dashed bg-white p-6 text-center shadow-sm transition dark:bg-zinc-900 sm:p-8",
        health?.tone === "danger"
          ? "border-red-300 bg-red-50/70 dark:border-red-500/50 dark:bg-red-500/10"
          : health?.tone === "warning"
            ? "border-amber-300 bg-amber-50/70 dark:border-amber-500/50 dark:bg-amber-500/10"
            : dragActive
          ? "border-emerald-400 ring-4 ring-emerald-100 dark:ring-emerald-500/20"
          : "border-zinc-300 dark:border-zinc-700",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.currentTarget.value = "";
        }}
      />
      {result ? (
        <div
          className={clsx(
            "rounded-md border px-4 py-3 text-left text-sm",
            health?.tone === "danger"
              ? "border-red-200 bg-red-50 text-red-900 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-100"
              : health?.tone === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
                : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100",
          )}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <i className={clsx(health?.icon, "shrink-0 text-lg")} aria-hidden />
              <div className="min-w-0">
                <p className="truncate font-semibold">{result.fileName}</p>
                <p className="text-xs opacity-80">{health?.title} · {health?.message}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-1 text-xs font-semibold shadow-sm dark:bg-black/20">
                <i className="fa-solid fa-file-lines" aria-hidden />
                Total {result.records.length}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-1 text-xs font-semibold shadow-sm dark:bg-black/20">
                <i className="fa-solid fa-circle-check" aria-hidden />
                Válidos {result.valid.length}
              </span>
              {result.isolated.length > 0 ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-1 text-xs font-semibold shadow-sm dark:bg-black/20">
                  <i className="fa-solid fa-triangle-exclamation" aria-hidden />
                  Isolados {result.isolated.length}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-sky-50 text-2xl text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
            <i className="fa-solid fa-file-excel" aria-hidden />
          </div>
          <h2 className="mt-5 text-xl font-semibold text-zinc-950 dark:text-white">
            Solte a planilha FLIP aqui
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            A leitura acontece no navegador. Use uma planilha de SAC com status {expectedStatus}.
          </p>
        </>
      )}
      {processing ? (
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="mt-5 rounded-full bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700"
      >
        Selecionar arquivo
      </button>
    </div>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</p>
        <i className={clsx(icon, "text-sky-600 dark:text-sky-300")} aria-hidden />
      </div>
      <p className="mt-3 text-2xl font-semibold text-zinc-950 dark:text-white">{value}</p>
    </div>
  );
}

function RecordsTable({ records, compact = false }: { records: FlipSacRecord[]; compact?: boolean }) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <table className="w-full table-fixed text-left text-sm">
        <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          <tr>
            <th className="w-[16%] px-4 py-3">Nº Chamado</th>
            <th className="w-[20%] px-4 py-3">Serviço</th>
            <th className="px-4 py-3">Endereço</th>
            {!compact ? <th className="w-[16%] px-4 py-3">Data Sincronização</th> : null}
            <th className="w-[14%] px-4 py-3">Agendamento</th>
            {compact ? <th className="w-[30%] px-4 py-3">Motivo</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {records.map((record) => {
            const theme = getRegionalTheme(record.regional);
            return (
              <tr
                key={`${record.rowNumber}-${record.chamado}`}
                className="text-zinc-700 transition hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800/60"
                style={{ boxShadow: `inset 4px 0 0 ${theme.accent}` }}
              >
                <td className="break-words px-4 py-3 font-semibold text-zinc-950 dark:text-white">
                  <span className="inline-flex items-center gap-2">
                    <i className="fa-solid fa-hashtag text-xs text-zinc-400" aria-hidden />
                    {record.chamado}
                  </span>
                </td>
                <td className="break-words px-4 py-3">
                  <span className="inline-flex items-start gap-2">
                    <i className="fa-solid fa-screwdriver-wrench mt-1 text-xs" style={{ color: theme.accent }} aria-hidden />
                    {record.service}
                  </span>
                </td>
                <td className="break-words px-4 py-3">
                  <span className="inline-flex items-start gap-2">
                    <i className="fa-solid fa-location-dot mt-1 text-xs text-zinc-400" aria-hidden />
                    {record.address}
                  </span>
                </td>
                {!compact ? <td className="break-words px-4 py-3">{record.syncDate}</td> : null}
                <td className="break-words px-4 py-3">
                  <span
                    className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold"
                    style={{ backgroundColor: theme.bg, color: theme.text, boxShadow: `inset 0 0 0 1px ${theme.ring}` }}
                  >
                    <i className="fa-solid fa-calendar-day" aria-hidden />
                    {record.scheduleDate || "-"}
                  </span>
                </td>
                {compact ? <td className="break-words px-4 py-3 text-amber-700 dark:text-amber-300">{record.issues.join(" | ")}</td> : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CopyMessageButton({
  message,
  title = "Copiar resposta",
  label,
  tone = "neutral",
}: {
  message: string;
  title?: string;
  label?: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const [copied, setCopied] = useState(false);
  const toneClasses: Record<typeof tone, string> = {
    neutral: "border-zinc-200 bg-white text-zinc-600 hover:border-sky-300 hover:text-sky-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-sky-500 dark:hover:text-sky-300",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:border-emerald-400/60",
    warning: "border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:border-amber-400/60",
    danger: "border-rose-200 bg-rose-50 text-rose-800 hover:border-rose-300 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:border-rose-400/60",
  };
  return (
    <button
      type="button"
      title={title}
      onClick={async () => {
        await navigator.clipboard.writeText(message);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      }}
      className={clsx(
        "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold transition",
        label ? "min-w-[92px]" : "w-8 px-0",
        copied
          ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300"
          : toneClasses[tone],
      )}
    >
      <i className={copied ? "fa-solid fa-check" : "fa-regular fa-copy"} aria-hidden />
      {label ? <span>{copied ? "Copiado" : label}</span> : null}
    </button>
  );
}

function withTemplateDate(template: AnswerTemplate | null, scheduleDate: string): string {
  if (!template) return "";
  return withScheduleDate(template.message, template.status === "executado" ? getTodayDateKey() : scheduleDate);
}

function MessageModal({
  title,
  templates,
  selected,
  message,
  onSelect,
  onClose,
}: {
  title: string;
  templates: AnswerTemplate[];
  selected: AnswerTemplate | null;
  message: string;
  onSelect: (template: AnswerTemplate) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState(message);
  const filteredTemplates = templates.filter((template) => {
    const key = normalizeKey(`${template.code} ${template.title} ${template.message}`);
    return key.includes(normalizeKey(query));
  });

  useEffect(() => {
    setDraft(message);
  }, [message]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4 dark:border-zinc-700">
          <div>
            <h3 className="text-base font-semibold text-zinc-950 dark:text-white">{title}</h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {selected ? `${selected.code} - ${selected.title}` : "Mensagem padrão"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 transition hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-white"
            title="Fechar"
          >
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden md:grid-cols-[280px_1fr]">
          <aside className="min-h-0 overflow-auto border-b border-zinc-200 p-4 dark:border-zinc-700 md:border-b-0 md:border-r">
            <label className="relative block">
              <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400" aria-hidden />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Pesquisar"
                className="w-full rounded-md border border-zinc-200 bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:ring-sky-500/20"
              />
            </label>
            <div className="mt-3 space-y-2">
              {filteredTemplates.length > 0 ? filteredTemplates.map((template) => (
                <button
                  key={template.code}
                  type="button"
                  onClick={() => onSelect(template)}
                  className={clsx(
                    "w-full rounded-md border px-3 py-2 text-left text-xs transition",
                    selected?.code === template.code
                      ? "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-500/50 dark:bg-sky-500/10 dark:text-sky-100"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
                  )}
                >
                  <span className="block font-semibold">{template.code}</span>
                  <span className="mt-1 block leading-4">{template.title}</span>
                </button>
              )) : (
                <p className="rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  Nenhuma mensagem encontrada.
                </p>
              )}
            </div>
          </aside>
          <section className="flex min-h-0 flex-col gap-3 p-4">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="min-h-[260px] flex-1 resize-none rounded-md border border-zinc-200 bg-white p-3 text-sm leading-6 text-zinc-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-sky-500/20"
            />
            <div className="flex justify-end gap-2">
              <CopyMessageButton message={draft} />
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(draft);
                  onClose();
                }}
                className="inline-flex items-center gap-2 rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
              >
                <i className="fa-regular fa-copy" aria-hidden />
                Copiar e fechar
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function AnswerActionCell({
  title,
  copyLabel,
  tone,
  templates,
  fallbackMessage = "",
  scheduleDate,
  defaultTemplate,
}: {
  title: string;
  copyLabel: string;
  tone: "success" | "warning" | "danger";
  templates: AnswerTemplate[];
  fallbackMessage?: string;
  scheduleDate: string;
  defaultTemplate?: AnswerTemplate | null;
}) {
  const initialTemplate = defaultTemplate ?? templates[0] ?? null;
  const [selectedCode, setSelectedCode] = useState(initialTemplate?.code ?? "");
  const [open, setOpen] = useState(false);
  const selected = templates.find((template) => template.code === selectedCode) ?? initialTemplate;
  const message = selected ? withTemplateDate(selected, scheduleDate) : fallbackMessage;

  if (!message) return <span className="text-xs text-zinc-400">Sem padrão</span>;

  return (
    <>
      <div className="flex items-center gap-2">
        <CopyMessageButton message={message} label={copyLabel} tone={tone} />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white text-xs text-zinc-600 transition hover:border-sky-300 hover:text-sky-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-sky-500 dark:hover:text-sky-300"
          title="Ver mensagem"
        >
          <i className="fa-regular fa-eye" aria-hidden />
        </button>
      </div>
      {open ? (
        <MessageModal
          title={title}
          templates={templates}
          selected={selected}
          message={message}
          onSelect={(template) => setSelectedCode(template.code)}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function AnalysisRecordsTable({
  records,
  answerPatterns,
}: {
  records: AnalysisRecord[];
  answerPatterns: Record<string, AnswerService>;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <table className="w-full min-w-[1320px] table-fixed text-left text-sm">
        <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          <tr>
            <th className="w-[150px] px-4 py-3">Sub</th>
            <th className="w-[130px] px-4 py-3">Nº Chamado</th>
            <th className="w-[210px] px-4 py-3">Serviço</th>
            <th className="w-[280px] px-4 py-3">Endereço</th>
            <th className="w-[260px] px-4 py-3">Agendamento</th>
            <th className="w-[145px] px-4 py-3">Não Procede</th>
            <th className="w-[125px] px-4 py-3">Procede</th>
            <th className="w-[145px] px-4 py-3">Fora escopo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {records.map((record) => {
            const theme = getRegionalTheme(record.regional);
            const templates = getTemplatesForRecord(record, answerPatterns);
            const procede = getProcedeTemplate(templates);
            const procedeOptions = templates.filter((template) => template.status === "procede" || template.status === "executado");
            const naoProcedeOptions = templates.filter((template) => template.status === "nao-procede");
            const foraEscopoOptions = templates.filter((template) => template.status === "fora-escopo");
            const foraEscopo = getForaEscopoTemplate(templates);
            const scheduleDate = record.primarySchedule?.nextDate ?? "";
            const foraEscopoMessage = foraEscopo?.message ?? DEFAULT_FORA_ESCOPO_MESSAGE;
            const scheduleDates = record.primarySchedule?.dates?.length
              ? record.primarySchedule.dates
              : record.primarySchedule?.nextDate
                ? [record.primarySchedule.nextDate]
                : [];

            return (
              <tr
                key={`${record.rowNumber}-${record.chamado}`}
                className="align-top text-zinc-700 transition hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800/60"
                style={{ boxShadow: `inset 4px 0 0 ${theme.accent}` }}
              >
                <td className="break-words px-4 py-3">
                  <span
                    className="inline-flex rounded-md px-2 py-1 text-xs font-bold"
                    style={{ backgroundColor: theme.bg, color: theme.text, boxShadow: `inset 0 0 0 1px ${theme.ring}` }}
                  >
                    {record.regional}
                  </span>
                </td>
                <td className="break-words px-4 py-3 font-semibold text-zinc-950 dark:text-white">{record.chamado}</td>
                <td className="break-words px-4 py-3">{record.service}</td>
                <td className="break-words px-4 py-3">{record.address}</td>
                <td className="px-4 py-3">
                  {record.primarySchedule ? (
                    <div className="space-y-2">
                      <span className="inline-flex rounded-md bg-sky-50 px-2 py-1 text-xs font-bold text-sky-700 ring-1 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30">
                        {record.primarySchedule.setor}
                      </span>
                      <div className="text-xs leading-5 text-zinc-600 dark:text-zinc-400">
                        <p className="font-semibold text-zinc-800 dark:text-zinc-100">{record.primarySchedule.serviceName}</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {scheduleDates.map((date, index) => (
                            <span
                              key={`${record.chamado}-${date}-${index}`}
                              className="rounded-md bg-zinc-50 px-2 py-1 font-semibold text-zinc-800 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700"
                            >
                              {index === 0 ? "Próxima " : "Depois "}
                              {date}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-zinc-400">Sem rota encontrada</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <AnswerActionCell
                    title="Não Procede"
                    copyLabel="Não procede"
                    tone="warning"
                    templates={naoProcedeOptions}
                    scheduleDate={scheduleDate}
                    defaultTemplate={getDefaultNoProcedeTemplate(templates)}
                  />
                </td>
                <td className="px-4 py-3">
                  <AnswerActionCell
                    title="Procede"
                    copyLabel="Procede"
                    tone="success"
                    templates={procedeOptions}
                    scheduleDate={scheduleDate}
                    defaultTemplate={procede}
                  />
                </td>
                <td className="px-4 py-3">
                  <AnswerActionCell
                    title="Fora de escopo"
                    copyLabel="Fora escopo"
                    tone="danger"
                    templates={foraEscopoOptions}
                    fallbackMessage={foraEscopoMessage}
                    scheduleDate={scheduleDate}
                    defaultTemplate={foraEscopo}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ExecutionContent({ result }: { result: ParseResult }) {
  const scheduleDates = useMemo(
    () => Array.from(new Set(result.valid.map((record) => record.scheduleDate).filter(Boolean))).sort((a, b) => dateKeyToTime(a) - dateKeyToTime(b)),
    [result.valid],
  );
  const [selectedDate, setSelectedDate] = useState("");
  const activeDate = selectedDate || scheduleDates[0] || "";
  const dateFilteredRecords = useMemo(
    () => result.valid.filter((record) => !activeDate || record.scheduleDate === activeDate),
    [activeDate, result.valid],
  );
  const filteredByRegional = useMemo(
    () => groupBy(dateFilteredRecords, (record) => record.regional)
      .map(([regional, records]) => [regional, sortRecordsByService(records)] as [string, FlipSacRecord[]]),
    [dateFilteredRecords],
  );
  const mapPoints = useMemo<FlipSacMapPoint[]>(
    () => dateFilteredRecords.flatMap((record) => {
      if (record.lat === null || record.lon === null) return [];
      return [{
        id: record.chamado,
        service: record.service,
        address: record.address,
        regional: record.regional,
        color: getRegionalTheme(record.regional).accent,
        lat: record.lat,
        lon: record.lon,
      }];
    }),
    [dateFilteredRecords],
  );
  return (
    <div className="mx-auto mt-8 w-full max-w-7xl space-y-8 px-5 pb-12 sm:px-8">
      <div className="flex flex-col justify-between gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">SACs tratados para encaminhamento</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Colunas essenciais preservadas e nomes de serviço simplificados.
          </p>
        </div>
        <button
          type="button"
          onClick={() => downloadCsv(result.valid, "execution")}
          className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          Exportar CSV tratado
        </button>
      </div>

      {result.isolated.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-base font-semibold text-zinc-950 dark:text-white">Itens isolados para conferência</h3>
          <RecordsTable records={result.isolated} compact />
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h3 className="text-base font-semibold text-zinc-950 dark:text-white">Tabela limpa por subprefeitura</h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Filtre por data de agendamento para separar as orientações por subprefeitura.
            </p>
          </div>
          <label className="text-left text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            Data
            <input
              type="date"
              value={dateKeyToInput(activeDate)}
              onChange={(event) => {
                const value = event.target.value;
                setSelectedDate(inputToDateKey(value));
              }}
              className="mt-1 block rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:ring-sky-500/20"
            />
          </label>
        </div>
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-zinc-950 dark:text-white">Mapa dos SACs</h3>
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {mapPoints.length} pontos
            </span>
          </div>
          <FlipSacMap points={mapPoints} />
        </section>
        <div className="space-y-5">
          {filteredByRegional.map(([regional, records]) => (
            <section key={regional} className="space-y-2">
              <div
                className="flex items-center justify-between rounded-lg border bg-white px-4 py-3 dark:bg-zinc-900"
                style={{ borderColor: getRegionalTheme(regional).ring, boxShadow: `inset 4px 0 0 ${getRegionalTheme(regional).accent}` }}
              >
                <h4 className="font-semibold text-zinc-950 dark:text-white">
                  {regional}
                </h4>
                <span
                  className="rounded-full px-3 py-1 text-xs font-semibold"
                  style={{ backgroundColor: getRegionalTheme(regional).bg, color: getRegionalTheme(regional).text }}
                >
                  {records.length} SACs
                </span>
              </div>
              <RecordsTable records={records} />
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}

function AnalysisContent({ result }: { result: ParseResult }) {
  const [serviceFeatures, setServiceFeatures] = useState<Partial<Record<EscalonadoServiceKey, FeatureRecord[]>>>({});
  const [answerPatterns, setAnswerPatterns] = useState<Record<string, AnswerService>>({});
  const [loadingContext, setLoadingContext] = useState(true);

  useEffect(() => {
    let active = true;
    setLoadingContext(true);
    Promise.all([loadEscalonadoFeatures(), loadAnswerPatterns()])
      .then(([features, patterns]) => {
        if (!active) return;
        setServiceFeatures(features);
        setAnswerPatterns(patterns);
      })
      .finally(() => {
        if (active) setLoadingContext(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const enrichedRecords = useMemo<AnalysisRecord[]>(() => {
    return result.valid.map((record) => {
      const point: [number, number] | null = record.lat === null || record.lon === null ? null : [record.lat, record.lon];
      const scheduleMatches: Partial<Record<EscalonadoServiceKey, ScheduleMatch | null>> = {};
      if (point) {
        for (const service of ESCALONADO_SERVICES) {
          scheduleMatches[service] = findScheduleMatch(serviceFeatures[service] ?? [], point, service);
        }
      }
      return {
        ...record,
        scheduleMatches,
        primarySchedule: pickPrimarySchedule(record, scheduleMatches),
      };
    });
  }, [result.valid, serviceFeatures]);

  return (
    <div className="mx-auto mt-8 w-full max-w-[80vw] space-y-6 pb-12 max-lg:max-w-none max-lg:px-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="Total" value={result.records.length} icon="fa-solid fa-file-lines" />
        <SummaryCard label="Aguardando análise" value={enrichedRecords.length} icon="fa-solid fa-magnifying-glass-location" />
        <SummaryCard label="Isolados" value={result.isolated.length} icon="fa-solid fa-triangle-exclamation" />
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Base carregada</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
              SACs cruzados com {ESCALONADO_SERVICES.map((service) => ESCALONADO_SERVICE_TITLES[service]).join(", ")}.
            </p>
          </div>
          {loadingContext ? (
            <span className="inline-flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" />
              Carregando cronogramas e respostas
            </span>
          ) : null}
        </div>
      </div>
      <AnalysisRecordsTable records={enrichedRecords} answerPatterns={answerPatterns} />
      {result.isolated.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-base font-semibold text-zinc-950 dark:text-white">Itens isolados para conferência</h3>
          <RecordsTable records={result.isolated} compact />
        </section>
      ) : null}
    </div>
  );
}

export function FlipSacPage({ mode }: { mode: FlipMode }) {
  const [result, setResult] = useState<ParseResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const isExecution = mode === "execution";

  const handleFile = async (file: File) => {
    setError(null);
    setProcessing(true);
    setProgress(18);
    try {
      const buffer = await file.arrayBuffer();
      setProgress(58);
      const parsed = parseWorkbook(file.name, buffer, mode);
      setProgress(100);
      setResult(parsed);
    } catch (err) {
      console.error(err);
      setError("Não foi possível ler a planilha. Confirme se o arquivo veio do FLIP em formato Excel.");
    } finally {
      window.setTimeout(() => {
        setProcessing(false);
        setProgress(0);
      }, 400);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-zinc-900 dark:text-zinc-100">
      <AppHeader />
      <section className="mx-auto w-full max-w-6xl px-5 pb-6 pt-6 text-center sm:px-8 sm:pt-10">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-700 dark:text-sky-300">FLIP</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-normal text-zinc-950 dark:text-white sm:text-5xl">
          {isExecution ? "Acompanhamento de execução" : "Aguardando Análise"}
        </h1>
        <p className="mx-auto mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          {isExecution
            ? "Carregue a planilha de SACs em execução para limpar dados, isolar divergências e organizar os agendamentos por regional."
            : "Carregue a planilha de entrada dos SACs para validar origem, status e coordenadas antes da análise fiscal."}
        </p>
      </section>
      <Dropzone mode={mode} result={result} processing={processing} progress={progress} onFile={handleFile} />
      {error ? (
        <div className="mx-auto mt-4 max-w-3xl rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-100">
          {error}
        </div>
      ) : null}
      {result ? (isExecution ? <ExecutionContent result={result} /> : <AnalysisContent result={result} />) : null}
    </main>
  );
}
