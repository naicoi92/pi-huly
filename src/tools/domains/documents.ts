// tools/domains/documents.ts — Documents/Teamspaces domain (10 tools).
// Design: 06-api.md §4 Documents/Teamspaces. Teamspace + Document CRUD.
//
// Tools (10, FR-04 D4):
//   Teamspaces (5): list/get/create/update/delete_teamspace
//   Documents (5): list/get/create/edit/delete_document

import { Type } from "typebox";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { SPACE_CLASS } from "./_class-refs.js";
import { workspaceParam, limitParam } from "./_common.js";

/** T-60: Honest-unavailable message cho document CRUD tools (interface orphan). */
function documentUnavailableMessage(operation: string): string {
  return (
    `huly_${operation} KHÔNG khả dụng: Huly runtime class ` +
    `"tracker:class:Document" interface tồn tại trong source NHƯNG KHÔNG ` +
    `register trong plugin() class block (interface orphan — T-58 DEEP-AUDIT ` +
    `12 packages @0.7.423). Runtime fail "domain not found" (#55). Browse ` +
    `documents qua Huly UI trực tiếp. Document search cũng đã remove (T-60).`
  );
}

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
  // T-54 #58 + T-58 DEEP-AUDIT (2026-07-28, 12 packages @0.7.423):
  //   - `core:class:Space` là base abstract KHÔNG có SpaceTypeDescriptor →
  //     createDoc tạo space vô hình (UI không hiển thị).
  //   - KHÔNG có class "Teamspace" runtime (UI label only).
  //   - Documents Teamspace thật = `drive:class:Drive` (extends TypedSpace,
  //     register trong drive plugin line 31, có SpaceTypeDescriptor DriveType).
  //   - NHƯNG createDoc Drive cần `type: Ref<SpaceType>` field (TypedSpace
  //     required) = `drive.DefaultDrive` ref (branded, runtime-generate, KHÔNG
  //     access từ pi-huly vì drive plugin KHÔNG bundled).
  //
  // Honest-unavailable: pi-huly KHÔNG có drive.DefaultDrive ref → KHÔNG tạo
  // Drive đúng cách (thiếu type field → server reject). Recovery: user tạo
  // space qua Huly UI (UI resolve SpaceType descriptor), sau đó list_teamspaces.
  defineHulyTool({
    name: "create_teamspace",
    label: "Create teamspace",
    description:
      "Create teamspace. UNAVAILABLE — needs drive:class:Drive + SpaceType ref not " +
      "accessible from pi-huly (drive plugin not bundled). Use Huly UI to create space, " +
      "then list_teamspaces to see it.",
    parameters: Type.Object({
      workspace: workspaceParam,
      name: Type.String(),
      description: Type.Optional(Type.String()),
      private: Type.Optional(Type.Boolean()),
    }),
    async handler(params, tctx) {
      return {
        content:
          `create_teamspace KHÔNG khả dụng: Documents Teamspace thật là ` +
          `drive:class:Drive (T-58 audit confirm), NHƯNG createDoc cần ` +
          `\`type: Ref<SpaceType>\` field = drive.DefaultDrive ref (branded, ` +
          `runtime-generate, KHÔNG access từ pi-huly vì drive plugin KHÔNG ` +
          `bundled). Pi-huly KHÔNG đoán SpaceType ref (sai type → space lỗi). ` +
          `Recovery: tạo space "${params.name}" qua Huly UI trực tiếp (UI ` +
          `resolve SpaceType descriptor đúng), sau đó gọi huly_list_teamspaces ` +
          `để lấy id.`,
        isError: true,
        details: {
          reason: "spacetype_ref_inaccessible",
          candidateClass: "drive:class:Drive",
          missingField: "type (Ref<SpaceType>)",
          workspace: tctx.workspace,
          name: params.name,
        },
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

  // === Documents (5) — T-60 #55 #64: ALL honest-unavailable ===
  // tracker:class:Document interface exists trong tracker source (src/index.ts:338)
  // NHƯNG KHÔNG register trong plugin() class block (interface orphan) → runtime
  // fail "domain not found" (#55 report 2 lần). Huly KHÔNG register Document
  // class trong 12 packages audited @0.7.423. Document CRUD marked honest-
  // unavailable — browse documents qua Huly UI trực tiếp.

  // 6. list_documents — honest-unavailable
  defineHulyTool({
    name: "list_documents",
    label: "List documents",
    description:
      "UNAVAILABLE — tracker:class:Document not registered runtime. Browse documents via Huly UI.",
    parameters: Type.Object({
      workspace: workspaceParam,
      teamspace: Type.String(),
      limit: limitParam,
      titleSearch: Type.Optional(Type.String()),
    }),
    async handler(_params, _tctx) {
      return {
        content: documentUnavailableMessage("list_documents"),
        isError: true,
        details: { reason: "interface_orphan", useClass: "tracker:class:Document" },
      };
    },
  }),

  // 7. get_document — honest-unavailable
  defineHulyTool({
    name: "get_document",
    label: "Get document",
    description:
      "UNAVAILABLE — tracker:class:Document not registered runtime. View document via Huly UI.",
    parameters: Type.Object({
      workspace: workspaceParam,
      document: Type.String(),
    }),
    async handler(_params, _tctx) {
      return {
        content: documentUnavailableMessage("get_document"),
        isError: true,
        details: { reason: "interface_orphan", useClass: "tracker:class:Document" },
      };
    },
  }),

  // 8. create_document — honest-unavailable
  defineHulyTool({
    name: "create_document",
    label: "Create document",
    description:
      "UNAVAILABLE — tracker:class:Document not registered runtime. Create document via Huly UI.",
    parameters: Type.Object({
      workspace: workspaceParam,
      teamspace: Type.String(),
      title: Type.String(),
      content: Type.Optional(Type.String({ description: "Markdown content." })),
    }),
    async handler(_params, _tctx) {
      return {
        content: documentUnavailableMessage("create_document"),
        isError: true,
        details: { reason: "interface_orphan", useClass: "tracker:class:Document" },
      };
    },
  }),

  // 9. edit_document — honest-unavailable
  defineHulyTool({
    name: "edit_document",
    label: "Edit document",
    description:
      "UNAVAILABLE — tracker:class:Document not registered runtime. Edit document via Huly UI.",
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
    async handler(_params, _tctx) {
      return {
        content: documentUnavailableMessage("edit_document"),
        isError: true,
        details: { reason: "interface_orphan", useClass: "tracker:class:Document" },
      };
    },
  }),

  // 10. delete_document — honest-unavailable (destructive flag giữ cho UI consistency)
  defineHulyTool({
    name: "delete_document",
    label: "Delete document",
    description:
      "UNAVAILABLE — tracker:class:Document not registered runtime. Delete document via Huly UI.",
    destructive: true,
    destructiveContext: (p) => ({
      type: "document",
      id: (p as { document?: string }).document ?? "<unknown>",
    }),
    parameters: Type.Object({
      workspace: workspaceParam,
      document: Type.String(),
    }),
    async handler(_params, _tctx) {
      return {
        content: documentUnavailableMessage("delete_document"),
        isError: true,
        details: { reason: "interface_orphan", useClass: "tracker:class:Document" },
      };
    },
  }),
];
