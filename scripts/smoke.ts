import assert from "node:assert/strict";
import { callPathfinderTool } from "../src/tools.js";
import { VestigeClient } from "../src/vestige-client.js";

const vestige = new VestigeClient();

try {
  const runtime = { vestige };

  const aha = await callPathfinderTool(runtime, "note_aha", {
    concept: "Rust ownership",
    what_clicked:
      "Ownership works like a library checkout: one borrower has the book unless it is explicitly returned or lent by reference.",
    analogy_used: "library checkout",
    source: "Pathfinder Day 1 smoke"
  });

  assert.equal(aha.isError, undefined, extractText(aha));

  const learning = await callPathfinderTool(runtime, "record_learning", {
    topic: "Zig",
    concept: "comptime",
    breakthrough: "Compare it to Rust generics only where compile-time specialization matters.",
    difficulty: "medium",
    source: "Pathfinder Day 1 smoke"
  });

  assert.equal(learning.isError, undefined, extractText(learning));

  const recall = await callPathfinderTool(runtime, "recall_aha", {
    query: "library checkout Rust ownership",
    limit: 5
  });

  assert.equal(recall.isError, undefined, extractText(recall));
  assert.match(extractText(recall), /library checkout|Rust ownership/i);

  console.log("Pathfinder smoke test passed: captured learning, captured aha, recalled the analogy.");
} finally {
  await vestige.close();
}

function extractText(result: { content: Array<{ text: string }> }): string {
  return result.content.map((item) => item.text).join("\n");
}
