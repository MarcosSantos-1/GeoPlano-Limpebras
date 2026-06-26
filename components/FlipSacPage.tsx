"use client";

import { useMemo, useRef, useState } from "react";
import clsx from "clsx";
import * as XLSX from "xlsx";
import { AppHeader } from "@/components/AppHeader";

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

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
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
        "mx-auto w-full max-w-3xl rounded-lg border border-dashed bg-white p-8 text-center shadow-sm transition dark:bg-zinc-900",
        dragActive
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
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-left text-sm text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100">
          <div className="flex items-center gap-3">
            <i className="fa-solid fa-circle-check" aria-hidden />
            <div className="min-w-0">
              <p className="truncate font-semibold">{result.fileName}</p>
              <p className="text-xs opacity-80">
                {result.records.length} linhas carregadas para validação de {expectedStatus}.
              </p>
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
    <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <table className="w-full table-fixed text-left text-sm">
        <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          <tr>
            <th className="w-[18%] px-3 py-3">Nº Chamado</th>
            <th className="w-[22%] px-3 py-3">Serviço</th>
            <th className="px-3 py-3">Endereço</th>
            {!compact ? <th className="w-[18%] px-3 py-3">Data Sincronização</th> : null}
            <th className="w-[16%] px-3 py-3">Agendamento</th>
            {compact ? <th className="w-[28%] px-3 py-3">Motivo</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {records.map((record) => (
            <tr key={`${record.rowNumber}-${record.chamado}`} className="text-zinc-700 dark:text-zinc-200">
              <td className="break-words px-3 py-3 font-semibold text-zinc-950 dark:text-white">{record.chamado}</td>
              <td className="break-words px-3 py-3">{record.service}</td>
              <td className="break-words px-3 py-3">{record.address}</td>
              {!compact ? <td className="break-words px-3 py-3">{record.syncDate}</td> : null}
              <td className="break-words px-3 py-3">{record.scheduleDate || "—"}</td>
              {compact ? <td className="break-words px-3 py-3 text-amber-700 dark:text-amber-300">{record.issues.join(" | ")}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExecutionContent({ result }: { result: ParseResult }) {
  const byRegional = useMemo(() => groupBy(result.valid, (record) => record.regional), [result.valid]);
  const byDate = useMemo(() => groupBy(result.valid, (record) => record.scheduleDate || "Sem data"), [result.valid]);
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
    () => groupBy(dateFilteredRecords, (record) => record.regional),
    [dateFilteredRecords],
  );
  return (
    <div className="mx-auto mt-8 w-full max-w-6xl space-y-8 px-5 pb-12 sm:px-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <SummaryCard label="Total" value={result.records.length} icon="fa-solid fa-file-lines" />
        <SummaryCard label="Válidos" value={result.valid.length} icon="fa-solid fa-circle-check" />
        <SummaryCard label="Isolados" value={result.isolated.length} icon="fa-solid fa-triangle-exclamation" />
        <SummaryCard label="Regionais" value={byRegional.length} icon="fa-solid fa-map-location-dot" />
      </div>

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

      <section className="space-y-4">
        <h3 className="text-base font-semibold text-zinc-950 dark:text-white">Agendamentos por data</h3>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {byDate.map(([date, records]) => (
            <div key={date} className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
              <div className="flex items-center justify-between gap-3">
                <h4 className="font-semibold text-zinc-950 dark:text-white">{date}</h4>
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {records.length} SACs
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {groupBy(records, (record) => record.regional).map(([regional, regionalRecords]) => (
                  <div key={regional} className="rounded-md bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-800/70">
                    <span className="font-semibold">{regional}</span>
                    <span className="ml-2 text-zinc-500 dark:text-zinc-400">{regionalRecords.length} solicitações</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h3 className="text-base font-semibold text-zinc-950 dark:text-white">Tabela limpa por regional</h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Filtre por data de agendamento para separar as orientações por sub/regional.
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
        <div className="space-y-5">
          {filteredByRegional.map(([regional, records]) => (
            <section key={regional} className="space-y-2">
              <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900">
                <h4 className="font-semibold text-zinc-950 dark:text-white">{regional}</h4>
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
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
  return (
    <div className="mx-auto mt-8 w-full max-w-6xl space-y-6 px-5 pb-12 sm:px-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="Total" value={result.records.length} icon="fa-solid fa-file-lines" />
        <SummaryCard label="Aguardando análise" value={result.valid.length} icon="fa-solid fa-magnifying-glass-location" />
        <SummaryCard label="Isolados" value={result.isolated.length} icon="fa-solid fa-triangle-exclamation" />
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Base carregada</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          A página de análise já valida SACs, status e coordenadas. Nas próximas rodadas ela pode sugerir agendamentos
          com base no plano de trabalho e montar roteiro por localização.
        </p>
      </div>
      <RecordsTable records={result.valid} />
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
