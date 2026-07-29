// tools/domains/issues-templates.ts — Issue templates domain (8 tools).
// Design: 06-api.md §4 Issue templates. CRUD + create_from + children.

import { Type } from "typebox";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import {
  ISSUE_TEMPLATE_CLASS,
  ISSUE_CLASS,
  PROJECT_CLASS,
  PERSON_CLASS,
  COMPONENT_CLASS,
} from "./_class-refs.js";
import {
  workspaceParam,
  projectParam,
  safeUpdateDoc,
  safeRemoveDoc,
  getProjectSpace,
} from "./_common.js";
import { mdToMarkup } from "../../markup/markup.js";

/** T-76: IssueTemplateChild object shape (replaces raw string in children array). */
interface TemplateChild {
  id: string;
  title: string;
  description?: string;
  priority?: string;
  assignee?: string | null;
  component?: string | null;
  estimation?: number;
}

/** Generate Huly-style id for template child (Ref<Issue> placeholder). */
function genChildId(): string {
  return `tracker:issue.${Math.random().toString(36).slice(2, 12)}`;
}

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
      // T-89 #124: sort modifiedOn Descending + output priority/modifiedOn/childrenCount.
      const tpls = await tctx.client.findAll(
        ISSUE_TEMPLATE_CLASS,
        { space } as never,
        {
          sort: { modifiedOn: -1 },
        } as never,
      );
      const list = tpls.map((t) => {
        const tpl = t as {
          _id: string;
          title?: string;
          priority?: string;
          modifiedOn?: number;
          children?: unknown[];
        };
        return {
          _id: tpl._id,
          title: tpl.title ?? "",
          priority: tpl.priority,
          modifiedOn: tpl.modifiedOn,
          childrenCount: tpl.children?.length ?? 0,
        };
      });
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
      const tpl = t as {
        _id: string;
        title?: string;
        description?: unknown;
        priority?: string;
        assignee?: string | null;
        component?: string | null;
        estimation?: number;
        modifiedOn?: number;
        createdOn?: number;
        children?: unknown[];
      };
      // T-89 #124: resolve description MarkupBlobRef → markdown.
      let description: string | undefined;
      if (tpl.description) {
        try {
          description = await tctx.client.fetchMarkup(
            ISSUE_TEMPLATE_CLASS,
            tpl._id,
            "description",
            tpl.description,
            "markdown",
          );
        } catch {
          // Markup fetch fail — omit description.
        }
      }
      // T-89 #124: resolve assignee (Person name) + component (label).
      let assigneeName: string | undefined;
      if (tpl.assignee) {
        const person = await tctx.client.findOne(PERSON_CLASS, { _id: tpl.assignee } as never);
        assigneeName = (person as { name?: string } | null)?.name;
      }
      let componentLabel: string | undefined;
      if (tpl.component) {
        const comp = await tctx.client.findOne(COMPONENT_CLASS, { _id: tpl.component } as never);
        componentLabel = (comp as { label?: string } | null)?.label;
      }
      return {
        content: `Template ${tpl.title ?? ""}`,
        details: {
          _id: tpl._id,
          title: tpl.title,
          description,
          priority: tpl.priority,
          assignee: assigneeName ?? tpl.assignee,
          component: componentLabel ?? tpl.component,
          estimation: tpl.estimation,
          modifiedOn: tpl.modifiedOn,
          createdOn: tpl.createdOn,
          children: tpl.children,
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
      const id = await tctx.client.createDoc(
        ISSUE_TEMPLATE_CLASS,
        project.space as never,
        {
          title: params.title,
          description: descMarkup,
          // T-76: default fields (trusted createIssueTemplate).
          priority: "no-priority",
          assignee: null,
          component: null,
          estimation: 0,
          children: [],
          comments: 0,
        } as never,
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
      // T-51 #41: project null → isError rõ ràng, KHÔNG fallback workspace.
      if (!project) {
        return {
          content: `Project "${tctx.project}" not found. Run /huly init or check binding.`,
          isError: true,
          details: { project: tctx.project },
        };
      }
      const title = params.title ?? (tpl as { title?: string }).title ?? "Untitled";
      // T-76: copy priority/assignee/component từ template (trước chỉ copy title+desc).
      const tplFields = tpl as {
        priority?: string;
        assignee?: string | null;
        component?: string | null;
        description?: string;
      };
      const id = await tctx.client.createDoc(
        ISSUE_CLASS,
        project.space as never,
        {
          title,
          description: tplFields.description,
          priority: tplFields.priority ?? "no-priority",
          assignee: tplFields.assignee ?? null,
          component: tplFields.component ?? null,
        } as never,
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

  // 7. add_template_child — T-76: build IssueTemplateChild object + replace array
  defineHulyTool({
    name: "add_template_child",
    label: "Add template child",
    description:
      "Add child template to parent. Builds IssueTemplateChild object {id,title,priority,...} + replaces full children array.",
    needsProject: true,
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      template: Type.String(),
      title: Type.String(),
      description: Type.Optional(Type.String()),
      priority: Type.Optional(Type.String()),
      assignee: Type.Optional(Type.String()),
      component: Type.Optional(Type.String()),
      estimation: Type.Optional(Type.Integer()),
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
      // T-76: build IssueTemplateChild object (KHÔNG raw string).
      const child: TemplateChild = {
        id: genChildId(),
        title: params.title,
      };
      if (params.description !== undefined) child.description = params.description;
      if (params.priority !== undefined) child.priority = params.priority;
      if (params.assignee !== undefined) child.assignee = params.assignee;
      if (params.component !== undefined) child.component = params.component;
      if (params.estimation !== undefined) child.estimation = params.estimation;
      // T-76: replace full children array (KHÔNG $push).
      const existingChildren = ((t as { children?: TemplateChild[] }).children ??
        []) as TemplateChild[];
      const updResult = await safeUpdateDoc(tctx.client, ISSUE_TEMPLATE_CLASS, t, {
        children: [...existingChildren, child],
      });
      if (!updResult.ok) return updResult.error;
      return {
        content: `Added child "${params.title}" to template ${params.template}.`,
        details: { template: params.template, childId: child.id, title: params.title },
      };
    },
  }),

  // 8. remove_template_child — T-76: find by id field + replace array
  defineHulyTool({
    name: "remove_template_child",
    label: "Remove template child",
    description: "Remove child from parent template (by child id).",
    needsProject: true,
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      template: Type.String(),
      childId: Type.String({ description: "IssueTemplateChild.id to remove." }),
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
      // T-76: find by id field trong children (KHÔNG $pull raw string).
      const existingChildren = ((t as { children?: TemplateChild[] }).children ??
        []) as TemplateChild[];
      const idx = existingChildren.findIndex((c) => c.id === params.childId);
      if (idx === -1) {
        return {
          content: `Child "${params.childId}" not found in template ${params.template}.`,
          isError: true,
          details: { template: params.template, childId: params.childId },
        };
      }
      const newChildren = existingChildren.filter((_, i) => i !== idx);
      const updResult = await safeUpdateDoc(tctx.client, ISSUE_TEMPLATE_CLASS, t, {
        children: newChildren,
      });
      if (!updResult.ok) return updResult.error;
      return {
        content: `Removed child ${params.childId} from template ${params.template}.`,
        details: { template: params.template, childId: params.childId },
      };
    },
  }),
];
