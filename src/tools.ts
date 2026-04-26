import type { JsonValue, ToolCallResult } from "./protocol.js";
import { jsonTextResult } from "./protocol.js";
import type { VestigeClient } from "./vestige-client.js";

type Args = Record<string, JsonValue>;
const MAX_SHORT_TEXT = 240;
const MAX_MEDIUM_TEXT = 1_000;
const MAX_LONG_TEXT = 8_000;

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonValue;
}

export interface Runtime {
  vestige: VestigeClient;
}

export const tools: ToolDefinition[] = [
  {
    name: "record_learning",
    description:
      "Log a technical learning moment so Pathfinder can build a durable model of what the developer understands, what clicked, and where future review should happen.",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", maxLength: MAX_SHORT_TEXT, description: "Learning area, language, library, or domain." },
        concept: { type: "string", maxLength: MAX_SHORT_TEXT, description: "The specific concept being learned." },
        breakthrough: { type: "string", maxLength: MAX_MEDIUM_TEXT, description: "Optional insight or explanation that helped." },
        source: { type: "string", maxLength: MAX_MEDIUM_TEXT, description: "Optional source, URL, repo, chat, or lesson." },
        difficulty: {
          type: "string",
          enum: ["easy", "medium", "hard"],
          description: "How difficult this concept felt."
        }
      },
      required: ["topic", "concept"]
    }
  },
  {
    name: "flag_confusion",
    description:
      "Capture a weak spot or unresolved confusion so Pathfinder can resurface it later as a learning gap instead of letting it disappear in chat history.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", maxLength: MAX_LONG_TEXT, description: "What is confusing or not yet understood." },
        topic: { type: "string", maxLength: MAX_SHORT_TEXT, description: "Optional topic label." },
        why: { type: "string", maxLength: MAX_MEDIUM_TEXT, description: "Optional reason this is confusing." },
        source: { type: "string", maxLength: MAX_MEDIUM_TEXT, description: "Optional source, URL, repo, chat, or lesson." }
      },
      required: ["text"]
    }
  },
  {
    name: "note_aha",
    description:
      "Save the exact explanation, analogy, or reframing that made a concept click for this developer.",
    inputSchema: {
      type: "object",
      properties: {
        concept: { type: "string", maxLength: MAX_SHORT_TEXT, description: "The concept that clicked." },
        what_clicked: { type: "string", maxLength: MAX_LONG_TEXT, description: "The explanation or mental model that worked." },
        analogy_used: { type: "string", maxLength: MAX_SHORT_TEXT, description: "Optional named analogy, metaphor, or example." },
        source: { type: "string", maxLength: MAX_MEDIUM_TEXT, description: "Optional source, URL, repo, chat, or lesson." }
      },
      required: ["concept", "what_clicked"]
    }
  },
  {
    name: "recall_aha",
    description:
      "Search the developer's learning memory for prior aha moments, analogies, and explanations that worked before.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", maxLength: MAX_MEDIUM_TEXT, description: "Concept, analogy, language, or learning problem to recall." },
        limit: { type: "integer", minimum: 1, maximum: 10, default: 5 }
      },
      required: ["query"]
    }
  },
  {
    name: "pathfinder_status",
    description: "Check whether Pathfinder can reach Vestige and list the backing memory tools.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  }
];

export async function callPathfinderTool(
  runtime: Runtime,
  name: string,
  rawArgs: Args = {}
): Promise<ToolCallResult> {
  try {
    switch (name) {
      case "record_learning":
        return jsonTextResult(await recordLearning(runtime, rawArgs));
      case "flag_confusion":
        return jsonTextResult(await flagConfusion(runtime, rawArgs));
      case "note_aha":
        return jsonTextResult(await noteAha(runtime, rawArgs));
      case "recall_aha":
        return jsonTextResult(await recallAha(runtime, rawArgs));
      case "pathfinder_status":
        return jsonTextResult(await pathfinderStatus(runtime));
      default:
        return jsonTextResult({ ok: false, error: `Unknown Pathfinder tool: ${name}` }, true);
    }
  } catch (error) {
    return jsonTextResult(
      {
        ok: false,
        pathfinderTool: name,
        error: error instanceof Error ? error.message : String(error)
      },
      true
    );
  }
}

async function recordLearning(runtime: Runtime, args: Args): Promise<JsonValue> {
  const topic = requireString(args, "topic", MAX_SHORT_TEXT);
  const concept = requireString(args, "concept", MAX_SHORT_TEXT);
  const breakthrough = optionalString(args, "breakthrough", MAX_MEDIUM_TEXT);
  const difficulty = optionalEnum(args, "difficulty", ["easy", "medium", "hard"]);
  const source = optionalString(args, "source", MAX_MEDIUM_TEXT);

  const tags = compact([
    "pathfinder",
    "learning",
    "capture",
    `topic:${tagValue(topic)}`,
    `concept:${tagValue(concept)}`,
    difficulty ? `difficulty:${difficulty}` : "difficulty:unspecified"
  ]);

  const content = compact([
    "Pathfinder learning record",
    `Topic: ${topic}`,
    `Concept: ${concept}`,
    breakthrough ? `Breakthrough: ${breakthrough}` : undefined,
    difficulty ? `Difficulty: ${difficulty}` : undefined
  ]).join("\n");

  const vestige = await runtime.vestige.callTool("smart_ingest", {
    content,
    node_type: "concept",
    tags,
    source
  });

  return {
    ok: true,
    pathfinderTool: "record_learning",
    delegatedTo: "vestige.smart_ingest",
    tags,
    vestige
  };
}

