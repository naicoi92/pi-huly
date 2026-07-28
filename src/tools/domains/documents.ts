// tools/domains/documents.ts — Documents/Teamspaces domain (10 tools).
// Design: 06-api.md §4 Documents/Teamspaces. Teamspace + Document CRUD.
//
// T-66 (2026-07-28): RE-ENABLE từ honest-unavailable (T-58/T-60 conclusion sai).
// Real class registered trong @hcengineering/document plugin() block — verified
// vs trusted huly-mcp v0.45. Class refs từ _class-refs.ts (T-65 fix):
//   TEAMSPACE_CLASS = document:class:Teamspace
//   DOCUMENT_CLASS  = document:class:Document
//
// Teamspace model (verified trusted documents.ts):
//   - findAll/findOne TEAMSPACE_CLASS (KHÔNG SPACE_CLASS — trả cross all spaces)
//   - CRUD space param = core.space.Space (root, top-level space parent)
//   - fields: name, description, private, archived, members, owners
//   - create needs icon (documentPlugin.icon.Teamspace) + spaceType
//     (documentPlugin.spaceType.DefaultTeamspaceType) — Ref values từ document
//     plugin, pi-huly KHÔNG bundle → create_teamspace stays honest-unavailable.
//
// Document model (verified trusted documents-edit.ts):
//   - findAll/findOne DOCUMENT_CLASS + space=teamspace._id (scoping)
//   - content = MarkupBlobRef → fetchMarkup (get) / uploadMarkup (create) /
//     updateMarkup (edit khi doc.content đã tồn tại)
//   - parent: Ref<Document> (document hierarchy), rank (lexorank)

import { Type } from "typebox";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { TEAMSPACE_CLASS, DOCUMENT_CLASS, spaceRef } from "./_class-refs.js";
import { workspaceParam, limitParam, safeRemoveDoc } from "./_common.js";

/** Teamspace CRUD space = core.space.Space (root, top-level space parent). */
const TEAMSPACE_PARENT_SPACE = spaceRef("core.space.Space");

/** T-66: create_teamspace stays honest-unavailable (icon/spaceType refs). */
function teamspaceCreateUnavailableMessage(name: string): string {
  return (
    `create_teamspace KHÔNG khả dụng: tạo Teamspace cần icon ref ` +
    `(documentPlugin.icon.Teamspace) + spaceType ref ` +
    `(documentPlugin.spaceType.DefaultTeamspaceType) từ @hcengineering/document ` +
    `plugin. Pi-huly dùng string literal class refs (KHÔNG bundle plugin) → ` +
    `KHÔNG có icon/spaceType Ref values runtime. Recovery: tạo teamspace ` +
    `"${name}" qua Huly UI trực tiếp, sau đó gọi huly_list_teamspaces để lấy id.`
  );
}

