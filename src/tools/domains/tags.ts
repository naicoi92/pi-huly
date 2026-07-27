// tools/domains/tags.ts — Tags domain (7 tools).
// Design: 06-api.md §4 Tags. CRUD + attach/detach/list_attached.
//
// Tags khác labels: PROJECT-SCOPED (không global). (05-data-model §3)

import { Type } from "typebox";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { TAG_CLASS, ISSUE_CLASS, spaceRef, idRef } from "./_class-refs.js";
import { workspaceParam, projectParam, identifierParam, resolveIdentifier } from "./_common.js";

export const tools: HulyToolDefinition[] = [
  // 1. list_tags
  defineHulyTool({
    name: "list_tags",
    label: "List tags",
    description: "List tags trong project (project-scoped).",
    needsProject: true,
    parameters: Type.Object({ workspace: workspaceParam, project: projectParam }),
    async handler(_params, tctx) {
      const tags = await tctx.client.findAll(TAG_CLASS, {}, {});
      const list = tags.map((t) => ({
        _id: t._id,
        title: (t as { title?: string }).title ?? "",
        color: (t as { color?: string }).color,
      }));
      return {
        content: `Found ${list.length} tag(s).`,
        details: { count: list.length, tags: list },
      };
    },
  }),

  // 2. create_tag
  defineHulyTool({
    name: "create_tag",
    label: "Create tag",
    description: "Create tag (project-scoped).",
    needsProject: true,
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      title: Type.String(),
      color: Type.Optional(Type.String()),
    }),
    async handler(params, tctx) {
      const id = await tctx.client.createDoc(TAG_CLASS, spaceRef(tctx.workspace), {
        title: params.title,
        color: params.color,
      });
      return {
        content: `Created tag "${params.title}".`,
        details: { id, title: params.title },
      };
    },
  }),

  // 3. update_tag
  defineHulyTool({
    name: "update_tag",
    label: "Update tag",
    description: "Update tag (title, color).",
    needsProject: true,
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      tag: Type.String(),
      title: Type.Optional(Type.String()),
      color: Type.Optional(Type.String()),
    }),
    async handler(params, tctx) {
      const t = await tctx.client.findOne(TAG_CLASS, { _id: params.tag });
      if (!t) {
        return {
          content: `Tag "${params.tag}" not found.`,
          isError: true,
          details: { tag: params.tag },
        };
      }
      const ops: Record<string, unknown> = {};
      if (params.title !== undefined) ops.title = params.title;
      if (params.color !== undefined) ops.color = params.color;
      if (Object.keys(ops).length === 0) {
        return { content: "No fields to update.", details: { updated: false } };
      }
      await tctx.client.updateDoc(TAG_CLASS, t.space as never, t._id as never, ops);
      return {
        content: `Updated tag ${params.tag}.`,
        details: { updated: true, fields: Object.keys(ops) },
      };
    },
  }),

  // 4. delete_tag — destructive
  defineHulyTool({
    name: "delete_tag",
    label: "Delete tag",
    description: "Delete tag (destructive).",
    destructive: true,
    needsProject: true,
    destructiveContext: (p) => ({
      type: "tag",
      id: (p as { tag?: string }).tag ?? "<unknown>",
    }),
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      tag: Type.String(),
    }),
    async handler(params, tctx) {
      const t = await tctx.client.findOne(TAG_CLASS, { _id: params.tag });
      if (!t) {
        return {
          content: `Tag "${params.tag}" not found.`,
          isError: true,
          details: { tag: params.tag },
        };
      }
      await tctx.client.removeDoc(TAG_CLASS, t.space as never, t._id as never);
      return {
        content: `Deleted tag ${params.tag}.`,
        details: { deleted: true, tag: params.tag },
      };
    },
  }),

  // 5. list_attached_tags
  defineHulyTool({
    name: "list_attached_tags",
    label: "List attached tags",
    description: "List tags attached to issue.",
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
      const tags = ((issue as { tags?: unknown[] }).tags ?? []) as Array<{
        _id?: string;
        title?: string;
      }>;
      return {
        content: `Found ${tags.length} tag(s) attached to ${params.identifier}.`,
        details: { count: tags.length, tags },
      };
    },
  }),

  // 6. attach_tag
  defineHulyTool({
    name: "attach_tag",
    label: "Attach tag",
    description: "Attach tag to issue.",
    needsProject: true,
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      identifier: identifierParam,
      tag: Type.String(),
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
      const existing = ((issue as { tags?: unknown[] }).tags ?? []) as unknown[];
      if (existing.includes(params.tag)) {
        return {
          content: `Tag ${params.tag} already attached (no-op).`,
          details: { attached: true, tag: params.tag, idempotent: true },
        };
      }
      await tctx.client.updateDoc(ISSUE_CLASS, issue.space as never, issue._id as never, {
        $push: { tags: idRef(params.tag) },
      });
      return {
        content: `Attached tag ${params.tag} to ${params.identifier}.`,
        details: { identifier: params.identifier, tag: params.tag },
      };
    },
  }),

  // 7. detach_tag
  defineHulyTool({
    name: "detach_tag",
    label: "Detach tag",
    description: "Detach tag from issue.",
    needsProject: true,
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      identifier: identifierParam,
      tag: Type.String(),
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
      await tctx.client.updateDoc(ISSUE_CLASS, issue.space as never, issue._id as never, {
        $pull: { tags: idRef(params.tag) },
      });
      return {
        content: `Detached tag ${params.tag} from ${params.identifier}.`,
        details: { identifier: params.identifier, tag: params.tag },
      };
    },
  }),
];
