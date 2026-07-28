// tools/domains/spaces.ts — Spaces domain (5 tools).
// Design: 06-api.md §4 Spaces. Read-heavy + update.

import { Type } from "typebox";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { SPACE_CLASS } from "./_class-refs.js";
import { workspaceParam, safeUpdateDoc } from "./_common.js";

export const tools: HulyToolDefinition[] = [
  // 1. list_spaces
  defineHulyTool({
    name: "list_spaces",
    label: "List spaces",
    description: "List Huly spaces (teamspaces + tracker spaces).",
    parameters: Type.Object({ workspace: workspaceParam }),
    async handler(_params, tctx) {
      const spaces = await tctx.client.findAll(SPACE_CLASS, {}, {});
      const list = spaces.map((s) => ({
        _id: s._id,
        name: (s as { name?: string }).name ?? "",
        description: (s as { description?: string }).description,
      }));
      return {
        content: `Found ${list.length} space(s).`,
        details: { count: list.length, spaces: list },
      };
    },
  }),

  // 2. get_space
  defineHulyTool({
    name: "get_space",
    label: "Get space",
    description: "Get space by id.",
    parameters: Type.Object({
      workspace: workspaceParam,
      space: Type.String(),
    }),
    async handler(params, tctx) {
      const s = await tctx.client.findOne(SPACE_CLASS, { _id: params.space });
      if (!s) {
        return {
          content: `Space "${params.space}" not found.`,
          isError: true,
          details: { space: params.space },
        };
      }
      return {
        content: `Space ${(s as { name?: string }).name ?? ""}`,
        details: {
          _id: s._id,
          name: (s as { name?: string }).name,
          description: (s as { description?: string }).description,
        },
      };
    },
  }),

  // 3. list_space_types
  defineHulyTool({
    name: "list_space_types",
    label: "List space types",
    description: "List space types (categories).",
    parameters: Type.Object({ workspace: workspaceParam }),
    async handler(_params, _tctx) {
      // Space types là const config, không query. Return placeholder list.
      return {
        content: "Space types: teamspace, tracker, document.",
        details: {
          spaceTypes: ["teamspace", "tracker", "document"],
        },
      };
    },
  }),

  // 4. get_space_type
  defineHulyTool({
    name: "get_space_type",
    label: "Get space type",
    description: "Get space type detail by name.",
    parameters: Type.Object({
      workspace: workspaceParam,
      spaceType: Type.String(),
    }),
    async handler(params, _tctx) {
      const known = ["teamspace", "tracker", "document"];
      if (!known.includes(params.spaceType)) {
        return {
          content: `Unknown space type "${params.spaceType}". Known: ${known.join(", ")}.`,
          isError: true,
          details: { spaceType: params.spaceType, known },
        };
      }
      return {
        content: `Space type: ${params.spaceType}`,
        details: { spaceType: params.spaceType },
      };
    },
  }),

  // 5. update_space
  defineHulyTool({
    name: "update_space",
    label: "Update space",
    description: "Update space (name, description).",
    parameters: Type.Object({
      workspace: workspaceParam,
      space: Type.String(),
      name: Type.Optional(Type.String()),
      description: Type.Optional(Type.String()),
    }),
    async handler(params, tctx) {
      const s = await tctx.client.findOne(SPACE_CLASS, { _id: params.space });
      if (!s) {
        return {
          content: `Space "${params.space}" not found.`,
          isError: true,
          details: { space: params.space },
        };
      }
      const ops: Record<string, unknown> = {};
      if (params.name !== undefined) ops.name = params.name;
      if (params.description !== undefined) ops.description = params.description;
      if (Object.keys(ops).length === 0) {
        return { content: "No fields to update.", details: { updated: false } };
      }
      const updResult = await safeUpdateDoc(tctx.client, SPACE_CLASS, s, ops);
      if (!updResult.ok) return updResult.error;
      return {
        content: `Updated space ${params.space}.`,
        details: { updated: true, fields: Object.keys(ops) },
      };
    },
  }),
];