export const tools: HulyToolDefinition[] = [
  // === Teamspaces (5) ===

  // 1. list_teamspaces — T-66: TEAMSPACE_CLASS (chỉ trả Teamspace, không lẫn Project/Drive)
  defineHulyTool({
    name: "list_teamspaces",
    label: "List teamspaces",
    description: "List teamspaces (document spaces).",
    parameters: Type.Object({ workspace: workspaceParam, limit: limitParam }),
    async handler(params, tctx) {
      const limit = typeof params.limit === "number" ? params.limit : 50;
      const spaces = await tctx.client.findAll(TEAMSPACE_CLASS, { archived: false }, { limit });
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

  // 2. get_teamspace — T-66: TEAMSPACE_CLASS
  defineHulyTool({
    name: "get_teamspace",
    label: "Get teamspace",
    description: "Get teamspace by id.",
    parameters: Type.Object({
      workspace: workspaceParam,
      teamspace: Type.String(),
    }),
    async handler(params, tctx) {
      const s = await tctx.client.findOne(TEAMSPACE_CLASS, { _id: params.teamspace });
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
          archived: (s as { archived?: boolean }).archived ?? false,
        },
      };
    },
  }),

  // 3. create_teamspace — T-66: stays honest-unavailable (icon/spaceType refs)
  defineHulyTool({
    name: "create_teamspace",
    label: "Create teamspace",
    description:
      "Create teamspace. UNAVAILABLE — needs documentPlugin.icon.Teamspace + " +
      "spaceType.DefaultTeamspaceType refs from @hcengineering/document plugin " +
      "(not bundled in pi-huly). Use Huly UI to create, then list_teamspaces.",
    parameters: Type.Object({
      workspace: workspaceParam,
      name: Type.String(),
      description: Type.Optional(Type.String()),
      private: Type.Optional(Type.Boolean()),
    }),
    async handler(params, _tctx) {
      return {
        content: teamspaceCreateUnavailableMessage(params.name),
        isError: true,
        details: {
          reason: "icon_spacetype_ref_inaccessible",
          missingRefs: [
            "documentPlugin.icon.Teamspace",
            "documentPlugin.spaceType.DefaultTeamspaceType",
          ],
          name: params.name,
        },
      };
    },
  }),

  // 4. update_teamspace — T-66: TEAMSPACE_CLASS + core.space.Space parent
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
      const s = await tctx.client.findOne(TEAMSPACE_CLASS, { _id: params.teamspace });
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
      // Teamspace = top-level space, parent space = core.space.Space (root).
      await tctx.client.updateDoc(
        TEAMSPACE_CLASS,
        TEAMSPACE_PARENT_SPACE,
        s._id as never,
        ops as never,
      );
      return {
        content: `Updated teamspace ${params.teamspace}.`,
        details: { updated: true, fields: Object.keys(ops) },
      };
    },
  }),

  // 5. delete_teamspace — destructive. T-66: TEAMSPACE_CLASS + core.space.Space
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
      const s = await tctx.client.findOne(TEAMSPACE_CLASS, { _id: params.teamspace });
      if (!s) {
        return {
          content: `Teamspace "${params.teamspace}" not found.`,
          isError: true,
          details: { teamspace: params.teamspace },
        };
      }
      await tctx.client.removeDoc(TEAMSPACE_CLASS, TEAMSPACE_PARENT_SPACE, s._id as never);
      return {
        content: `Deleted teamspace ${params.teamspace}.`,
        details: { deleted: true, teamspace: params.teamspace },
      };
    },
  }),

  // === Documents (5) — T-66: RE-ENABLED (DOCUMENT_CLASS + space scoping) ===

  // 6. list_documents — T-66: DOCUMENT_CLASS + space=teamspace._id
  defineHulyTool({
    name: "list_documents",
    label: "List documents",
    description: "List documents in a teamspace.",
    parameters: Type.Object({
      workspace: workspaceParam,
      teamspace: Type.String(),
      limit: limitParam,
      titleSearch: Type.Optional(Type.String()),
    }),
    async handler(params, tctx) {
      const ts = await tctx.client.findOne(TEAMSPACE_CLASS, { _id: params.teamspace });
      if (!ts) {
        return {
          content: `Teamspace "${params.teamspace}" not found.`,
          isError: true,
          details: { teamspace: params.teamspace },
        };
      }
      const limit = typeof params.limit === "number" ? params.limit : 50;
      const query: Record<string, unknown> = { space: ts._id };
      if (params.titleSearch) {
        query.title = { $like: `%${params.titleSearch}%` };
      }
      const docs = await tctx.client.findAll(DOCUMENT_CLASS, query as never, { limit });
      const list = docs.map((d) => ({
        id: d._id,
        title: (d as { title?: string }).title ?? "",
      }));
      return {
        content: `Found ${list.length} document(s) in teamspace "${(ts as { name?: string }).name ?? params.teamspace}".`,
        details: { count: list.length, documents: list },
      };
    },
  }),

  // 7. get_document — T-66: DOCUMENT_CLASS + fetchMarkup content
  defineHulyTool({
    name: "get_document",
    label: "Get document",
    description: "Get document by id with full content (markdown).",
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
      // Document.content = MarkupBlobRef → fetchMarkup resolve to markdown.
      const contentRef = (d as { content?: unknown }).content;
      let content: string | undefined;
      if (contentRef) {
        try {
          content = await tctx.client.fetchMarkup(
            DOCUMENT_CLASS,
            d._id,
            "content",
            contentRef,
            "markdown",
          );
        } catch {
          // Markup fetch fail (blob missing/corrupted) — return metadata without content.
        }
      }
      return {
        content: `Document ${(d as { title?: string }).title ?? ""}`,
        details: {
          id: d._id,
          title: (d as { title?: string }).title,
          content,
        },
      };
    },
  }),

  // 8. create_document — T-66: DOCUMENT_CLASS + uploadMarkup content
  defineHulyTool({
    name: "create_document",
    label: "Create document",
    description: "Create document in a teamspace with optional markdown content.",
    parameters: Type.Object({
      workspace: workspaceParam,
      teamspace: Type.String(),
      title: Type.String(),
      content: Type.Optional(Type.String({ description: "Markdown content." })),
    }),
    async handler(params, tctx) {
      const ts = await tctx.client.findOne(TEAMSPACE_CLASS, { _id: params.teamspace });
      if (!ts) {
        return {
          content: `Teamspace "${params.teamspace}" not found.`,
          isError: true,
          details: { teamspace: params.teamspace },
        };
      }
      // Generate doc id for uploadMarkup (content blob needs id before createDoc).
      const docId = `${DOCUMENT_CLASS as string}.${Math.random().toString(36).slice(2, 12)}`;
      let contentRef: unknown = null;
      if (params.content && params.content.trim() !== "") {
        contentRef = await tctx.client.uploadMarkup(
          DOCUMENT_CLASS,
          docId,
          "content",
          params.content,
          "markdown",
        );
      }
      const newId = await tctx.client.createDoc(
        DOCUMENT_CLASS,
        ts._id as never,
        {
          title: params.title,
          content: contentRef,
        } as never,
        docId as never,
      );
      return {
        content: `Created document "${params.title}" in teamspace "${(ts as { name?: string }).name ?? params.teamspace}".`,
        details: { id: newId, title: params.title, teamspace: ts._id },
      };
    },
  }),

  // 9. edit_document — T-66: DOCUMENT_CLASS + updateMarkup/uploadMarkup
  defineHulyTool({
    name: "edit_document",
    label: "Edit document",
    description: "Edit document. Either full content replace OR search-and-replace.",
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
      const existingContentRef = (d as { content?: unknown }).content;

      // Mode validation: content vs old_text/new_text mutually exclusive.
      if (params.content !== undefined && (params.old_text || params.new_text)) {
        return {
          content: "edit_document: content cannot combine with old_text/new_text.",
          isError: true,
          details: { document: params.document },
        };
      }

      // Mode 1: full content replace.
      if (params.content !== undefined) {
        const newContent = params.content.trim() === "" ? "" : params.content;
        if (existingContentRef) {
          // Doc has existing content blob → updateMarkup overwrite.
          await tctx.client.updateMarkup(DOCUMENT_CLASS, d._id, "content", newContent, "markdown");
        } else {
          // No existing blob → uploadMarkup create new, attach ref.
          const ref = await tctx.client.uploadMarkup(
            DOCUMENT_CLASS,
            d._id,
            "content",
            newContent,
            "markdown",
          );
          await tctx.client.updateDoc(
            DOCUMENT_CLASS,
            ((d as { space?: unknown }).space as never) ?? TEAMSPACE_PARENT_SPACE,
            d._id as never,
            { content: ref } as never,
          );
        }
        return {
          content: `Updated document ${params.document} content.`,
          details: { updated: true, mode: "content-replace", document: d._id },
        };
      }

      // Mode 2: search-and-replace.
      if (params.old_text !== undefined && params.new_text !== undefined) {
        if (!existingContentRef) {
          return {
            content: `Document "${params.document}" has no content to search.`,
            isError: true,
            details: { document: params.document },
          };
        }
        const current = await tctx.client.fetchMarkup(
          DOCUMENT_CLASS,
          d._id,
          "content",
          existingContentRef,
          "markdown",
        );
        const idx = current.indexOf(params.old_text);
        if (idx === -1) {
          return {
            content: `Text not found in document "${params.document}".`,
            isError: true,
            details: { document: params.document, search: params.old_text },
          };
        }
        const occurrences = current.split(params.old_text).length - 1;
        if (occurrences > 1 && !params.replace_all) {
          return {
            content: `Text matches ${occurrences} times. Set replace_all=true to replace all.`,
            isError: true,
            details: { document: params.document, matches: occurrences },
          };
        }
        const updated = params.replace_all
          ? current.split(params.old_text).join(params.new_text)
          : current.substring(0, idx) +
            params.new_text +
            current.substring(idx + params.old_text.length);
        await tctx.client.updateMarkup(DOCUMENT_CLASS, d._id, "content", updated, "markdown");
        return {
          content: `Updated document ${params.document} (search-replace).`,
          details: {
            updated: true,
            mode: "search-replace",
            replaced: params.replace_all ? occurrences : 1,
            document: d._id,
          },
        };
      }

      return {
        content: "edit_document: provide content OR old_text+new_text.",
        isError: true,
        details: { document: params.document },
      };
    },
  }),

  // 10. delete_document — destructive. T-66: DOCUMENT_CLASS + space from doc
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
      const delResult = await safeRemoveDoc(tctx.client, DOCUMENT_CLASS, d);
      if (!delResult.ok) return delResult.error;
      return {
        content: `Deleted document ${params.document}.`,
        details: { deleted: true, document: params.document },
      };
    },
  }),
];
