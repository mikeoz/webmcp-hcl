# WebMCP + Human Consent Layer

**WebMCP standardizes how agents discover and call tools on web pages. The HCL standardizes how humans consent to those tool calls. They are complementary.**

WebMCP ([W3C Web Machine Learning CG Draft](https://webmachinelearning.github.io/webmcp/)) lets a website declare its capabilities as structured, callable tools. An AI agent operating in the browser can discover and invoke these tools directly instead of scraping the DOM and guessing which button to click.

What WebMCP does not provide is a consent checkpoint between the tool call and the action. When an agent calls `order-prints(10)`, there is no standard mechanism for the human to see what is about to happen and say yes or no before it executes.

This library adds that mechanism. It wraps WebMCP tool registrations with [Human Consent Layer](https://github.com/mikeoz/human-consent-layer) consent gates so that every tool call passes through the human before it fires.

## What This Library Does

- **Wraps `navigator.modelContext.registerTool()`** with an HCL consent checkpoint. The tool does not execute until the human approves.
- **Declarative API support.** Add `data-hcl-consent="true"` to HTML form tool annotations and the consent gate activates automatically.
- **Consent card UI component.** A Green Shield consent card that renders in any page context, showing Entity, Data, Use, and Boundary context before the human decides.
- **Audit logging.** Every consent decision (Allow/Deny) is recorded in a SHA-256 hash chain in the browser's session, verifiable after the fact.

## Quick Start — Imperative API

```html
<script src="src/webmcp-hcl.js"></script>
<script>
  // Instead of navigator.modelContext.registerTool(toolDef),
  // use WebMCPHCL.registerTool(toolDef, cardContext):

  WebMCPHCL.registerTool({
    name: "order-prints",
    description: "Orders the current design for printing and shipping.",
    inputSchema: {
      type: "object",
      properties: { copies: { type: "number" } },
      required: ["copies"]
    },
    execute({ copies }) {
      initiatePrintCheckout(copies);
    }
  }, {
    entity: { name: "PrintShop Agent", operator: "PrintCo", shield: "green" },
    data: { summary: "Your current design file" },
    use: { summary: "Print and ship " + "copies of your design" },
    boundary: { summary: "This action only, charges apply" }
  });
</script>
```

When the agent calls `order-prints`, the human sees a Green Shield consent card with the CARD context before the action executes. Allow proceeds. Deny blocks. Timeout blocks (fail-closed).

## Quick Start — Declarative API

```html
<form tool-name="book_table"
      tool-description="Books a table reservation"
      data-hcl-consent="true"
      data-hcl-entity="Restaurant Booking Agent"
      data-hcl-data="Your reservation details"
      data-hcl-use="Book a table at this restaurant"
      data-hcl-boundary="This reservation only">
  <input name="date" type="date" required>
  <input name="guests" type="number" min="1" required>
  <button type="submit">Book Table</button>
</form>
<script src="src/webmcp-hcl.js"></script>
```

The library scans for forms with `data-hcl-consent="true"` and wraps their WebMCP tool registration with the consent gate automatically.

## How It Works

1. You register a tool with `WebMCPHCL.registerTool()` instead of the native `navigator.modelContext.registerTool()`.
2. The library registers the tool with WebMCP normally — agents can discover it.
3. When an agent invokes the tool, the library intercepts the execution.
4. A Green Shield consent card appears showing the CARD context (Entity, Data, Use, Boundary).
5. The human clicks Allow or Deny.
6. Allow: the original `execute()` function runs. Deny: the tool returns a structured denial to the agent.
7. The decision is logged to a SHA-256 hash chain in the browser session.

No changes are required to the agent, the WebMCP implementation, or the site's existing tool logic. The consent gate wraps the execution transparently.

## Demo

Open `demo/index.html` in Chrome with the WebMCP flag enabled (`chrome://flags/#enable-webmcp-testing`). The demo page registers two tools with HCL consent gating and shows the consent card flow.

## Files

webmcp-hcl/
├── src/
│ ├── webmcp-hcl.js # Core library: tool wrapper + consent gate
│ ├── consent-card.js # Green Shield consent card UI component
│ └── audit-log.js # Browser-side SHA-256 audit chain
├── demo/
│ └── index.html # Working demo page
├── README.md
└── LICENSE # Apache 2.0


## Design Principles

- **Zero dependencies.** Pure JavaScript. No framework. No build step.
- **Fail-closed.** If the consent card cannot render, or if the human does not respond, the tool does not execute (INV-FC).
- **Transparent to agents.** The agent discovers and calls tools normally via WebMCP. It does not know the consent gate exists.
- **Transparent to sites.** The site's `execute()` function is unchanged. The consent gate wraps it.

## Related

- [Human Consent Layer](https://github.com/mikeoz/human-consent-layer) — The HCL specification and CARD schemas.
- [HCL DevKit](https://github.com/mikeoz/hcl-devkit) — Server-side developer tools for HCL integration.
- [WebMCP Spec](https://webmachinelearning.github.io/webmcp/) — W3C Draft Community Group Report.
- [CROCbox](https://github.com/mikeoz/crocbox) — HCL reference implementation for OpenClaw agents.
- [opn.li](https://opn.li) — The Openly Trusted Network.

## License

Apache 2.0 — Opnli Corporation
