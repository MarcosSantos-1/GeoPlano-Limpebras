import { minDistancePointToPolylineMeters, OVERLAPPING_LINE_PICK_METERS } from "@/lib/polylineDistance";
import type { FeatureRecord } from "@/lib/types";

export type EscalonadoServiceKey = "GO" | "MT" | "BL" | "VJ_VL";

export type DateSlot = {
  value: Date;
  label: "Anterior" | "Próxima" | "Futura";
};

export type ScheduleMatch = {
  service: EscalonadoServiceKey;
  serviceName: string;
  setor: string;
  featureName: string;
  nextDate: string;
  dates: string[];
  source: "date-list" | "weekday" | "sync-plus-days";
  frequency?: string | null;
  cronograma?: string | null;
};

export const ESCALONADO_SERVICES: EscalonadoServiceKey[] = ["GO", "MT", "BL", "VJ_VL"];

export const ESCALONADO_SERVICE_TITLES: Record<EscalonadoServiceKey, string> = {
  GO: "Cata-Bagulho",
  MT: "Mutirão",
  BL: "Boca de Lobo",
  VJ_VL: "Varrição",
};

const POINT_PICK_METERS = 70;

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

export function normalizeToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function parseScheduleDates(value?: string | null): Date[] {
  if (!value) return [];
  const seen = new Set<number>();
  return value
    .split(";")
    .map((part) => part.trim())
    .map((part) => {
      const match = part.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!match) return null;
      const [, dd, mm, yyyy] = match;
      return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    })
    .filter((date): date is Date => !!date && !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime())
    .filter((date) => {
      const time = date.getTime();
      if (seen.has(time)) return false;
      seen.add(time);
      return true;
    });
}

export function pickDatesAroundToday(dates: Date[], previousCount: number, futureCount: number): DateSlot[] {
  if (dates.length === 0) return [];
  const today = normalizeToday().getTime();
  let pivot = dates.findIndex((date) => date.getTime() >= today);
  if (pivot < 0) pivot = dates.length - 1;
  const before = dates.slice(Math.max(0, pivot - previousCount), pivot);
  const current = dates[pivot] ? [dates[pivot]] : [];
  const after = dates.slice(pivot + 1, pivot + 1 + futureCount);
  return [
    ...before.map((value) => ({ value, label: "Anterior" as const })),
    ...current.map((value) => ({
      value,
      label: value.getTime() < today ? ("Anterior" as const) : ("Próxima" as const),
    })),
    ...after.map((value) => ({ value, label: "Futura" as const })),
  ];
}

