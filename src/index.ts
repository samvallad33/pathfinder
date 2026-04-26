#!/usr/bin/env node
import { asObject, createLineReader, failure, success, writeJson, type JsonRpcRequest, type JsonValue } from "./protocol.js";
import { callPathfinderTool, tools } from "./tools.js";
import { VestigeClient } from "./vestige-client.js";

const vestige = new VestigeClient();

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("beforeExit", () => {
  void vestige.close();
});

createLineReader((line) => {
  void handleLine(line);
});

async function handleLine(line: string): Promise<void> {
  const trimmed = line.trim();
  if (!trimmed) return;

  let request: JsonRpcRequest;
  try {
    request = JSON.parse(trimmed) as JsonRpcRequest;
  } catch (error) {
    writeJson(failure(null, -32700, "Parse error", String(error)));
    return;
  }

  if (request.id === undefined && request.method?.startsWith("notifications/")) {
    return;
  }

  try {
    switch (request.method) {
      case "initialize":
        writeJson(
          success(request.id, {
            protocolVersion: "2024-11-05",
            serverInfo: {
              name: "pathfinder",
              version: "0.1.0"
            },
            capabilities: {
              tools: { listChanged: false },
              resources: { listChanged: false }
            },
            instructions:
              "Pathfinder is developer learning memory. Use it to capture aha moments, confusions, analogies, and breakthroughs, then recall what made concepts click for this developer before."
          })
        );
        return;

      case "tools/list":
        writeJson(
          success(request.id, {
            tools: tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              inputSchema: tool.inputSchema
            }))
          })
        );
        return;

      case "tools/call": {
        const params = asObject(request.params, "tools/call params");
        const name = typeof params.name === "string" ? params.name : "";
        const args = asObject(params.arguments, "tools/call arguments", true);
        const result = await callPathfinderTool({ vestige }, name, args);
        writeJson(success(request.id, result as unknown as JsonValue));
        return;
      }

      case "resources/list":
        writeJson(success(request.id, { resources: [] }));
        return;

      case "ping":
        writeJson(success(request.id, {}));
        return;

      default:
        writeJson(failure(request.id, -32601, `Method not found: ${request.method}`));
    }
  } catch (error) {
    writeJson(
      failure(
        request.id,
        -32603,
        error instanceof Error ? error.message : "Internal error"
      )
    );
  }
}

async function shutdown(): Promise<void> {
  await vestige.close();
  process.exit(0);
}
