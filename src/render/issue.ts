// render/issue.ts — TUI render cho huly_get_issue (card) + huly_list_issues (table).
// Design: 04-system.md §6 render/issue.ts, 06-api.md §3 render hooks (D12).
//
// Render functions theo pi signature: (result, options, theme, context) => Component.
// Strategy: pure format function (formatIssueCard/formatIssueList) dùng theme.fg()
// colorize → wrap vào Text component (reuse context.lastComponent khi có).
//
// Pure function testable KHÔNG cần pi types (chỉ cần theme stub có fg/bg/bold).

import { Text } from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";
import type { AgentToolResult, ToolRenderResultOptions } from "@earendil-works/pi-coding-agent";

/**
 * Minimal render context (ToolRenderContext của pi KHÔNG re-export public).
 * Structurally compatible subset — chỉ cần lastComponent để reuse Text component.
 * Pi truyền full context khi gọi renderResult; ta chỉ dùng field này.
 */
export interface RenderContext {
  /** Previously returned component for this render slot, if any (reuse để avoid flicker). */
  lastComponent?: Component;
}

/** Get-or-create Text component (reuse lastComponent nếu là Text, else create new). */
function getOrCreateText(ctx: RenderContext): Text {
  return ctx.lastComponent instanceof Text ? ctx.lastComponent : new Text("", 0, 0);
}

/** Issue shape từ huly_get_issue details (xem domains/issues-core.ts get_issue). */
export interface IssueDetails {
  identifier?: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  assignee?: string;
  milestone?: string;
  component?: string;
  dueDate?: number;
  estimation?: number;
}

/** IssueListItem shape từ huly_list_issues details. */
export interface IssueListItem {
  identifier?: string;
  title?: string;
  status?: string;
  priority?: string;
  assignee?: string;
}

/** List details shape. */
export interface IssueListDetails {
  count?: number;
  issues?: IssueListItem[];
}

/** Minimal theme surface mà render dùng (injectable test). */
export interface RenderTheme {
  fg(color: string, text: string): string;
  bg?(color: string, text: string): string;
  bold(text: string): string;
  dim?(text: string): string;
  muted?(text: string): string;
}

/** Optional label row nếu giá trị tồn tại. */
function opt(label: string, value: string | undefined, theme: RenderTheme): string {
  if (value === undefined || value === null || value.length === 0) return "";
  return `${theme.bold(label)}: ${value}`;
}

/** Join non-empty lines. */
function joinLines(lines: string[]): string {
  return lines.filter((l) => l.length > 0).join("\n");
}

/** Format timestamp (Unix ms) → YYYY-MM-DD; undefined → "". */
function fmtDate(ms: number | undefined, theme: RenderTheme): string {
  if (ms === undefined || ms === null) return "";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  return theme.fg("warning", d.toISOString().slice(0, 10));
}

/**
 * Format issue card (single issue). Pure function — testable.
 * Layout:
 *   ┌ PD-123: Title (bold)
 *     Status: X · Priority: Y · Assignee: Z
 *     Milestone: M · Component: C · Due: 2026-01-01
 *     ─── Description ───
 *     <description preview>
 */
export function formatIssueCard(details: IssueDetails, theme: RenderTheme): string {
  const id = details.identifier ?? "?";
  const title = details.title ?? "(no title)";
  const header = `${theme.fg("accent", id)}: ${theme.bold(title)}`;

  const meta1 = joinLines([
    opt("Status", details.status ? theme.fg("success", details.status) : undefined, theme),
    opt("Priority", details.priority, theme),
    opt("Assignee", details.assignee, theme),
  ]).replace(/\n/g, " · ");

  const meta2 = joinLines([
    opt("Milestone", details.milestone, theme),
    opt("Component", details.component, theme),
    dueLine(details.dueDate, theme),
    details.estimation !== undefined ? `Estimation: ${details.estimation}m` : "",
  ]).replace(/\n/g, " · ");

  /** Due line: skip nếu dueDate undefined HOẶC invalid (fmtDate trả ""). */
  function dueLine(ms: number | undefined, t: RenderTheme): string {
    if (ms === undefined || ms === null) return "";
    const d = fmtDate(ms, t);
    return d.length > 0 ? `Due: ${d}` : "";
  }

  const lines = [header];
  if (meta1.length > 0) lines.push(meta1);
  if (meta2.length > 0) lines.push(meta2);

  // Description preview (KHÔNG full — pi truncate tự). Giới hạn 8 dòng đầu.
  if (details.description !== undefined && details.description.length > 0) {
    const descLines = details.description.split("\n").slice(0, 8);
    lines.push(theme.dim ? theme.dim("─── Description ───") : "─── Description ───");
    lines.push(...descLines);
  }

  return lines.join("\n");
}

/**
 * Format issue list (compact table). Pure function — testable.
 * Layout:
 *   N issue(s)
 *   PD-123  [Status]  Title                          @assignee
 *   PD-124  [Status]  Another title
 */
export function formatIssueList(details: IssueListDetails, theme: RenderTheme): string {
  const count = details.count ?? details.issues?.length ?? 0;
  const issues = details.issues ?? [];
  if (issues.length === 0) {
    return theme.muted ? theme.muted(`No issues found (${count} total).`) : `No issues found.`;
  }
  const header = `${count} issue(s)`;
  // Column widths: identifier (max 10), status (max 12), title (flex), assignee (suffix)
  const idWidth = Math.max(8, ...issues.map((i) => (i.identifier ?? "").length));
  const rows = issues.map((i) => {
    const id = theme.fg("accent", (i.identifier ?? "?").padEnd(idWidth));
    const status = theme.fg("success", `[${i.status ?? "?"}]`.padEnd(12));
    const title = i.title ?? "(no title)";
    const assignee =
      i.assignee !== undefined && i.assignee.length > 0
        ? ` ${theme.dim ? theme.dim(`@${i.assignee}`) : `@${i.assignee}`}`
        : "";
    return `${id}  ${status}  ${title}${assignee}`;
  });
  return [header, ...rows].join("\n");
}

/**
 * Render cho huly_get_issue (card layout).
 * Pi ToolDefinition.renderResult signature.
 */
export function renderIssueResult(
  result: AgentToolResult<IssueDetails>,
  _options: ToolRenderResultOptions,
  theme: RenderTheme,
  context: RenderContext,
): Component {
  const text = getOrCreateText(context);
  text.setText(formatIssueCard(result.details, theme));
  return text;
}

/**
 * Render cho huly_list_issues (compact table).
 * Pi ToolDefinition.renderResult signature.
 */
export function renderIssueListResult(
  result: AgentToolResult<IssueListDetails>,
  _options: ToolRenderResultOptions,
  theme: RenderTheme,
  context: RenderContext,
): Component {
  const text = getOrCreateText(context);
  text.setText(formatIssueList(result.details, theme));
  return text;
}
