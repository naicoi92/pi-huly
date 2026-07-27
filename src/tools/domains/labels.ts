// tools/domains/labels.ts — Labels domain (4 tools, GLOBAL namespace).
// Design: 06-api.md §4 Labels. CRUD GLOBAL (KHÔNG project-scoped).
//
// Labels khác tags: GLOBAL namespace, mọi project thấy được. (05-data-model §3)

import { Type } from "typebox";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { LABEL_CLASS, spaceRef } from "./_class-refs.js";
import { workspaceParam } from "./_common.js";

export const tools: HulyToolDefinition[] = [
  // 1. list_labels
  defineHulyTool({
    name: "list_labels",
    label: "List labels",
    description: "List global labels (cross-project namespace).",
    parameters: Type.Object({ workspace: workspaceParam }),
    async handler(_params, tctx) {
      const labels = await tctx.client.findAll(LABEL_CLASS, {}, {});
      const list = labels.map((l) => ({
        _id: l._id,
        title: (l as { title?: string }).title ?? "",
        color: (l as { color?: string }).color,
        description: (l as { description?: string }).description,
      }));
      return {
        content: `Found ${list.length} label(s).`,
        details: { count: list.length, labels: list },
      };
    },
  }),

  // 2. create_label
  defineHulyTool({
    name: "create_label",
    label: "Create label",
    description: "Create global label (cross-project).",
    parameters: Type.Object({
      workspace: workspaceParam,
      title: Type.String(),
      color: Type.Optional(Type.String({ description: "Color hex hoặc palette index." })),
      description: Type.Optional(Type.String()),
      category: Type.Optional(Type.String()),
    }),
    async handler(params, tctx) {
      const id = await tctx.client.createDoc(LABEL_CLASS, spaceRef(tctx.workspace), {
        title: params.title,
        color: params.color,
        description: params.description,
        category: params.category,
      });
      return {
        content: `Created label "${params.title}".`,
        details: { id, title: params.title },
      };
    },
  }),

  // 3. update_label
  defineHulyTool({
    name: "update_label",
    label: "Update label",
    description: "Update label (title, color, description, category).",
    parameters: Type.Object({
      workspace: workspaceParam,
      label: Type.String(),
      title: Type.Optional(Type.String()),
      color: Type.Optional(Type.String()),
      description: Type.Optional(Type.String()),
      category: Type.Optional(Type.String()),
    }),
    async handler(params, tctx) {
      const l = await tctx.client.findOne(LABEL_CLASS, { _id: params.label });
      if (!l) {
        return {
          content: `Label "${params.label}" not found.`,
          isError: true,
          details: { label: params.label },
        };
      }
      const ops: Record<string, unknown> = {};
      if (params.title !== undefined) ops.title = params.title;
      if (params.color !== undefined) ops.color = params.color;
      if (params.description !== undefined) ops.description = params.description;
      if (params.category !== undefined) ops.category = params.category;
      if (Object.keys(ops).length === 0) {
        return { content: "No fields to update.", details: { updated: false } };
      }
      await tctx.client.updateDoc(LABEL_CLASS, l.space as never, l._id as never, ops);
      return {
        content: `Updated label ${params.label}.`,
        details: { updated: true, fields: Object.keys(ops) },
      };
    },
  }),

  // 4. delete_label — destructive
  defineHulyTool({
    name: "delete_label",
    label: "Delete label",
    description: "Delete global label (destructive).",
    destructive: true,
    destructiveContext: (p) => ({
      type: "label",
      id: (p as { label?: string }).label ?? "<unknown>",
    }),
    parameters: Type.Object({
      workspace: workspaceParam,
      label: Type.String(),
    }),
    async handler(params, tctx) {
      const l = await tctx.client.findOne(LABEL_CLASS, { _id: params.label });
      if (!l) {
        return {
          content: `Label "${params.label}" not found.`,
          isError: true,
          details: { label: params.label },
        };
      }
      await tctx.client.removeDoc(LABEL_CLASS, l.space as never, l._id as never);
      return {
        content: `Deleted label ${params.label}.`,
        details: { deleted: true, label: params.label },
      };
    },
  }),
];
