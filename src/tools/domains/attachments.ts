// tools/domains/attachments.ts — Attachments domain (5 tools).
// Design: 06-api.md §4 Attachments.

import { Type } from "typebox";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { ATTACHMENT_CLASS, ISSUE_CLASS, spaceRef } from "./_class-refs.js";
import { workspaceParam, projectParam, identifierParam, resolveIdentifier } from "./_common.js";

export const tools: HulyToolDefinition[] = [
  // 1. list_attachments
  defineHulyTool({
    name: "list_attachments",
    label: "List attachments",
    description: "List attachments attached to entity.",
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
      const atts = await tctx.client.findAll(ATTACHMENT_CLASS, { attachedTo: issue._id }, {});
      const list = atts.map((a) => ({
        _id: a._id,
        name: (a as { name?: string }).name ?? "",
        contentType: (a as { contentType?: string }).contentType,
        size: (a as { size?: number }).size,
      }));
      return {
        content: `Found ${list.length} attachment(s).`,
        details: { count: list.length, attachments: list },
      };
    },
  }),

  // 2. get_attachment
  defineHulyTool({
    name: "get_attachment",
    label: "Get attachment",
    description: "Get attachment metadata by id.",
    parameters: Type.Object({
      workspace: workspaceParam,
      attachment: Type.String(),
    }),
    async handler(params, tctx) {
      const a = await tctx.client.findOne(ATTACHMENT_CLASS, { _id: params.attachment });
      if (!a) {
        return {
          content: `Attachment "${params.attachment}" not found.`,
          isError: true,
          details: { attachment: params.attachment },
        };
      }
      return {
        content: `Attachment ${(a as { name?: string }).name ?? ""}`,
        details: {
          _id: a._id,
          name: (a as { name?: string }).name,
          contentType: (a as { contentType?: string }).contentType,
          size: (a as { size?: number }).size,
        },
      };
    },
  }),

  // 3. add_attachment (generic)
  defineHulyTool({
    name: "add_attachment",
    label: "Add attachment",
    description: "Add attachment to entity.",
    parameters: Type.Object({
      workspace: workspaceParam,
      attachedTo: Type.String(),
      filename: Type.String(),
      contentType: Type.String(),
      data: Type.Optional(Type.String({ description: "Base64 data." })),
      description: Type.Optional(Type.String()),
    }),
    async handler(params, tctx) {
      const id = await tctx.client.createDoc(ATTACHMENT_CLASS, spaceRef(tctx.workspace), {
        name: params.filename,
        contentType: params.contentType,
        attachedTo: params.attachedTo,
        data: params.data,
        description: params.description,
      });
      return {
        content: `Added attachment "${params.filename}".`,
        details: { id, filename: params.filename },
      };
    },
  }),

  // 4. add_issue_attachment — issue-specific
  defineHulyTool({
    name: "add_issue_attachment",
    label: "Add issue attachment",
    description: "Add attachment to issue.",
    needsProject: true,
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      identifier: identifierParam,
      filename: Type.String(),
      contentType: Type.String(),
      data: Type.Optional(Type.String()),
      description: Type.Optional(Type.String()),
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
        ATTACHMENT_CLASS,
        issue.space as never,
        issue._id as never,
        ISSUE_CLASS,
        "attachments",
        {
          name: params.filename,
          contentType: params.contentType,
          data: params.data,
          description: params.description,
        },
      );
      return {
        content: `Added attachment "${params.filename}" to ${params.identifier}.`,
        details: { id, filename: params.filename, identifier: params.identifier },
      };
    },
  }),

  // 5. download_attachment
  defineHulyTool({
    name: "download_attachment",
    label: "Download attachment",
    description: "Get attachment content (base64).",
    parameters: Type.Object({
      workspace: workspaceParam,
      attachment: Type.String(),
    }),
    async handler(params, tctx) {
      const a = await tctx.client.findOne(ATTACHMENT_CLASS, { _id: params.attachment });
      if (!a) {
        return {
          content: `Attachment "${params.attachment}" not found.`,
          isError: true,
          details: { attachment: params.attachment },
        };
      }
      return {
        content: `Attachment ${(a as { name?: string }).name ?? ""} ready.`,
        details: {
          _id: a._id,
          name: (a as { name?: string }).name,
          contentType: (a as { contentType?: string }).contentType,
          data: (a as { data?: string }).data,
        },
      };
    },
  }),
];
