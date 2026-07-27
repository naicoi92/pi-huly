// render/document.ts — TUI render cho huly_get_document (title + content preview).
// Design: 04-system.md §6 render/document.ts, 06-api.md §3 render hooks (D12).
//
// renderDocumentResult theo pi signature: (result, options, theme, context) => Component.
// Pure format function (formatDocumentPreview) dùng theme.fg() colorize.
//
// Layout:
//   ┌ Title (bold, mdHeading color)
//     ─── Content ───
//     <content preview, 12 dòng đầu>
//     modifiedOn: 2026-01-01 (dim)

import { Text } from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";
import type { AgentToolResult, ToolRenderResultOptions } from "@earendil-works/pi-coding-agent";
import type { RenderTheme, RenderContext } from "./issue.js";

/** Document details shape từ huly_get_document (xem domains/documents.ts). */
export interface DocumentDetails {
  id?: string;
  title?: string;
  content?: string;
  modifiedOn?: number;
}

/** Re-export RenderTheme cho consumer single-import. */
export type { RenderTheme } from "./issue.js";

/** Format timestamp (Unix ms) → YYYY-MM-DD; undefined → "". */
function fmtDate(ms: number | undefined, theme: RenderTheme): string {
  if (ms === undefined || ms === null) return "";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  return theme.fg("warning", d.toISOString().slice(0, 10));
}

/**
 * Format document preview. Pure function — testable.
 * Layout:
 *   ─── Title ─── (mdHeading, bold)
 *   <content preview — 12 dòng đầu>
 *   modified: 2026-01-01 (dim, optional)
 *
 * Content preview giới hạn 12 dòng (pi tự truncate byte/line). Tránh dump full
 * document dài vào render (LLM đã nhận content đầy đủ qua tool result text).
 */
export function formatDocumentPreview(details: DocumentDetails, theme: RenderTheme): string {
  const title = details.title ?? "(untitled document)";
  const lines: string[] = [`${theme.bold(theme.fg("mdHeading", title))}`];

  if (details.content !== undefined && details.content.length > 0) {
    const contentLines = details.content.split("\n").slice(0, 12);
    lines.push(theme.dim ? theme.dim("─── Content (preview) ───") : "─── Content (preview) ───");
    lines.push(...contentLines);
  }

  const modified = fmtDate(details.modifiedOn, theme);
  if (modified.length > 0) {
    lines.push(theme.dim ? theme.dim(`modified: ${modified}`) : `modified: ${modified}`);
  }

  return lines.join("\n");
}

/**
 * Render cho huly_get_document (title + content preview).
 * Pi ToolDefinition.renderResult signature.
 */
/** Get-or-create Text component (reuse lastComponent nếu là Text, else create new). */
function getOrCreateText(ctx: RenderContext): Text {
  return ctx.lastComponent instanceof Text ? ctx.lastComponent : new Text("", 0, 0);
}

export function renderDocumentResult(
  result: AgentToolResult<DocumentDetails>,
  _options: ToolRenderResultOptions,
  theme: RenderTheme,
  context: RenderContext,
): Component {
  const text = getOrCreateText(context);
  text.setText(formatDocumentPreview(result.details, theme));
  return text;
}
