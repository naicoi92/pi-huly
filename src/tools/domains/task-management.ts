// tools/domains/task-management.ts — Task-management domain (5 tools).
// Design: 06-api.md §4 Task-mgmt. Project types + task types + status idempotent.
//
// Tools (5, FR-04 D4):
//   1. list_project_types    — list project types (vd tracker, recruiting)
//   2. get_project_type      — get by id
//   3. list_task_types       — list task types cho project type
//   4. create_task_type      — create task type
//   5. create_issue_status   — idempotent (exact name match)

import { Type } from "typebox";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import {
  PROJECT_TYPE_CLASS,
  TASK_TYPE_CLASS,
  ISSUE_STATUS_CLASS,
  spaceRef,
} from "./_class-refs.js";
import { workspaceParam } from "./_common.js";

export const tools: HulyToolDefinition[] = [
  // 1. list_project_types
  defineHulyTool({
    name: "list_project_types",
    label: "List project types",
    description: "List project types (vd tracker, recruiting, inventory).",
    parameters: Type.Object({ workspace: workspaceParam }),
    async handler(_params, tctx) {
      const pts = await tctx.client.findAll(PROJECT_TYPE_CLASS, {}, {});
      const list = pts.map((p) => ({
        _id: p._id,
        name: (p as { name?: string }).name ?? "",
        targetClass: (p as { targetClass?: string }).targetClass,
      }));
      return {
        content: `Found ${list.length} project type(s).`,
        details: { count: list.length, projectTypes: list },
      };
    },
  }),

  // 2. get_project_type
  defineHulyTool({
    name: "get_project_type",
    label: "Get project type",
    description: "Get project type by id.",
    parameters: Type.Object({
      workspace: workspaceParam,
      projectType: Type.String(),
    }),
    async handler(params, tctx) {
      const pt = await tctx.client.findOne(PROJECT_TYPE_CLASS, {
        _id: params.projectType,
      });
      if (!pt) {
        return {
          content: `Project type "${params.projectType}" not found.`,
          isError: true,
          details: { projectType: params.projectType },
        };
      }
      return {
        content: `Project type ${(pt as { name?: string }).name ?? ""}`,
        details: {
          _id: pt._id,
          name: (pt as { name?: string }).name,
          targetClass: (pt as { targetClass?: string }).targetClass,
        },
      };
    },
  }),

  // 3. list_task_types
  defineHulyTool({
    name: "list_task_types",
    label: "List task types",
    description: "List task types cho project type.",
    parameters: Type.Object({
      workspace: workspaceParam,
      projectType: Type.Optional(Type.String()),
    }),
    async handler(params, tctx) {
      const query = params.projectType !== undefined ? { ofProjectType: params.projectType } : {};
      const tts = await tctx.client.findAll(TASK_TYPE_CLASS, query, {});
      const list = tts.map((t) => ({
        _id: t._id,
        name: (t as { name?: string }).name ?? "",
      }));
      return {
        content: `Found ${list.length} task type(s).`,
        details: { count: list.length, taskTypes: list },
      };
    },
  }),

  // 4. create_task_type
  defineHulyTool({
    name: "create_task_type",
    label: "Create task type",
    description: "Create task type trong project type.",
    parameters: Type.Object({
      workspace: workspaceParam,
      name: Type.String(),
      projectType: Type.String(),
    }),
    async handler(params, tctx) {
      const id = await tctx.client.createDoc(TASK_TYPE_CLASS, spaceRef(tctx.workspace), {
        name: params.name,
        ofProjectType: params.projectType,
      });
      return {
        content: `Created task type "${params.name}".`,
        details: { id, name: params.name },
      };
    },
  }),

  // 5. create_issue_status — IDEMPOTENT (normalized name, 06-api §9 NFR-10)
  defineHulyTool({
    name: "create_issue_status",
    label: "Create issue status",
    description: "Create issue status. Idempotent: nếu status normalized name tồn tại → no-op.",
    parameters: Type.Object({
      workspace: workspaceParam,
      taskType: Type.Optional(Type.String()),
      name: Type.String(),
      category: Type.Union([
        Type.Literal("UnStarted"),
        Type.Literal("ToDo"),
        Type.Literal("Active"),
        Type.Literal("Won"),
        Type.Literal("Lost"),
      ]),
    }),
    async handler(params, tctx) {
      // Idempotent: findOne exact name (raw, KHÔNG normalize — tránh mismatch
      // giữa query normalized vs save raw). Huly status name theo convention
      // lowercase, caller nên pass name đã normalize.
      const existing = await tctx.client.findOne(ISSUE_STATUS_CLASS, {
        name: params.name,
      });
      if (existing) {
        return {
          content: `Status "${params.name}" already exists (idempotent — no-op).`,
          details: { id: existing._id, name: params.name, idempotent: true },
        };
      }
      const id = await tctx.client.createDoc(ISSUE_STATUS_CLASS, spaceRef(tctx.workspace), {
        name: params.name,
        ofTaskType: params.taskType,
        category: params.category,
      });
      return {
        content: `Created status "${params.name}" (${params.category}).`,
        details: { id, name: params.name, category: params.category },
      };
    },
  }),
];
