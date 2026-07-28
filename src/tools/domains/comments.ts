// tools/domains/comments.ts — Comments domain (4 tools).
// Design: 06-api.md §4 Comments. Body KHÔNG "message" (gotcha).
//
// Comment = chunter:class:ChatMessage attached to issue.

import { Type } from "typebox";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { CHAT_MESSAGE_CLASS, ISSUE_CLASS } from "./_class-refs.js";
import {
  workspaceParam,
  projectParam,
  identifierParam,
  resolveIdentifier,
  safeUpdateDoc,
  safeRemoveDoc,
} from "./_common.js";

export const tools: HulyToolDefinition[] = [
  // 1. list_comments
  defineHulyTool({
    name: "list_comments",
    label: "List comments",
    description: "List comments trên issue.",
    needsProject: true,
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      identifier: identifierParam,
    }),
    async handler(params, tctx) {
      const issue = await tctx.client.findOne(ISSUE_CLASS, {
        identifier: resolveIdentifier(tctx.project!, params.identifier),
      });
      if (!issue) {
        return {
          content: `Issue "${params.identifier}" not found.`,
          isError: true,
          details: { identifier: params.identifier },
        };
      }
      const comments = await tctx.client.findAll(CHAT_MESSAGE_CLASS, { attachedTo: issue._id }, {});
      const list = comments.map((c) => ({
        _id: c._id,
        body: (c as { body?: string }).body,
        createdOn: (c as { createdOn?: number }).createdOn,
        modifiedBy: (c as { modifiedBy?: string }).modifiedBy,
      }));
      return {
        content: `Found ${list.length} comment(s) on ${params.identifier}.`,
        details: { count: list.length, comments: list },
      };
    },
  }),

  // 2. add_comment — body KHÔNG "message" (06-api §4 gotcha)
  defineHulyTool({
    name: "add_comment",
    label: "Add comment",
    description: 'Add comment to issue. Field "body" (KHÔNG "message" — gotcha).',
    needsProject: true,
    needsAssignee: true,
    assigneeField: "author",
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      identifier: identifierParam,
      body: Type.String({ description: "Comment body (markdown)." }),
    }),
    async handler(params, tctx) {
      const issue = await tctx.client.findOne(ISSUE_CLASS, {
        identifier: resolveIdentifier(tctx.project!, params.identifier),
      });
      if (!issue) {
        return {
          content: `Issue "${params.identifier}" not found.`,
          isError: true,
          details: { identifier: params.identifier },
        };
      }
      const id = await tctx.client.addCollection(
        CHAT_MESSAGE_CLASS,
        issue.space as never,
        issue._id as never,
        ISSUE_CLASS,
        "comments",
        { body: params.body },
      );
      return {
        content: `Comment added to ${params.identifier}.`,
        details: { id, identifier: params.identifier },
      };
    },
  }),

  // 3. update_comment
  defineHulyTool({
    name: "update_comment",
    label: "Update comment",
    description: "Update comment body.",
    parameters: Type.Object({
      workspace: workspaceParam,
      comment: Type.String(),
      body: Type.String(),
    }),
    async handler(params, tctx) {
      const c = await tctx.client.findOne(CHAT_MESSAGE_CLASS, { _id: params.comment });
      if (!c) {
        return {
          content: `Comment "${params.comment}" not found.`,
          isError: true,
          details: { comment: params.comment },
        };
      }
      const updResult = await safeUpdateDoc(tctx.client, CHAT_MESSAGE_CLASS, c, {
        body: params.body,
      });
      if (!updResult.ok) return updResult.error;
      return {
        content: `Updated comment ${params.comment}.`,
        details: { updated: true, comment: params.comment },
      };
    },
  }),

  // 4. delete_comment — destructive
  defineHulyTool({
    name: "delete_comment",
    label: "Delete comment",
    description: "Delete comment (destructive).",
    destructive: true,
    destructiveContext: (p) => ({
      type: "comment",
      id: (p as { comment?: string }).comment ?? "<unknown>",
    }),
    parameters: Type.Object({
      workspace: workspaceParam,
      comment: Type.String(),
    }),
    async handler(params, tctx) {
      const c = await tctx.client.findOne(CHAT_MESSAGE_CLASS, { _id: params.comment });
      if (!c) {
        return {
          content: `Comment "${params.comment}" not found.`,
          isError: true,
          details: { comment: params.comment },
        };
      }
      const delResult = await safeRemoveDoc(tctx.client, CHAT_MESSAGE_CLASS, c);
      if (!delResult.ok) return delResult.error;
      return {
        content: `Deleted comment ${params.comment}.`,
        details: { deleted: true, comment: params.comment },
      };
    },
  }),
];
