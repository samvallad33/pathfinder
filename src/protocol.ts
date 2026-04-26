import readline from "node:readline";
import { stdin as input, stdout as output } from "node:process";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: JsonValue;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: JsonValue;
  error?: {
    code: number;
    message: string;
    data?: JsonValue;
  };
}

export interface ToolContent {
  type: "text";
  text: string;
}

export interface ToolCallResult {
  content: ToolContent[];
  isError?: boolean;
}

export function textResult(text: string, isError = false): ToolCallResult {
  return {
    content: [{ type: "text", text }],
    ...(isError ? { isError: true } : {})
  };
}

export function jsonTextResult(value: unknown, isError = false): ToolCallResult {
  return textResult(JSON.stringify(value, null, 2), isError);
}

export function writeJson(value: unknown): void {
  output.write(`${JSON.stringify(value)}\n`);
}

export function createLineReader(onLine: (line: string) => void): readline.Interface {
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  rl.on("line", onLine);
  return rl;
}

export function success(id: JsonRpcId | undefined, result: JsonValue): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

export function failure(
  id: JsonRpcId | undefined,
  code: number,
  message: string,
  data?: JsonValue
): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data })
    }
  };
}

export function asObject(
  value: JsonValue | undefined,
  label = "value",
  allowUndefined = false
): Record<string, JsonValue> {
  if (value === undefined && allowUndefined) {
    return {};
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label}: expected object`);
  }
  return value;
}
