// tools/domains/document-snapshots.ts — Document snapshots domain (2 tools).
// Design: 06-api.md §4 Snapshots. Read-only version history.

import { Type } from "typebox";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { DOCUMENT_SNAPSHOT_CLASS } from "./_class-refs.js";
import { workspaceParam } from "./_common.js";

export const tools: HulyToolDefinition[] = [
  // 1. list_document_snapshots
  defineHulyTool({
    name: "list_document_snapshots",
    label: "List document snapshots",
    description: "List version history snapshots của document.",
    parameters: Type.Object({
      workspace: workspaceParam,
      document: Type.String({ description: "Document id." }),
    }),
    async handler(params, tctx) {
      const snaps = await tctx.client.findAll(
        DOCUMENT_SNAPSHOT_CLASS,
        { attachedTo: params.document },
        {},
      );
      const list = snaps.map((s) => ({
        _id: s._id,
        createdOn: (s as { createdOn?: number }).createdOn,
        modifiedBy: (s as { modifiedBy?: string }).modifiedBy,
      }));
      return {
        content: `Found ${list.length} snapshot(s).`,
        details: { count: list.length, snapshots: list },
      };
    },
  }),

  // 2. get_document_snapshot
  defineHulyTool({
    name: "get_document_snapshot",
    label: "Get document snapshot",
    description: "Get document content tại snapshot version.",
    parameters: Type.Object({
      workspace: workspaceParam,
      snapshot: Type.String({ description: "Snapshot id." }),
    }),
    async handler(params, tctx) {
      const snap = await tctx.client.findOne(DOCUMENT_SNAPSHOT_CLASS, {
        _id: params.snapshot,
      });
      if (!snap) {
        return {
          content: `Snapshot "${params.snapshot}" not found.`,
          isError: true,
          details: { snapshot: params.snapshot },
        };
      }
      return {
        content: `Snapshot ${params.snapshot}`,
        details: {
          _id: snap._id,
          content: (snap as { content?: string }).content,
          createdOn: (snap as { createdOn?: number }).createdOn,
          modifiedBy: (snap as { modifiedBy?: string }).modifiedBy,
        },
      };
    },
  }),
];
