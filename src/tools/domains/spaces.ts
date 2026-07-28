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

  // 3. list_space_types — T-73: honest-unavailable (fabricated data removed).
  // Space types = SpaceTypeDescriptor config (drive/class注册), KHÔNG query tự do.
  // Pi-huly KHÔNG bundle drive plugin → KHÔNG access descriptors honestly.
  defineHulyTool({
    name: "list_space_types",
    label: "List space types",
    description:
      "UNAVAILABLE — space types = SpaceTypeDescriptor config (drive plugin not " +
      "bundled). Create/browse spaces via Huly UI.",
    parameters: Type.Object({ workspace: workspaceParam }),
    async handler(_params, _tctx) {
      return {
        content:
          "list_space_types KHÔNG khả dụng: space types = SpaceTypeDescriptor " +
          "config registered qua drive plugin (pi-huly KHÔNG bundle drive). " +
          "Browse/create spaces qua Huly UI trực tiếp.",
        isError: true,
        details: { reason: "spacetype_descriptor_inaccessible" },
      };
    },
  }),

  // 4. get_space_type — T-73: honest-unavailable
  defineHulyTool({
    name: "get_space_type",
    label: "Get space type",
    description:
      "UNAVAILABLE — space type = SpaceTypeDescriptor config (drive plugin not " +
      "bundled). Browse via Huly UI.",
    parameters: Type.Object({
      workspace: workspaceParam,
      spaceType: Type.String(),
    }),
    async handler(_params, _tctx) {
      return {
        content:
          "get_space_type KHÔNG khả dụng: space type = SpaceTypeDescriptor config " +
          "(drive plugin not bundled). Browse via Huly UI.",
        isError: true,
        details: { reason: "spacetype_descriptor_inaccessible" },
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
