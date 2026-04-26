# Pathfinder

**Your AI learning partner that remembers what makes things click for you.**

Pathfinder is an MCP server for developer learning memory. It captures technical breakthroughs, confusions, and aha moments, then stores them in [Vestige](https://github.com/samvallad33/vestige) so Claude, Cursor, VS Code, and other MCP hosts can recall what worked for you before.

## Why This Exists

Coding agents help you ship code. Pathfinder helps you become a better developer while you ship.

- Cursor and Copilot write code for you.
- Anki and SyntaxCache drill facts and syntax.
- NotebookLM and ChatGPT explain concepts.
- Pathfinder remembers your mental model: the analogies that worked, the weak spots that keep coming back, and the concepts due for review.

## Architecture

```text
Claude / Cursor / VS Code / any MCP host
  -> Pathfinder MCP server
    -> Vestige MCP server
      -> SQLite + embeddings + FSRS-6 memory
```

Pathfinder is intentionally thin. Vestige owns the durable memory, embeddings, search, and retention machinery.

## Install

Prerequisites:

- Node.js 20+
- `vestige-mcp` installed and available on `PATH`

```bash
git clone https://github.com/samvallad33/pathfinder.git
cd pathfinder
npm install
npm run build
```

Run locally:

```bash
VESTIGE_MCP_COMMAND=vestige-mcp npm start
```

For an isolated demo database:

```bash
VESTIGE_MCP_ARGS="--data-dir /tmp/pathfinder-demo" npm start
```

## Claude Code

```bash
claude mcp add pathfinder -- node /absolute/path/to/pathfinder/dist/src/index.js
```

## Claude Desktop

Add this to your Claude Desktop MCP config:

```json
{
  "mcpServers": {
    "pathfinder": {
      "command": "node",
      "args": ["/absolute/path/to/pathfinder/dist/src/index.js"],
      "env": {
        "VESTIGE_MCP_COMMAND": "vestige-mcp"
      }
    }
  }
}
```

## Tools

### `record_learning`

Log a technical learning moment.

```json
{
  "topic": "Zig",
  "concept": "comptime",
  "breakthrough": "It is like Rust generics only where compile-time specialization matters.",
  "difficulty": "medium"
}
```

### `flag_confusion`

Capture a weak spot for follow-up.

```json
{
  "topic": "JavaScript async",
  "text": "I keep mixing up concurrency and parallelism.",
  "why": "Both examples use Promise.all, so the distinction gets blurry."
}
```

### `note_aha`

Save the exact explanation or analogy that made a concept click.

```json
{
  "concept": "Rust ownership",
  "what_clicked": "Ownership works like a library checkout.",
  "analogy_used": "library checkout"
}
```

### `recall_aha`

Recall prior aha moments and analogies.

```json
{
  "query": "Rust ownership library checkout"
}
```

### `pathfinder_status`

Verify that Pathfinder can reach Vestige.

## Day 1 Demo

Ask your MCP host:

> Use Pathfinder to remember that Rust ownership clicked for me with the library-checkout analogy.

Then ask:

> I am learning Zig comptime. Search my learning memory for analogies that may help.

Pathfinder should recall the prior Rust ownership analogy through Vestige.

## Verify

```bash
npm run typecheck
npm run build
VESTIGE_MCP_ARGS="--data-dir /tmp/pathfinder-smoke" npm run smoke
```

## Roadmap

- `whats_holey`: find weak spots in a topic.
- `recall_failures`: recall mistakes before repeating them.
- `bridge_concepts`: connect a new concept to what already clicked.
- `quiz_me`: generate FSRS-aware applied recall.
- `map_my_knowledge`: show solid, holey, and decaying concepts.

## Powered By Vestige

Every Pathfinder install is also a Vestige install path. Pathfinder is the learning-memory wedge; Vestige is the cognitive engine.
