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
    private readonly timeoutMs = Number(process.env.PATHFINDER_CALL_TIMEOUT_MS ?? 30_000)
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
        ...process.env,
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
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error(message));
      }
      this.pending.clear();
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
}

function splitArgs(value: string): string[] {
  return value.trim() ? value.trim().split(/\s+/) : [];
}

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}
