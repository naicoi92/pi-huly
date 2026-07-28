// tools/domains/document-snapshots.ts — Document snapshots domain (2 tools).
// Design: 06-api.md §4 Snapshots. Read-only version history.
//
// T-66 (2026-07-28): RE-ENABLE từ honest-unavailable (T-58 conclusion sai).
// Real class registered trong @hcengineering/document plugin() block —
// `document:class:DocumentSnapshot`. Verified vs trusted huly-mcp v0.45
// (document-snapshots.ts:74,80,95,121,139 dùng documentPlugin.class.DocumentSnapshot).
// Snapshot content = MarkupBlobRef → fetchMarkup.

import { Type } from "typebox";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { DOCUMENT_SNAPSHOT_CLASS } from "./_class-refs.js";
import { workspaceParam } from "./_common.js";

export const tools: HulyToolDefinition[] = [
  // 1. list_document_snapshots — T-66: RE-ENABLED (DOCUMENT_SNAPSHOT_CLASS)
  defineHulyTool({
    name: "list_document_snapshots",
    label: "List document snapshots",
    description: "List document snapshots (version history) for a document.",
    parameters: Type.Object({
      workspace: workspaceParam,
      document: Type.String({ description: "Document id." }),
    }),
    async handler(params, tctx) {
      // Snapshots are AttachedDoc scoped to document via attachedTo.
      const snaps = await tctx.client.findAll(DOCUMENT_SNAPSHOT_CLASS, {
        attachedTo: params.document,
      } as never);
      const list = snaps.map((s) => ({
        id: s._id,
        modifiedBy: (s as { modifiedBy?: string }).modifiedBy,
        modifiedOn: (s as { modifiedOn?: number }).modifiedOn,
      }));
      return {
        content: `Found ${list.length} snapshot(s) for document "${params.document}".`,
        details: { count: list.length, snapshots: list },
      };
    },
  }),

  // 2. get_document_snapshot — T-66: RE-ENABLED + fetchMarkup content
  defineHulyTool({
    name: "get_document_snapshot",
    label: "Get document snapshot",
    description: "Get a document snapshot content (markdown) by snapshot id.",
    parameters: Type.Object({
      workspace: workspaceParam,
      snapshot: Type.String({ description: "Snapshot id." }),
    }),
    async handler(params, tctx) {
      const s = await tctx.client.findOne(DOCUMENT_SNAPSHOT_CLASS, {
        _id: params.snapshot,
      });
      if (!s) {
        return {
          content: `Snapshot "${params.snapshot}" not found.`,
          isError: true,
          details: { snapshot: params.snapshot },
        };
      }
      // Snapshot content = MarkupBlobRef → fetchMarkup resolve to markdown.
      const contentRef = (s as { content?: unknown }).content;
      let content: string | undefined;
      if (contentRef) {
        try {
          content = await tctx.client.fetchMarkup(
            DOCUMENT_SNAPSHOT_CLASS,
            s._id,
            "content",
            contentRef,
            "markdown",
          );
        } catch {
          // Markup fetch fail — return metadata without content.
        }
      }
      return {
        content: `Snapshot ${params.snapshot}`,
        details: {
          id: s._id,
          content,
          modifiedBy: (s as { modifiedBy?: string }).modifiedBy,
          modifiedOn: (s as { modifiedOn?: number }).modifiedOn,
        },
      };
    },
  }),
];
