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

import type {
  AgentToolResult,
  ExtensionAPI,
  ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";

import { HULY_VERSION } from "./version.js";
// Re-export giữ backward-compat cho consumer import từ index.
export { HULY_VERSION };

import { allTools, registerAllTools } from "./tools/register.js";
import { registerHulyCommand } from "./commands/huly.js";
import { closeAll } from "./client/pool.js";
import { renderIssueListResult, renderIssueResult } from "./render/issue.js";
import { renderDocumentResult } from "./render/document.js";

/**
 * Render hook signature (pi ToolDefinition.renderResult subset).
 * ToolRenderContext KHÔNG re-export public từ pi → dùng context minimal.
 * Dùng AgentToolResult + ToolRenderResultOptions thật từ pi (type-safe hơn cast toàn bộ).
 */
type RenderHook = (
  result: AgentToolResult<unknown>,
  options: ToolRenderResultOptions,
  theme: unknown,
  context: { lastComponent?: Component },
) => Component;

/** Map tool name → render hook (3 high-value per design 04 §6 D12). */
const RENDER_HOOKS: Record<string, RenderHook> = {
  huly_get_issue: renderIssueResult as unknown as RenderHook,
  huly_list_issues: renderIssueListResult as unknown as RenderHook,
  huly_get_document: renderDocumentResult as unknown as RenderHook,
};

/**
 * Build tool list với render hooks attached (shallow copy — KHÔNG mutate allTools
 * module-level global, tránh leak state giữa các consumer import allTools).
 * Tools KHÔNG trong RENDER_HOOKS → pi fallback default text render (~99 tool).
 */
function buildToolsWithRender(): typeof allTools {
  return allTools.map((tool) => {
    const hook = RENDER_HOOKS[tool.name];
    return hook !== undefined ? { ...tool, renderResult: hook } : tool;
  });
}

/** Module-level guard: setup() chỉ chạy 1 lần (tránh dev-reload leak handler/command). */
let setupCalled = false;

/** Test-only: reset setup guard (vitest isolation — tránh leak state giữa tests). */
export function __resetSetupGuardForTests(): void {
  setupCalled = false;
}

/**
 * pi-huly extension factory — pi gọi default export khi load extension.
 *
 * Idempotent: lần 2+ là no-op (return 0) — tránh dev-reload leak
 * (đăng ký trùng session_shutdown handler + /huly command).
 *
 * @param pi Pi ExtensionAPI
 * @returns number of tools registered (0 nếu đã setup, debug aid)
 */
export default function setup(pi: ExtensionAPI): number {
  // Guard: pi thực guard load 1 lần production, nhưng dev-reload có thể gọi lại.
  // Tránh leak: 2x session_shutdown handler → closeAll() gọi 2 lần song song.
  if (setupCalled) return 0;
  setupCalled = true;

  // 1. Build tools với render hooks (shallow copy, KHÔNG mutate module global)
  const tools = buildToolsWithRender();

  // 2. Register 102 tools (21 domain modules)
  const toolCount = registerAllTools(pi, tools);

  // 3. Register unified /huly command (init/status/workspace/link/unlink)
  registerHulyCommand(pi);

  // 4. session_shutdown hook → close all WS connections (FR-12, D14 pool cleanup).
  // Pi AWAIT handler xong trước khi exit (contract ExtensionHandler async support).
  // closeAll nên ngắn (WS close nhanh) — nếu block lâu, pi shutdown bị chậm.
  pi.on("session_shutdown", async () => {
    try {
      await closeAll();
    } catch {
      // Shutdown cleanup KHÔNG block exit — swallow để pi exit sạch
      // (dù closeAll throw, handler resolve → pi tiếp tục shutdown).
    }
  });

  // 5. Skills qua package manifest `pi.skills` (declarative — pi auto-load, KHÔNG runtime)

  return toolCount;
}
