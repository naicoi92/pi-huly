// tools/domains/workspace.ts — workspace + profile domain (5 tools).
// Design: 04-system.md §6 (19 domain modules), 06-api.md §4 (Workspace/profile).
//
// Tools (5 — all read, FR-04 D4):
//   1. huly_get_workspace_info      — workspace name/url (current)
//   2. huly_list_workspaces         — bound workspaces từ credentials.json
//   3. huly_list_workspace_members  — employees trong workspace
//   4. huly_get_user_profile        — current user (getCurrentUser passthrough)
//   5. huly_update_user_profile     — update current user name/email
//
// _class refs: contact.class.Person + contact.class.Employee (Huly runtime có
// package đầy đủ, pi-huly bundle KHÔNG — dùng string literal).

import { Type } from "typebox";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { PERSON_CLASS, EMPLOYEE_CLASS, idRef } from "./_class-refs.js";
import { safeUpdateDoc } from "./_common.js";

/**
 * Workspace + profile domain tools (5).
 * Export `tools` cho register.ts (T-30) collect + pi.registerTool.
 */
export const tools: HulyToolDefinition[] = [
  // 1. get_workspace_info — workspace binding hiện tại
  defineHulyTool({
    name: "get_workspace_info",
    label: "Get workspace info",
    description: "Get current workspace info (id, resolved). Use để verify binding sau /huly init.",
    promptSnippet: "Get current Huly workspace binding info.",
    parameters: Type.Object({
      workspace: Type.Optional(
        Type.String({
          description: "Workspace id-handle override (default: cwd-map).",
        }),
      ),
    }),
    async handler(_params, tctx) {
      return {
        content: `Workspace: ${tctx.workspace}`,
        details: { workspace: tctx.workspace },
      };
    },
  }),

  // 2. list_workspaces — list bound workspaces từ current user account
  defineHulyTool({
    name: "list_workspaces",
    label: "List workspaces",
    description: "List workspaces current user có access (query Person/Employee trong workspace).",
    promptSnippet: "List Huly workspaces accessible by current user.",
    parameters: Type.Object({
      workspace: Type.Optional(Type.String()),
      limit: Type.Optional(
        Type.Integer({
          description: "Max results (default: 50).",
          minimum: 1,
        }),
      ),
    }),
    async handler(params, tctx) {
      const limit = typeof params.limit === "number" ? params.limit : 50;
      const persons = await tctx.client.findAll(PERSON_CLASS, {}, { limit });
      const list = persons.map((p) => ({
        id: p._id,
        name: (p as { name?: string }).name ?? "",
      }));
      return {
        content: `Found ${list.length} workspace member(s).`,
        details: { count: list.length, members: list },
      };
    },
  }),

  // 3. list_workspace_members — employees/persons trong workspace
  defineHulyTool({
    name: "list_workspace_members",
    label: "List workspace members",
    description:
      "List members (employees) trong workspace — dùng cho assignee resolution, mention.",
    promptSnippet: "List Huly workspace members (employees).",
    promptGuidelines: [
      "Use huly_list_workspace_members để tìm email/name người dùng cho assignee.",
    ],
    parameters: Type.Object({
      workspace: Type.Optional(Type.String()),
      limit: Type.Optional(Type.Integer({ minimum: 1 })),
    }),
    async handler(params, tctx) {
      const limit = typeof params.limit === "number" ? params.limit : 50;
      const employees = await tctx.client.findAll(EMPLOYEE_CLASS, {}, { limit });
      const list = employees.map((e) => ({
        id: e._id,
        name: (e as { name?: string }).name ?? "",
        email: (e as { email?: string }).email,
      }));
      return {
        content: `Found ${list.length} member(s).`,
        details: { count: list.length, members: list },
      };
    },
  }),

  // 4. get_user_profile — current user (passthrough getCurrentUser)
  defineHulyTool({
    name: "get_user_profile",
    label: "Get user profile",
    description: "Get current user profile (id, name, email) — default assignee source.",
    promptSnippet: "Get current Huly user profile.",
    parameters: Type.Object({
      workspace: Type.Optional(Type.String()),
    }),
    async handler(_params, tctx) {
      return {
        content: `User: ${tctx.currentUser.name} <${tctx.currentUser.email}> (id: ${tctx.currentUser.id})`,
        details: { user: tctx.currentUser },
      };
    },
  }),

  // 5. update_user_profile — update current user (name)
  defineHulyTool({
    name: "update_user_profile",
    label: "Update user profile",
    description: "Update current user profile (name).",
    promptSnippet: "Update current Huly user profile.",
    parameters: Type.Object({
      workspace: Type.Optional(Type.String()),
      name: Type.Optional(Type.String({ description: "New display name." })),
    }),
    async handler(params, tctx) {
      // Update current account Person record
      const operations: Record<string, unknown> = {};
      if (typeof params.name === "string" && params.name.length > 0) {
        operations.name = params.name;
      }
      if (Object.keys(operations).length === 0) {
        return {
          content: "No fields to update.",
          details: { updated: false },
        };
      }
      // T-50 #40: lookup Person record để resolve .space ĐÚNG (Person.space),
      // KHÔNG dùng currentUser.id làm space. Bug gốc: updateDoc(PERSON_CLASS,
      // currentUser.id, currentUser.id, ops) → cả space + objectId = Person._id
      // → server match (_id AND space) không tìm thấy doc → TxUpdateDoc skip,
      // update KHÔNG persist (silent). Warning spam "no document found".
      const person = await tctx.client.findOne(PERSON_CLASS, {
        _id: idRef(tctx.currentUser.id),
      });
      if (!person) {
        return {
          content: `Person "${tctx.currentUser.id}" not found. Cannot update profile.`,
          isError: true,
          details: { userId: tctx.currentUser.id },
        };
      }
      // T-50 review fix → T-63 centralized: schema drift guard qua safeUpdateDoc.
      // Helper extract .space/._id từ doc + guard undefined → isError rõ ràng
      // (KHÔNG gửi updateDoc với undefined → silent no-op prevention).
      const result = await safeUpdateDoc(tctx.client, PERSON_CLASS, person, operations);
      if (!result.ok) return result.error;
      return {
        content: `Updated profile: ${Object.keys(operations).join(", ")}`,
        details: { updated: true, fields: Object.keys(operations) },
      };
    },
  }),
];
