# Day 1 Demo Script

Title: **I am teaching Claude to remember how I learn.**

## Recording Flow

1. Show the repo and run:

   ```bash
   npm run build
   VESTIGE_MCP_ARGS="--data-dir /tmp/pathfinder-day1" npm run smoke
   ```

2. In Claude/Cursor/VS Code, ask:

   > Use Pathfinder to remember that Rust ownership clicked for me with the library-checkout analogy.

3. Show the `note_aha` tool call.

4. Ask:

   > I am learning Zig comptime. Record that Rust generics are the bridge, but only for compile-time specialization.

5. Show the `record_learning` tool call.

6. Ask:

   > Search my learning memory for the Rust ownership analogy.

7. Show Pathfinder recalling the aha moment through Vestige.

## Hook

I forgot how Rust ownership worked. Again.

The problem was not that no AI could explain it.

The problem was that no AI remembered the explanation that worked for me.

So I am building Pathfinder: an MCP server that remembers what makes technical concepts click for you.
