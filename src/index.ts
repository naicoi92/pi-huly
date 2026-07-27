// pi-huly extension entry — factory register tools + commands + lifecycle.
// Design: 04-system.md §6 index.ts, 07-uc-04 (subagent shared pool), FR-12 (session_shutdown).
//
// Factory (T-33):
//   1. registerAllTools(pi) — 102 tools từ 21 domain modules (register.ts)
//   2. wire render hooks vào 3 high-value tools (huly_get_issue/list_issues/get_document)
//   3. registerHulyCommand(pi) — unified /huly command (commands/huly.ts)
//   4. pi.on("session_shutdown") → pool.closeAll() — cleanup WS connections (FR-12)
//   5. Skills qua package manifest `pi.skills` (declarative, KHÔNG runtime register)
//
// R6 verification: type-only import force load pi types → typecheck catch TS 7
// incompatibility với pi types sớm (design 03 §8 R6).

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { HULY_VERSION } from "./version.js";
// Re-export giữ backward-compat cho consumer import từ index.
export { HULY_VERSION };

import { allTools, registerAllTools } from "./tools/register.js";
import type { HulyToolDefinition } from "./tools/builder.js";
import { registerHulyCommand } from "./commands/huly.js";
import { closeAll } from "./client/pool.js";
import { renderIssueListResult, renderIssueResult } from "./render/issue.js";
import { renderDocumentResult } from "./render/document.js";

/**
 * RenderResult signature của pi ToolDefinition.renderResult (subset cast).
 * HulyToolDefinition (builder seam) KHÔNG declare renderResult — pi ToolDefinition
 * có. Define signature độc lập để attach runtime mà KHÔNG sửa builder.
 */
type RenderResultFn = (
  result: unknown,
  options: { expanded: boolean; isPartial: boolean },
  theme: unknown,
  context: { lastComponent?: unknown },
) => unknown;

/** Map tool name → render hook (3 high-value per design 04 §6 D12). */
const RENDER_HOOKS: Record<string, RenderResultFn> = {
  huly_get_issue: renderIssueResult as unknown as RenderResultFn,
  huly_list_issues: renderIssueListResult as unknown as RenderResultFn,
  huly_get_document: renderDocumentResult as unknown as RenderResultFn,
};

/**
 * Wire render hooks vào tools trước khi register (mutate tool object).
 * Tools KHÔNG trong RENDER_HOOKS → pi fallback default text render (~99 tool).
 * HulyToolDefinition KHÔNG declare renderResult (builder seam), nhưng pi
 * ToolDefinition hỗ trợ — attach runtime, register.ts cast qua full shape.
 */
function attachRenderHooks(): void {
  for (const tool of allTools) {
    const hook = RENDER_HOOKS[tool.name];
    if (hook !== undefined) {
      (tool as HulyToolDefinition & { renderResult?: RenderResultFn }).renderResult = hook;
    }
  }
}

/**
 * pi-huly extension factory — pi gọi default export khi load extension.
 *
 * @param pi Pi ExtensionAPI
 * @returns number of tools registered (debug aid; consumer check /huly status)
 */
export default function setup(pi: ExtensionAPI): number {
  // 1. Wire render hooks vào 3 high-value tools (mutate trước register)
  attachRenderHooks();

  // 2. Register 102 tools (21 domain modules)
  const toolCount = registerAllTools(pi);

  // 3. Register unified /huly command (init/status/workspace/link/unlink)
  registerHulyCommand(pi);

  // 4. session_shutdown hook → close all WS connections (FR-12, D14 pool cleanup).
  // closeAll fire-and-forget — pi shutdown không chờ, KHÔNG block exit.
  pi.on("session_shutdown", async () => {
    try {
      await closeAll();
    } catch {
      // Shutdown cleanup KHÔNG block exit — swallow để pi exit sạch.
    }
  });

  // 5. Skills qua package manifest `pi.skills` (declarative — pi auto-load, KHÔNG runtime)

  return toolCount;
}