async function flagConfusion(runtime: Runtime, args: Args): Promise<JsonValue> {
  const text = requireString(args, "text", MAX_LONG_TEXT);
  const topic = optionalString(args, "topic", MAX_SHORT_TEXT);
  const why = optionalString(args, "why", MAX_MEDIUM_TEXT);
  const source = optionalString(args, "source", MAX_MEDIUM_TEXT);

  const tags = compact([
    "pathfinder",
    "confusion",
    "weak-spot",
    topic ? `topic:${tagValue(topic)}` : undefined
  ]);

  const content = compact([
    "Pathfinder confusion flag",
    topic ? `Topic: ${topic}` : undefined,
    `Confusion: ${text}`,
    why ? `Why: ${why}` : undefined
  ]).join("\n");

  const vestige = await runtime.vestige.callTool("smart_ingest", {
    content,
    node_type: "note",
    tags,
    source
  });

  return {
    ok: true,
    pathfinderTool: "flag_confusion",
    delegatedTo: "vestige.smart_ingest",
    tags,
    vestige
  };
}

async function noteAha(runtime: Runtime, args: Args): Promise<JsonValue> {
  const concept = requireString(args, "concept", MAX_SHORT_TEXT);
  const whatClicked = requireString(args, "what_clicked", MAX_LONG_TEXT);
  const analogyUsed = optionalString(args, "analogy_used", MAX_SHORT_TEXT);
  const source = optionalString(args, "source", MAX_MEDIUM_TEXT);

  const tags = compact([
    "pathfinder",
    "aha",
    "analogy",
    `concept:${tagValue(concept)}`,
    analogyUsed ? `analogy:${tagValue(analogyUsed)}` : undefined
  ]);

  const content = compact([
    "Pathfinder aha moment",
    `Concept: ${concept}`,
    `What clicked: ${whatClicked}`,
    analogyUsed ? `Analogy used: ${analogyUsed}` : undefined
  ]).join("\n");

  const vestige = await runtime.vestige.callTool("smart_ingest", {
    content,
    node_type: "concept",
    tags,
    source
  });

  return {
    ok: true,
    pathfinderTool: "note_aha",
    delegatedTo: "vestige.smart_ingest",
    tags,
    vestige
  };
}

async function recallAha(runtime: Runtime, args: Args): Promise<JsonValue> {
  const query = requireString(args, "query", MAX_MEDIUM_TEXT);
  const limit = optionalNumber(args, "limit") ?? 5;
  const boundedLimit = Math.max(1, Math.min(10, Math.floor(limit)));

  const vestige = await runtime.vestige.callTool("search", {
    query,
    limit: boundedLimit,
    detail_level: "summary",
    include_types: ["concept"],
    context_topics: ["pathfinder", "aha", "analogy"],
    retrieval_mode: "balanced"
  });

  return {
    ok: true,
    pathfinderTool: "recall_aha",
    delegatedTo: "vestige.search",
    query,
    limit: boundedLimit,
    vestige
  };
}

async function pathfinderStatus(runtime: Runtime): Promise<JsonValue> {
  const vestige = await runtime.vestige.listTools();
  return {
    ok: true,
    pathfinder: {
      name: "pathfinder",
      version: "0.1.0",
      tools: tools.map((tool) => tool.name)
    },
    vestige
  };
}

function requireString(args: Args, field: string, maxLength: number): string {
  const value = args[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required string argument: ${field}`);
  }
  return validateLength(field, value.trim(), maxLength);
}

function optionalString(args: Args, field: string, maxLength: number): string | undefined {
  const value = args[field];
  return typeof value === "string" && value.trim().length > 0
    ? validateLength(field, value.trim(), maxLength)
    : undefined;
}

function optionalNumber(args: Args, field: string): number | undefined {
  const value = args[field];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalEnum<T extends string>(args: Args, field: string, allowed: readonly T[]): T | undefined {
  const value = optionalString(args, field, MAX_SHORT_TEXT);
  if (value === undefined) return undefined;
  if (!allowed.includes(value as T)) {
    throw new Error(`Invalid ${field}: ${value}. Expected one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

function validateLength(field: string, value: string, maxLength: number): string {
  if (value.length > maxLength) {
    throw new Error(`${field} exceeds maximum length of ${maxLength} characters`);
  }
  return value;
}

function compact(values: Array<string | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value));
}

function tagValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}
