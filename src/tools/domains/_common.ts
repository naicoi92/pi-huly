// Common typebox schemas cho domain tools — tránh lặp.
// 06-api.md §2 Common Parameters Convention.

import { Type, type TObject, type TOptional, type TString, type TInteger } from "typebox";

/** Workspace override param (mọi tool). */
export const workspaceParam: TOptional<TString> = Type.Optional(
  Type.String({
    description: "Workspace id-handle override (default: cwd-map).",
  }),
);

/** Project override param (project-scoped tools). */
export const projectParam: TOptional<TString> = Type.Optional(
  Type.String({
    description: "Huly project identifier (vd PD). Default: cwd-map.",
  }),
);

/** Limit param (list tools). Default service-side, pi truncate 50KB/2000 lines. */
export const limitParam: TOptional<TInteger> = Type.Optional(
  Type.Integer({ description: "Max results (default: 50).", minimum: 1 }),
);

/** Identifier param (issue). vd "PD-123" HOẶC raw num. */
export const identifierParam = Type.String({
  description: 'Issue identifier (vd "PD-123") hoặc raw number.',
});

/** Priority enum (create/update issue). */
export const prioritySchema = Type.Optional(
  Type.Union([
    Type.Literal("urgent"),
    Type.Literal("high"),
    Type.Literal("medium"),
    Type.Literal("low"),
    Type.Literal("no-priority"),
  ]),
);

/** statusCategory enum (list/update issue, derived). */
export const statusCategorySchema = Type.Optional(
  Type.Union([
    Type.Literal("UnStarted"),
    Type.Literal("ToDo"),
    Type.Literal("Active"),
    Type.Literal("Won"),
    Type.Literal("Lost"),
  ]),
);

/** Base params mọi tool có: workspace?. */
export function baseParams(): TObject {
  return Type.Object({ workspace: workspaceParam });
}

/**
 * Project base params: workspace? + project?.
 * Domain tool extend thêm field riêng.
 */
export function projectParams(): TObject {
  return Type.Object({ workspace: workspaceParam, project: projectParam });
}

/**
 * Resolve issue identifier: "<PROJ>-<num>" → as-is; raw num → "<project>-<num>".
 * Huly identifier format. Vd "PD-123" hoặc "123" (project=PD).
 */
export function resolveIdentifier(project: string, identifier: string): string {
  if (/^\d+$/.test(identifier)) {
    return `${project}-${identifier}`;
  }
  return identifier;
}
