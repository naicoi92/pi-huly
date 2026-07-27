// tools/domains/issues-templates.ts — Issue templates domain (8 tools).
// Design: 06-api.md §4 Issue templates. CRUD + create_from + children.

import { Type } from "typebox";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { ISSUE_TEMPLATE_CLASS, ISSUE_CLASS, PROJECT_CLASS } from "./_class-refs.js";
import { workspaceParam, projectParam } from "./_common.js";
import { mdToMarkup } from "../../markup/markup.js";

export const tools: HulyToolDefinition[] = [
  // 1. list_templates
  defineHulyTool({
    name: "list_templates",
    label: "List issue templates",
    description: "List issue templates trong project.",
    needsProject: true,
    parameters: Type.Object({ workspace: workspaceParam, project: projectParam }),
    async handler(_params, tctx) {
      const tpls = await tctx.client.findAll(ISSUE_TEMPLATE_CLASS, {}, {});
      const list = tpls.map((t) => ({
        _id: t._id,
        title: (t as { title?: string }).title ?? "",
      }));
      return {
        content: `Found ${list.length} template(s).`,
        details: { count: list.length, templates: list },
      };
    },
  }),

  // 2. get_template
  defineHulyTool({
    name: "get_template",
    label: "Get issue template",
    description: "Get issue template by id.",
    needsProject: true,
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      template: Type.String(),
    }),
    async handler(params, tctx) {
      const t = await tctx.client.findOne(ISSUE_TEMPLATE_CLASS, { _id: params.template });
      if (!t) {
        return {
          content: `Template "${params.template}" not found.`,
          isError: true,
          details: { template: params.template },
        };
      }
      return {
        content: `Template ${(t as { title?: string }).title ?? ""}`,
        details: {
          _id: t._id,
          title: (t as { title?: string }).title,
          description: (t as { description?: string }).description,
        },
      };
    },
  }),

  // 3. create_template
  defineHulyTool({
    name: "create_template",
    label: "Create issue template",
    description: "Create issue template.",
    needsProject: true,
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      title: Type.String(),
      description: Type.Optional(Type.String()),
    }),
    async handler(params, tctx) {
      const project = await tctx.client.findOne(PROJECT_CLASS, {
        identifier: tctx.project,
      });
      const descMarkup =
        params.description !== undefined
          ? JSON.stringify(mdToMarkup(params.description))
          : undefined;
      const id = await tctx.client.createDoc(
        ISSUE_TEMPLATE_CLASS,
        (project?.space ?? tctx.workspace) as never,
        { title: params.title, description: descMarkup },
      );
      return {
        content: `Created template "${params.title}".`,
        details: { id, title: params.title },
      };
    },
  }),

  // 4. create_issue_from_template
  defineHulyTool({
    name: "create_issue_from_template",
    label: "Create issue from template",
    description: "Create new issue from template.",
    needsProject: true,
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      template: Type.String(),
      title: Type.Optional(Type.String()),
    }),
    async handler(params, tctx) {
      const tpl = await tctx.client.findOne(ISSUE_TEMPLATE_CLASS, { _id: params.template });
      if (!tpl) {
        return {
          content: `Template "${params.template}" not found.`,
          isError: true,
          details: { template: params.template },
        };
      }
      const project = await tctx.client.findOne(PROJECT_CLASS, {
        identifier: tctx.project,
      });
      const title = params.title ?? (tpl as { title?: string }).title ?? "Untitled";
      const id = await tctx.client.createDoc(
        ISSUE_CLASS,
        (project?.space ?? tctx.workspace) as never,
        {
          title,
          description: (tpl as { description?: string }).description,
        },
      );
      return {
        content: `Created issue "${title}" from template.`,
        details: { id, title, template: params.template },
      };
    },
  }),

  // 5. update_template
  defineHulyTool({
    name: "update_template",
    label: "Update issue template",
    description: "Update template (title, description).",
    needsProject: true,
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      template: Type.String(),
      title: Type.Optional(Type.String()),
      description: Type.Optional(Type.String()),
    }),
    async handler(params, tctx) {
      const t = await tctx.client.findOne(ISSUE_TEMPLATE_CLASS, { _id: params.template });
      if (!t) {
        return {
          content: `Template "${params.template}" not found.`,
          isError: true,
          details: { template: params.template },
        };
      }
      const ops: Record<string, unknown> = {};
      if (params.title !== undefined) ops.title = params.title;
      if (params.description !== undefined)
        ops.description = JSON.stringify(mdToMarkup(params.description));
      if (Object.keys(ops).length === 0) {
        return { content: "No fields to update.", details: { updated: false } };
      }
      await tctx.client.updateDoc(ISSUE_TEMPLATE_CLASS, t.space as never, t._id as never, ops);
      return {
        content: `Updated template ${params.template}.`,
        details: { updated: true, fields: Object.keys(ops) },
      };
    },
  }),

  // 6. delete_template — destructive
  defineHulyTool({
    name: "delete_template",
    label: "Delete issue template",
    description: "Delete template (destructive).",
    destructive: true,
    needsProject: true,
    destructiveContext: (p) => ({
      type: "template",
      id: (p as { template?: string }).template ?? "<unknown>",
    }),
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      template: Type.String(),
    }),
    async handler(params, tctx) {
      const t = await tctx.client.findOne(ISSUE_TEMPLATE_CLASS, { _id: params.template });
      if (!t) {
        return {
          content: `Template "${params.template}" not found.`,
          isError: true,
          details: { template: params.template },
        };
      }
      await tctx.client.removeDoc(ISSUE_TEMPLATE_CLASS, t.space as never, t._id as never);
      return {
        content: `Deleted template ${params.template}.`,
        details: { deleted: true, template: params.template },
      };
    },
  }),

  // 7. add_template_child — add sub-template (parent-child)
  defineHulyTool({
    name: "add_template_child",
    label: "Add template child",
    description: "Add child template to parent template.",
    needsProject: true,
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      template: Type.String(),
      childTemplate: Type.String(),
    }),
    async handler(params, tctx) {
      const t = await tctx.client.findOne(ISSUE_TEMPLATE_CLASS, { _id: params.template });
      if (!t) {
        return {
          content: `Template "${params.template}" not found.`,
          isError: true,
          details: { template: params.template },
        };
      }
      await tctx.client.updateDoc(ISSUE_TEMPLATE_CLASS, t.space as never, t._id as never, {
        $push: { children: params.childTemplate },
      });
      return {
        content: `Added child ${params.childTemplate} to template ${params.template}.`,
        details: { template: params.template, child: params.childTemplate },
      };
    },
  }),

  // 8. remove_template_child
  defineHulyTool({
    name: "remove_template_child",
    label: "Remove template child",
    description: "Remove child from parent template.",
    needsProject: true,
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      template: Type.String(),
      childTemplate: Type.String(),
    }),
    async handler(params, tctx) {
      const t = await tctx.client.findOne(ISSUE_TEMPLATE_CLASS, { _id: params.template });
      if (!t) {
        return {
          content: `Template "${params.template}" not found.`,
          isError: true,
          details: { template: params.template },
        };
      }
      await tctx.client.updateDoc(ISSUE_TEMPLATE_CLASS, t.space as never, t._id as never, {
        $pull: { children: params.childTemplate },
      });
      return {
        content: `Removed child ${params.childTemplate} from template ${params.template}.`,
        details: { template: params.template, child: params.childTemplate },
      };
    },
  }),
];
