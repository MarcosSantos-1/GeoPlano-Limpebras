import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

const ANSWERS_PATH = path.resolve(process.cwd(), "..", "mapsDescription", "zFLIP", "AnswersPattern.md");

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function classifyTemplate(title: string): AnswerStatus {
  const key = normalizeText(title);
  if (key.includes("nao procede")) return "nao-procede";
  if (key.includes("fora")) return "fora-escopo";
  if (key.includes("procede") && key.includes("execut")) return "executado";
  if (key.includes("procede")) return "procede";
  return "outro";
}

function parseAnswers(raw: string): Record<string, AnswerService> {
  const services: Record<string, AnswerService> = {};
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  let currentService: AnswerService | null = null;
  let currentTemplate: AnswerTemplate | null = null;
  const body: string[] = [];

  const flushTemplate = () => {
    if (!currentService || !currentTemplate) return;
    currentTemplate.message = body.join("\n").trim();
    currentService.templates.push(currentTemplate);
    currentTemplate = null;
    body.length = 0;
  };

  for (const line of lines) {
    const serviceMatch = line.match(/^(\d+)\s*[–-]\s+(.+)$/);
    const templateMatch = line.match(/^(\d+\.\d+)\.?\s*[–-]\s+(.+)$/);

    if (serviceMatch && !templateMatch) {
      flushTemplate();
      const [, number, title] = serviceMatch;
      currentService = { number, title: title.trim(), templates: [] };
      services[number] = currentService;
      continue;
    }

    if (templateMatch && currentService) {
      flushTemplate();
      const [, code, title] = templateMatch;
      currentTemplate = {
        code,
        title: title.trim(),
        status: classifyTemplate(title),
        message: "",
      };
      continue;
    }

    if (currentTemplate) body.push(line);
  }

  flushTemplate();
  return services;
}

export async function GET() {
  try {
    const raw = await fs.readFile(ANSWERS_PATH, "utf-8");
    return NextResponse.json(
      { services: parseAnswers(raw) },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("Erro ao carregar respostas padrão:", error);
    return NextResponse.json({ services: {}, error: "Respostas padrão não encontradas" }, { status: 200 });
  }
}
