import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";
import type { JsonRpcId, JsonValue } from "./protocol.js";

interface PendingRequest {
  resolve: (value: JsonValue) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export class VestigeClient {
  private child: ChildProcessWithoutNullStreams | undefined;
  private rl: readline.Interface | undefined;
  private initialized = false;
  private nextId = 1;
  private pending = new Map<JsonRpcId, PendingRequest>();

  constructor(
    private readonly command = process.env.VESTIGE_MCP_COMMAND ?? "vestige-mcp",
    private readonly args = splitArgs(process.env.VESTIGE_MCP_ARGS ?? ""),
    private readonly timeoutMs = parseTimeoutMs(process.env.PATHFINDER_CALL_TIMEOUT_MS)
  ) {}

  async callTool(name: string, args: unknown): Promise<JsonValue> {
    await this.ensureInitialized();
    return this.request("tools/call", {
      name,
      arguments: toJsonValue(args)
    });
  }

  async listTools(): Promise<JsonValue> {
    await this.ensureInitialized();
    return this.request("tools/list", {});
  }

  async close(): Promise<void> {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Vestige client closed"));
    }
    this.pending.clear();
    this.rl?.close();
    if (this.child && !this.child.killed) {
      this.child.kill("SIGTERM");
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    this.start();
    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "pathfinder",
        version: "0.1.0"
      }
    });
    this.notify("notifications/initialized", {});
    this.initialized = true;
  }

  private start(): void {
    if (this.child) return;

    this.child = spawn(this.command, this.args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...childEnv(),
        VESTIGE_DASHBOARD_ENABLED: process.env.VESTIGE_DASHBOARD_ENABLED ?? "false",
        VESTIGE_DASHBOARD_PORT: process.env.VESTIGE_DASHBOARD_PORT ?? "3937",
        VESTIGE_HTTP_PORT: process.env.VESTIGE_HTTP_PORT ?? "3938"
      }
    });

    this.child.stderr.on("data", (chunk: Buffer) => {
      process.stderr.write(`[vestige] ${chunk.toString()}`);
    });

    this.child.on("exit", (code, signal) => {
      const message = `vestige-mcp exited${code === null ? "" : ` with code ${code}`}${signal ? ` (${signal})` : ""}`;
      this.rejectPending(new Error(message));
      this.child = undefined;
      this.initialized = false;
    });

    this.child.on("error", (error) => {
      this.rejectPending(new Error(`Failed to start ${this.command}: ${error.message}`));
      this.child = undefined;
      this.initialized = false;
    });

    this.rl = readline.createInterface({
      input: this.child.stdout,
      crlfDelay: Infinity
    });
    this.rl.on("line", (line) => this.handleLine(line));
  }

  private request(method: string, params: JsonValue): Promise<JsonValue> {
    this.start();
    const id = this.nextId++;
    const payload = {
      jsonrpc: "2.0",
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for Vestige response to ${method}`));
      }, this.timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.child?.stdin.write(`${JSON.stringify(payload)}\n`);
    });
  }

  private notify(method: string, params: JsonValue): void {
    const payload = { jsonrpc: "2.0", method, params };
    this.child?.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  private handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) {
      if (trimmed) process.stderr.write(`[vestige stdout] ${trimmed}\n`);
      return;
    }

    let message: { id?: JsonRpcId; result?: JsonValue; error?: { message?: string } };
    try {
      message = JSON.parse(trimmed) as typeof message;
    } catch {
      process.stderr.write(`[vestige stdout] ${trimmed}\n`);
      return;
    }

    if (message.id === undefined) {
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pending.delete(message.id);

    if (message.error) {
      pending.reject(new Error(message.error.message ?? "Vestige JSON-RPC error"));
    } else {
      pending.resolve(message.result ?? null);
    }
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

function splitArgs(value: string): string[] {
  return value.trim() ? value.trim().split(/\s+/) : [];
}

function parseTimeoutMs(value: string | undefined): number {
  if (value === undefined) return 30_000;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30_000;
}

function childEnv(): NodeJS.ProcessEnv {
  const allowed = [
    "PATH",
    "HOME",
    "USER",
    "LOGNAME",
    "SHELL",
    "TMPDIR",
    "RUST_LOG",
    "VESTIGE_AUTH_TOKEN",
    "ORT_DYLIB_PATH",
    "DYLD_LIBRARY_PATH"
  ];
  return Object.fromEntries(
    allowed
      .map((key) => [key, process.env[key]])
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

function toJsonValue(value: unknown, seen = new WeakSet<object>()): JsonValue {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("JSON-RPC payload contains a non-finite number");
    return value;
  }
  if (typeof value === "bigint") {
    throw new Error("JSON-RPC payload contains a BigInt, which is not JSON serializable");
  }
  if (typeof value !== "object") {
    throw new Error(`JSON-RPC payload contains unsupported value type: ${typeof value}`);
  }
  if (seen.has(value)) {
    throw new Error("JSON-RPC payload contains a circular reference");
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item, seen));
  }

  if (Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error("JSON-RPC payload contains a non-plain object");
  }

  const out: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) {
      out[key] = toJsonValue(item, seen);
    }
  }
  return out;
}
