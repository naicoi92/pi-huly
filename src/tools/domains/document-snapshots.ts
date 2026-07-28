// tools/domains/document-snapshots.ts — Document snapshots domain (2 tools).
// Design: 06-api.md §4 Snapshots. Read-only version history.
//
// T-58 #43 fix (2026-07-28): DEEP-AUDIT 12 packages @0.7.423 —
// `document:class:DocumentSnapshot` KHÔNG tồn tại (0 match interface + class
// toàn packages). Deprecated — Huly KHÔNG expose snapshot version history qua
// class riêng runtime. User yêu cầu "KHÔNG defensive che lỗi" → honest-
// unavailable cả 2 tools, hướng dẫn user check document history qua Huly UI
// (Activity panel / version diff).

import { Type } from "typebox";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { workspaceParam } from "./_common.js";

/** Honest-unavailable message cho snapshot tools (deprecated). */
function snapshotUnavailableMessage(operation: string): string {
  return (
    `huly_${operation} KHÔNG khả dụng: Huly runtime class ` +
    `"document:class:DocumentSnapshot" KHÔNG tồn tại (0 match trong 12 packages ` +
    `@0.7.423 — deprecated). Huly KHÔNG expose snapshot version history qua ` +
    `class riêng runtime. Check document history qua Huly UI (Activity panel / ` +
    `version diff) hoặc dùng huly_get_document cho content hiện tại.`
  );
}

export const tools: HulyToolDefinition[] = [
  // 1. list_document_snapshots — honest-unavailable (deprecated)
  defineHulyTool({
    name: "list_document_snapshots",
    label: "List document snapshots",
    description:
      "UNAVAILABLE — DocumentSnapshot deprecated in Huly runtime. Check document history via Huly UI.",
    parameters: Type.Object({
      workspace: workspaceParam,
      document: Type.String({ description: "Document id." }),
    }),
    async handler(_params, _tctx) {
      return {
        content: snapshotUnavailableMessage("list_document_snapshots"),
        isError: true,
        details: { reason: "deprecated", useClass: "document:class:DocumentSnapshot" },
      };
    },
  }),

  // 2. get_document_snapshot — honest-unavailable (deprecated)
  defineHulyTool({
    name: "get_document_snapshot",
    label: "Get document snapshot",
    description:
      "UNAVAILABLE — DocumentSnapshot deprecated in Huly runtime. Use huly_get_document for current content.",
    parameters: Type.Object({
      workspace: workspaceParam,
      snapshot: Type.String({ description: "Snapshot id." }),
    }),
    async handler(_params, _tctx) {
      return {
        content: snapshotUnavailableMessage("get_document_snapshot"),
        isError: true,
        details: { reason: "deprecated", useClass: "document:class:DocumentSnapshot" },
      };
    },
  }),
];
