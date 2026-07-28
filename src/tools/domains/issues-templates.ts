// tools/domains/issues-templates.ts — Issue templates domain (8 tools).
// Design: 06-api.md §4 Issue templates. CRUD + create_from + children.

import { Type } from "typebox";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { ISSUE_TEMPLATE_CLASS, ISSUE_CLASS, PROJECT_CLASS } from "./_class-refs.js";
import {
  workspaceParam,
  projectParam,
  safeUpdateDoc,
  safeRemoveDoc,
  getProjectSpace,
} from "./_common.js";
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
      // T-71: space scoping (KHÔNG findAll global cross-project).
      const space = await getProjectSpace(tctx.client, tctx.project!);
      if (!space) {
        return {
          content: `Project "${tctx.project}" not found.`,
          isError: true,
          details: { project: tctx.project },
        };
      }
      const tpls = await tctx.client.findAll(ISSUE_TEMPLATE_CLASS, { space } as never, {});
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
      // T-51 #41: project null → isError rõ ràng, KHÔNG fallback workspace.
      if (!project) {
        return {
          content: `Project "${tctx.project}" not found. Run /huly init or check binding.`,
          isError: true,
          details: { project: tctx.project },
        };
      }
      const descMarkup =
        params.description !== undefined
          ? JSON.stringify(mdToMarkup(params.description))
          : undefined;
      const id = await tctx.client.createDoc(ISSUE_TEMPLATE_CLASS, project.space as never, {
        title: params.title,
        description: descMarkup,
      });
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
      // T-51 #41: project null → isError rõ ràng, KHÔNG fallback workspace.
      if (!project) {
        return {
          content: `Project "${tctx.project}" not found. Run /huly init or check binding.`,
          isError: true,
          details: { project: tctx.project },
        };
      }
      const title = params.title ?? (tpl as { title?: string }).title ?? "Untitled";
      const id = await tctx.client.createDoc(ISSUE_CLASS, project.space as never, {
        title,
        description: (tpl as { description?: string }).description,
      });
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
      const updResult = await safeUpdateDoc(tctx.client, ISSUE_TEMPLATE_CLASS, t, ops);
      if (!updResult.ok) return updResult.error;
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
      const delResult = await safeRemoveDoc(tctx.client, ISSUE_TEMPLATE_CLASS, t);
      if (!delResult.ok) return delResult.error;
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
      const updResult = await safeUpdateDoc(tctx.client, ISSUE_TEMPLATE_CLASS, t, {
        $push: { children: params.childTemplate },
      });
      if (!updResult.ok) return updResult.error;
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
      const updResult = await safeUpdateDoc(tctx.client, ISSUE_TEMPLATE_CLASS, t, {
        $pull: { children: params.childTemplate },
      });
      if (!updResult.ok) return updResult.error;
      return {
        content: `Removed child ${params.childTemplate} from template ${params.template}.`,
        details: { template: params.template, child: params.childTemplate },
      };
    },
  }),
];
