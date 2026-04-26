# Security

Pathfinder is a local MCP server. It starts a local `vestige-mcp` child process and sends learning-memory payloads to it over stdio.

## What Pathfinder Can Access

- The arguments passed to Pathfinder tools by your MCP host.
- The local `vestige-mcp` command configured by `VESTIGE_MCP_COMMAND`.
- The Vestige data directory selected by Vestige or `VESTIGE_MCP_ARGS`.

## What Pathfinder Does Not Do

- It does not collect telemetry.
- It does not send memories to a hosted service.
- It does not read your repository files unless you paste or pass content through a tool call.
- It does not require cloud credentials.

## Data Storage

Pathfinder delegates storage to Vestige. By default, Vestige stores data locally. Use an isolated demo database when recording or testing:

```bash
VESTIGE_MCP_ARGS="--data-dir /tmp/pathfinder-demo" npm start
```

## Uninstall

Remove the MCP server entry from your MCP host configuration, then delete the local checkout:

```bash
rm -rf /path/to/pathfinder
```

If you used a temporary Vestige data directory:

```bash
rm -rf /tmp/pathfinder-demo
```

## Reporting Issues

Open a GitHub issue with:

- Operating system
- Node version
- MCP host
- Pathfinder command
- Redacted logs
