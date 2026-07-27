// tools/domains/todos.ts — Todos domain (7 tools).
// Design: 06-api.md §4 Todos. attachedTo: {type:'issue', project, identifier}.

import { Type } from "typebox";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { ISSUE_CLASS, TODO_CLASS } from "./_class-refs.js";
import { workspaceParam, projectParam, identifierParam, resolveIdentifier } from "./_common.js";
import { mdToMarkup } from "../../markup/markup.js";

/**
 * ToDoPriority enum (audit §5 — @hcengineering/time).
 * High=0, Medium=1, Low=2, NoPriority=3, Urgent=4.
 * Pi-huly API dùng string ('urgent', 'high', ...) → map sang number cho server.
 */
const TODO_PRIORITY_MAP: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
  "no-priority": 3,
  urgent: 4,
};

/** Priority param schema (string → number enum mapping). */
const todoPrioritySchema = Type.Optional(
  Type.Union([
    Type.Literal("urgent"),
    Type.Literal("high"),
    Type.Literal("medium"),
    Type.Literal("low"),
    Type.Literal("no-priority"),
  ]),
);

export const tools: HulyToolDefinition[] = [
  // 1. list_todos
  defineHulyTool({
    name: "list_todos",
    label: "List todos",
    description: "List todos attached to issue.",
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
      const todos = ((issue as { todos?: unknown[] }).todos ?? []) as Array<{
        _id?: string;
        title?: string;
        done?: boolean;
      }>;
      return {
        content: `Found ${todos.length} todo(s) on ${params.identifier}.`,
        details: { count: todos.length, todos },
      };
    },
  }),

  // 2. get_todo
  defineHulyTool({
    name: "get_todo",
    label: "Get todo",
    description: "Get todo by id.",
    parameters: Type.Object({
      workspace: workspaceParam,
      todo: Type.String(),
    }),
    async handler(params, tctx) {
      const t = await tctx.client.findOne(TODO_CLASS, { _id: params.todo });
      if (!t) {
        return {
          content: `Todo "${params.todo}" not found.`,
          isError: true,
          details: { todo: params.todo },
        };
      }
      return {
        content: `Todo: ${(t as { title?: string }).title ?? ""}`,
        details: {
          _id: t._id,
          title: (t as { title?: string }).title,
          done: (t as { done?: boolean }).done,
          owner: (t as { owner?: string }).owner,
          dueDate: (t as { dueDate?: number }).dueDate,
        },
      };
    },
  }),

  // 3. create_todo
  defineHulyTool({
    name: "create_todo",
    label: "Create todo",
    description: "Create todo attached to issue.",
    needsProject: true,
    needsAssignee: true,
    assigneeField: "owner",
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      identifier: identifierParam,
      title: Type.String(),
      description: Type.Optional(Type.String()),
      dueDate: Type.Optional(Type.Integer()),
      priority: todoPrioritySchema,
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
      // T-46 #28 (audit §5): ToDo extends AttachedDoc với required fields.
      // Trước đây addCollection thiếu attachedToClass + user + visibility + rank
      // + priority + workslots → platform:status:UnknownError.
      const priority = TODO_PRIORITY_MAP[params.priority ?? "medium"];
      try {
        const id = await tctx.client.addCollection(
          TODO_CLASS,
          issue.space as never,
          issue._id as never,
          ISSUE_CLASS,
          "todos",
          {
            title: params.title,
            description:
              params.description !== undefined
                ? JSON.stringify(mdToMarkup(params.description))
                : undefined,
            attachedTo: issue._id,
            attachedToClass: ISSUE_CLASS,
            attachedSpace: issue.space,
            user: tctx.currentUser.id, // Ref<Employee>
            priority, // ToDoPriority number enum (audit §5)
            visibility: "Public", // Visibility.Public default
            rank: "", // lexorank empty — server gán nếu empty
            workslots: 0,
            dueDate: params.dueDate,
          },
        );
        return {
          content: `Created todo "${params.title}" on ${params.identifier}.`,
          details: { id, title: params.title, identifier: params.identifier },
        };
      } catch (e) {
        // Wrap lỗi generic của Huly server (platform:status:UnknownError) với
        // context rõ ràng hơn — mention todo + issue + class để debug lần sau.
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content:
            `Failed to create todo "${params.title}" on ${params.identifier} ` +
            `(class ${TODO_CLASS}). Server error: ${msg}. ` +
            `Verify issue exists and ToDo required fields are valid.`,
          isError: true,
          details: {
            identifier: params.identifier,
            title: params.title,
            error: msg,
          },
        };
      }
    },
  }),

  // 4. update_todo
  defineHulyTool({
    name: "update_todo",
    label: "Update todo",
    description: "Update todo (title, description, dueDate).",
    parameters: Type.Object({
      workspace: workspaceParam,
      todo: Type.String(),
      title: Type.Optional(Type.String()),
      description: Type.Optional(Type.String()),
      dueDate: Type.Optional(Type.Integer()),
    }),
    async handler(params, tctx) {
      const t = await tctx.client.findOne(TODO_CLASS, { _id: params.todo });
      if (!t) {
        return {
          content: `Todo "${params.todo}" not found.`,
          isError: true,
          details: { todo: params.todo },
        };
      }
      const ops: Record<string, unknown> = {};
      if (params.title !== undefined) ops.title = params.title;
      if (params.description !== undefined) ops.description = params.description;
      if (params.dueDate !== undefined) ops.dueDate = params.dueDate;
      if (Object.keys(ops).length === 0) {
        return { content: "No fields to update.", details: { updated: false } };
      }
      await tctx.client.updateDoc(TODO_CLASS, t.space as never, t._id as never, ops);
      return {
        content: `Updated todo ${params.todo}.`,
        details: { updated: true, fields: Object.keys(ops) },
      };
    },
  }),

  // 5. complete_todo
  defineHulyTool({
    name: "complete_todo",
    label: "Complete todo",
    description: "Mark todo done.",
    parameters: Type.Object({
      workspace: workspaceParam,
      todo: Type.String(),
    }),
    async handler(params, tctx) {
      const t = await tctx.client.findOne(TODO_CLASS, { _id: params.todo });
      if (!t) {
        return {
          content: `Todo "${params.todo}" not found.`,
          isError: true,
          details: { todo: params.todo },
        };
      }
      await tctx.client.updateDoc(TODO_CLASS, t.space as never, t._id as never, {
        done: true,
      });
      return {
        content: `Completed todo ${params.todo}.`,
        details: { completed: true, todo: params.todo },
      };
    },
  }),

  // 6. reopen_todo
  defineHulyTool({
    name: "reopen_todo",
    label: "Reopen todo",
    description: "Mark todo not done (reopen).",
    parameters: Type.Object({
      workspace: workspaceParam,
      todo: Type.String(),
    }),
    async handler(params, tctx) {
      const t = await tctx.client.findOne(TODO_CLASS, { _id: params.todo });
      if (!t) {
        return {
          content: `Todo "${params.todo}" not found.`,
          isError: true,
          details: { todo: params.todo },
        };
      }
      await tctx.client.updateDoc(TODO_CLASS, t.space as never, t._id as never, {
        done: false,
      });
      return {
        content: `Reopened todo ${params.todo}.`,
        details: { reopened: true, todo: params.todo },
      };
    },
  }),

  // 7. delete_todo — destructive
  defineHulyTool({
    name: "delete_todo",
    label: "Delete todo",
    description: "Delete todo (destructive).",
    destructive: true,
    destructiveContext: (p) => ({
      type: "todo",
      id: (p as { todo?: string }).todo ?? "<unknown>",
    }),
    parameters: Type.Object({
      workspace: workspaceParam,
      todo: Type.String(),
    }),
    async handler(params, tctx) {
      const t = await tctx.client.findOne(TODO_CLASS, { _id: params.todo });
      if (!t) {
        return {
          content: `Todo "${params.todo}" not found.`,
          isError: true,
          details: { todo: params.todo },
        };
      }
      await tctx.client.removeDoc(TODO_CLASS, t.space as never, t._id as never);
      return {
        content: `Deleted todo ${params.todo}.`,
        details: { deleted: true, todo: params.todo },
      };
    },
  }),
];
