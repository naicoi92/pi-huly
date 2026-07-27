// tools/domains/todos.ts — Todos domain (7 tools).
// Design: 06-api.md §4 Todos. attachedTo: {type:'issue', project, identifier}.

import { Type } from "typebox";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { ISSUE_CLASS, TODO_CLASS } from "./_class-refs.js";
import { workspaceParam, projectParam, identifierParam, resolveIdentifier } from "./_common.js";

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
        TODO_CLASS,
        issue.space as never,
        issue._id as never,
        ISSUE_CLASS,
        "todos",
        {
          title: params.title,
          description: params.description,
          dueDate: params.dueDate,
        },
      );
      return {
        content: `Created todo "${params.title}" on ${params.identifier}.`,
        details: { id, title: params.title, identifier: params.identifier },
      };
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
