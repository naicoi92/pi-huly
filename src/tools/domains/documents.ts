// tools/domains/documents.ts — Documents/Teamspaces domain (10 tools).
// Design: 06-api.md §4 Documents/Teamspaces. Teamspace + Document CRUD.
//
// Tools (10, FR-04 D4):
//   Teamspaces (5): list/get/create/update/delete_teamspace
//   Documents (5): list/get/create/edit/delete_document

import { Type } from "typebox";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { SPACE_CLASS, DOCUMENT_CLASS, spaceRef } from "./_class-refs.js";
import { workspaceParam, limitParam } from "./_common.js";
import { mdToMarkup, markupToMd } from "../../markup/markup.js";

export const tools: HulyToolDefinition[] = [
  // === Teamspaces (5) ===

  // 1. list_teamspaces
  defineHulyTool({
    name: "list_teamspaces",
    label: "List teamspaces",
    description: "List teamspaces (document spaces).",
    parameters: Type.Object({ workspace: workspaceParam, limit: limitParam }),
    async handler(params, tctx) {
      const limit = typeof params.limit === "number" ? params.limit : 50;
      const spaces = await tctx.client.findAll(SPACE_CLASS, {}, { limit });
      const list = spaces.map((s) => ({
        id: s._id,
        name: (s as { name?: string }).name ?? "",
        description: (s as { description?: string }).description,
        private: (s as { private?: boolean }).private ?? false,
      }));
      return {
        content: `Found ${list.length} teamspace(s).`,
        details: { count: list.length, teamspaces: list },
      };
    },
  }),

  // 2. get_teamspace
  defineHulyTool({
    name: "get_teamspace",
    label: "Get teamspace",
    description: "Get teamspace by id.",
    parameters: Type.Object({
      workspace: workspaceParam,
      teamspace: Type.String(),
    }),
    async handler(params, tctx) {
      const s = await tctx.client.findOne(SPACE_CLASS, { _id: params.teamspace });
      if (!s) {
        return {
          content: `Teamspace "${params.teamspace}" not found.`,
          isError: true,
          details: { teamspace: params.teamspace },
        };
      }
      return {
        content: `Teamspace ${(s as { name?: string }).name ?? ""}`,
        details: {
          id: s._id,
          name: (s as { name?: string }).name,
          description: (s as { description?: string }).description,
          private: (s as { private?: boolean }).private,
        },
      };
    },
  }),

  // 3. create_teamspace
  defineHulyTool({
    name: "create_teamspace",
    label: "Create teamspace",
    description: "Create teamspace.",
    parameters: Type.Object({
      workspace: workspaceParam,
      name: Type.String(),
      description: Type.Optional(Type.String()),
      private: Type.Optional(Type.Boolean()),
    }),
    async handler(params, tctx) {
      const id = await tctx.client.createDoc(SPACE_CLASS, spaceRef(tctx.workspace), {
        name: params.name,
        description: params.description,
        private: params.private,
      });
      return {
        content: `Created teamspace "${params.name}".`,
        details: { id, name: params.name },
      };
    },
  }),

  // 4. update_teamspace
  defineHulyTool({
    name: "update_teamspace",
    label: "Update teamspace",
    description: "Update teamspace (name, description, private).",
    parameters: Type.Object({
      workspace: workspaceParam,
      teamspace: Type.String(),
      name: Type.Optional(Type.String()),
      description: Type.Optional(Type.String()),
      private: Type.Optional(Type.Boolean()),
    }),
    async handler(params, tctx) {
      const s = await tctx.client.findOne(SPACE_CLASS, { _id: params.teamspace });
      if (!s) {
        return {
          content: `Teamspace "${params.teamspace}" not found.`,
          isError: true,
          details: { teamspace: params.teamspace },
        };
      }
      const ops: Record<string, unknown> = {};
      if (params.name !== undefined) ops.name = params.name;
      if (params.description !== undefined) ops.description = params.description;
      if (params.private !== undefined) ops.private = params.private;
      if (Object.keys(ops).length === 0) {
        return { content: "No fields to update.", details: { updated: false } };
      }
      await tctx.client.updateDoc(SPACE_CLASS, s.space as never, s._id as never, ops);
      return {
        content: `Updated teamspace ${params.teamspace}.`,
        details: { updated: true, fields: Object.keys(ops) },
      };
    },
  }),

  // 5. delete_teamspace — destructive
  defineHulyTool({
    name: "delete_teamspace",
    label: "Delete teamspace",
    description: "Delete teamspace (destructive). Cascade xóa tất cả documents.",
    destructive: true,
    destructiveContext: (p) => ({
      type: "teamspace",
      id: (p as { teamspace?: string }).teamspace ?? "<unknown>",
    }),
    parameters: Type.Object({
      workspace: workspaceParam,
      teamspace: Type.String(),
    }),
    async handler(params, tctx) {
      const s = await tctx.client.findOne(SPACE_CLASS, { _id: params.teamspace });
      if (!s) {
        return {
          content: `Teamspace "${params.teamspace}" not found.`,
          isError: true,
          details: { teamspace: params.teamspace },
        };
      }
      await tctx.client.removeDoc(SPACE_CLASS, s.space as never, s._id as never);
      return {
        content: `Deleted teamspace ${params.teamspace}.`,
        details: { deleted: true, teamspace: params.teamspace },
      };
    },
  }),

  // === Documents (5) ===

  // 6. list_documents
  defineHulyTool({
    name: "list_documents",
    label: "List documents",
    description: "List documents trong teamspace.",
    parameters: Type.Object({
      workspace: workspaceParam,
      teamspace: Type.String(),
      limit: limitParam,
      titleSearch: Type.Optional(Type.String()),
    }),
    async handler(params, tctx) {
      const limit = typeof params.limit === "number" ? params.limit : 50;
      const query: Record<string, unknown> = { space: params.teamspace };
      if (params.titleSearch !== undefined) {
        query.title = { $like: `%${params.titleSearch}%` };
      }
      const docs = await tctx.client.findAll(DOCUMENT_CLASS, query, { limit });
      const list = docs.map((d) => ({
        id: d._id,
        title: (d as { title?: string }).title ?? "",
        modifiedOn: (d as { modifiedOn?: number }).modifiedOn,
      }));
      return {
        content: `Found ${list.length} document(s).`,
        details: { count: list.length, documents: list },
      };
    },
  }),

  // 7. get_document
  defineHulyTool({
    name: "get_document",
    label: "Get document",
    description: "Get document content (markup → markdown convert).",
    parameters: Type.Object({
      workspace: workspaceParam,
      document: Type.String(),
    }),
    async handler(params, tctx) {
      const d = await tctx.client.findOne(DOCUMENT_CLASS, { _id: params.document });
      if (!d) {
        return {
          content: `Document "${params.document}" not found.`,
          isError: true,
          details: { document: params.document },
        };
      }
      const fields = d as {
        title?: string;
        content?: string;
        modifiedOn?: number;
        createdOn?: number;
      };
      // Convert Huly markup → markdown cho LLM (FR-13 R8)
      const contentMd =
        typeof fields.content === "string" ? markupToMd(JSON.parse(fields.content)) : "";
      return {
        content: `# ${fields.title ?? ""}\n\n${contentMd}`,
        details: {
          id: d._id,
          title: fields.title,
          content: contentMd,
          modifiedOn: fields.modifiedOn,
        },
      };
    },
  }),

  // 8. create_document
  defineHulyTool({
    name: "create_document",
    label: "Create document",
    description: "Create document trong teamspace. Content = markdown (auto convert).",
    parameters: Type.Object({
      workspace: workspaceParam,
      teamspace: Type.String(),
      title: Type.String(),
      content: Type.Optional(Type.String({ description: "Markdown content." })),
    }),
    async handler(params, tctx) {
      // Convert markdown → Huly markup trước khi lưu (FR-13 R8)
      const markup = params.content !== undefined ? JSON.stringify(mdToMarkup(params.content)) : "";
      const id = await tctx.client.createDoc(DOCUMENT_CLASS, spaceRef(params.teamspace), {
        title: params.title,
        content: markup,
      });
      return {
        content: `Created document "${params.title}" (id: ${id}).`,
        details: { id, title: params.title, teamspace: params.teamspace },
      };
    },
  }),

  // 9. edit_document — old_text/new_text HOẶC content
  defineHulyTool({
    name: "edit_document",
    label: "Edit document",
    description:
      "Edit document: old_text→new_text (KHÔNG match nhiều → ConflictError, dùng replace_all) HOẶC replace content full.",
    parameters: Type.Object({
      workspace: workspaceParam,
      document: Type.String(),
      old_text: Type.Optional(Type.String()),
      new_text: Type.Optional(Type.String()),
      content: Type.Optional(Type.String({ description: "Full new content (markdown)." })),
      replace_all: Type.Optional(
        Type.Boolean({ description: "true nếu old_text match nhiều (default false)." }),
      ),
    }),
    async handler(params, tctx) {
      const d = await tctx.client.findOne(DOCUMENT_CLASS, { _id: params.document });
      if (!d) {
        return {
          content: `Document "${params.document}" not found.`,
          isError: true,
          details: { document: params.document },
        };
      }
      const fields = d as { title?: string; content?: string };

      if (params.content !== undefined) {
        // Full replace
        const markup = JSON.stringify(mdToMarkup(params.content));
        await tctx.client.updateDoc(DOCUMENT_CLASS, d.space as never, d._id as never, {
          content: markup,
        });
        return {
          content: `Replaced content of document ${params.document}.`,
          details: { updated: true, mode: "full" },
        };
      }

      // old_text/new_text mode
      if (params.old_text === undefined || params.new_text === undefined) {
        return {
          content: "Need either `content` OR (`old_text` + `new_text`).",
          isError: true,
          details: { reason: "missing_params" },
        };
      }
      const currentMd =
        typeof fields.content === "string" ? markupToMd(JSON.parse(fields.content)) : "";
      const matches = currentMd.split(params.old_text).length - 1;
      if (matches === 0) {
        return {
          content: `old_text not found in document.`,
          isError: true,
          details: { reason: "no_match", oldText: params.old_text },
        };
      }
      if (matches > 1 && params.replace_all !== true) {
        return {
          content: `old_text matches ${matches} times. Use replace_all=true.`,
          isError: true,
          details: { reason: "multi_match", matches, suggest: "replace_all=true" },
        };
      }
      const newMd = currentMd.replaceAll(params.old_text, params.new_text);
      const markup = JSON.stringify(mdToMarkup(newMd));
      await tctx.client.updateDoc(DOCUMENT_CLASS, d.space as never, d._id as never, {
        content: markup,
      });
      return {
        content: `Edited document ${params.document} (${matches} replacement(s)).`,
        details: { updated: true, mode: "edit", replacements: matches },
      };
    },
  }),

  // 10. delete_document — destructive
  defineHulyTool({
    name: "delete_document",
    label: "Delete document",
    description: "Delete document (destructive).",
    destructive: true,
    destructiveContext: (p) => ({
      type: "document",
      id: (p as { document?: string }).document ?? "<unknown>",
    }),
    parameters: Type.Object({
      workspace: workspaceParam,
      document: Type.String(),
    }),
    async handler(params, tctx) {
      const d = await tctx.client.findOne(DOCUMENT_CLASS, { _id: params.document });
      if (!d) {
        return {
          content: `Document "${params.document}" not found.`,
          isError: true,
          details: { document: params.document },
        };
      }
      await tctx.client.removeDoc(DOCUMENT_CLASS, d.space as never, d._id as never);
      return {
        content: `Deleted document ${params.document}.`,
        details: { deleted: true, document: params.document },
      };
    },
  }),
];