export function formatDateKey(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatDateShort(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateLong(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function isSameDay(first: Date, second: Date): boolean {
  return first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate();
}

function pickUpcomingScheduleDates(dates: Date[]): Date[] {
  if (dates.length === 0) return [];
  const today = normalizeToday();
  const pivot = dates.findIndex((date) => date.getTime() >= today.getTime());
  if (pivot < 0) return [];
  const picked = [dates[pivot]];
  if (isSameDay(dates[pivot], today) && dates[pivot + 1]) picked.push(dates[pivot + 1]);
  return picked;
}

function pointInPolygon(point: [number, number], ring: [number, number][]): boolean {
  if (ring.length < 3) return false;
  const [lat, lon] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [latI, lonI] = ring[i];
    const [latJ, lonJ] = ring[j];
    const intersects =
      latI > lat !== latJ > lat &&
      lon < ((lonJ - lonI) * (lat - latI)) / (latJ - latI || Number.EPSILON) + lonI;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function isFeatureAtPoint(feature: FeatureRecord, point: [number, number]): boolean {
  const geometry = feature.geometry ?? "polygon";
  if (geometry === "line" || geometry === "multiline") {
    return minDistancePointToPolylineMeters(point, feature.coords) <= OVERLAPPING_LINE_PICK_METERS;
  }
  if (geometry === "point") {
    const coords = feature.coords as [number, number][];
    const first = coords[0];
    return !!first && minDistancePointToPolylineMeters(point, [first, first]) <= POINT_PICK_METERS;
  }
  const coords = feature.coords as [number, number][];
  return pointInPolygon(point, coords) || minDistancePointToPolylineMeters(point, coords) <= POINT_PICK_METERS;
}

function weekdaysFromText(value?: string | null): number[] {
  if (!value) return [];
  const text = normalizeText(value);
  if (text.includes("diario") || text.includes("diaria") || text.includes("seg a dom") || text.includes("segunda a domingo")) {
    return [0, 1, 2, 3, 4, 5, 6];
  }
  const dayMap: Array<[string, number]> = [
    ["domingo", 0],
    ["segunda", 1],
    ["terca", 2],
    ["quarta", 3],
    ["quinta", 4],
    ["sexta", 5],
    ["sabado", 6],
  ];
  const found = dayMap.filter(([name]) => text.includes(name)).map(([, day]) => day);
  const rangeMatch = text.match(/(domingo|segunda|terca|quarta|quinta|sexta|sabado)\s+a\s+(domingo|segunda|terca|quarta|quinta|sexta|sabado)/);
  if (rangeMatch) {
    const start = dayMap.find(([name]) => name === rangeMatch[1])?.[1];
    const end = dayMap.find(([name]) => name === rangeMatch[2])?.[1];
    if (start !== undefined && end !== undefined) {
      const days: number[] = [];
      for (let day = start; ; day = (day + 1) % 7) {
        days.push(day);
        if (day === end) break;
      }
      return days;
    }
  }
  return Array.from(new Set(found)).sort((a, b) => a - b);
}

export function nextDateFromWeekdays(value?: string | null): Date | null {
  const weekdays = weekdaysFromText(value);
  if (weekdays.length === 0) return null;
  const today = normalizeToday();
  for (let offset = 0; offset <= 7; offset += 1) {
    const candidate = new Date(today);
    candidate.setDate(today.getDate() + offset);
    if (weekdays.includes(candidate.getDay())) return candidate;
  }
  return null;
}

function nextDatesFromWeekdays(value?: string | null): Date[] {
  const weekdays = weekdaysFromText(value);
  if (weekdays.length === 0) return [];
  const today = normalizeToday();
  const picked: Date[] = [];
  for (let offset = 0; offset <= 14; offset += 1) {
    const candidate = new Date(today);
    candidate.setDate(today.getDate() + offset);
    if (!weekdays.includes(candidate.getDay())) continue;
    picked.push(candidate);
    if (offset > 0 || picked.length >= 2) break;
  }
  return picked;
}

export function nextScheduleDateForFeature(feature: FeatureRecord, service: EscalonadoServiceKey): ScheduleMatch | null {
  const dateList = parseScheduleDates(feature.cronograma);
  const dateListPicks = pickUpcomingScheduleDates(dateList);
  const weekdayPicks = service === "VJ_VL"
    ? nextDatesFromWeekdays(feature.cronograma || feature.frequencia)
    : [];
  const pickedDates = dateListPicks.length > 0 ? dateListPicks : weekdayPicks;
  if (pickedDates.length === 0) return null;
  return {
    service,
    serviceName: ESCALONADO_SERVICE_TITLES[service],
    setor: feature.setor,
    featureName: feature.name || feature.setor,
    nextDate: formatDateKey(pickedDates[0]),
    dates: pickedDates.map(formatDateKey),
    source: dateListPicks.length > 0 ? "date-list" : "weekday",
    frequency: feature.frequencia,
    cronograma: feature.cronograma,
  };
}

export function findScheduleMatch(features: FeatureRecord[], point: [number, number], service: EscalonadoServiceKey): ScheduleMatch | null {
  const match = features.find((feature) => isFeatureAtPoint(feature, point));
  return match ? nextScheduleDateForFeature(match, service) : null;
}
