// tools/domains/task-management.ts — Task-management domain (5 tools).
// Design: 06-api.md §4 Task-mgmt. Project types + task types + status registration.
//
// T-73 (2026-07-28): rewrite create_issue_status + create_task_type theo trusted
// task-management.ts. Status/tasktype created + REGISTERED vào project workflow
// (ProjectType.statuses ProjectStatus[] + TaskType.statuses Ref[]). Trước đây
// createDoc orphan — status/tasktype KHÔNG bao giờ link workflow (silent fail).
// space = core.space.Model (root model space, KHÔNG workspace root).
// category = Ref<StatusCategory> (KHÔNG raw enum string).
//
// Bonus fixes: list_task_types field ofProjectType → parent; create_task_type
// field ofProjectType → parent + register projectType.tasks.

import { Type } from "typebox";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import {
  PROJECT_TYPE_CLASS,
  TASK_TYPE_CLASS,
  MODEL_SPACE,
  STATUS_CATEGORY_REFS,
} from "./_class-refs.js";
import { workspaceParam } from "./_common.js";

/** Generate id helper (Huly convention <class-prefix>.<rand>). */
function genId(prefix: string): string {
  return `${prefix}.${Math.random().toString(36).slice(2, 12)}`;
}

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

  // 3. list_task_types — T-73: field ofProjectType → parent (trusted query field)
  defineHulyTool({
    name: "list_task_types",
    label: "List task types",
    description: "List task types cho project type.",
    parameters: Type.Object({
      workspace: workspaceParam,
      projectType: Type.Optional(Type.String()),
    }),
    async handler(params, tctx) {
      // T-73: query field `parent` (KHÔNG ofProjectType — trusted getTaskTypesByProjectType).
      const query = params.projectType !== undefined ? { parent: params.projectType } : {};
      const tts = await tctx.client.findAll(TASK_TYPE_CLASS, query as never, {});
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

  // 4. create_task_type — T-73: parent field + core.space.Model + register projectType.tasks
  defineHulyTool({
    name: "create_task_type",
    label: "Create task type",
    description: "Create task type trong project type + register vào projectType.tasks.",
    parameters: Type.Object({
      workspace: workspaceParam,
      name: Type.String(),
      projectType: Type.String(),
    }),
    async handler(params, tctx) {
      // Resolve projectType (FK validate + read current tasks for registration).
      const projectType = await tctx.client.findOne(PROJECT_TYPE_CLASS, {
        _id: params.projectType,
      });
      if (!projectType) {
        return {
          content: `Project type "${params.projectType}" not found.`,
          isError: true,
          details: { projectType: params.projectType },
        };
      }
      // T-73: createDoc TaskType core.space.Model {name, parent: projectType._id}.
      // NOTE: trusted also creates Mixin + TaskTypeClass doc + copies descriptor
      // template — DEFERRED (heavy, needs descriptor model). This creates a
      // minimal usable TaskType linked to projectType.
      const taskTypeId = genId("task:tasktype");
      const id = await tctx.client.createDoc(
        TASK_TYPE_CLASS,
        MODEL_SPACE,
        { name: params.name, parent: projectType._id } as never,
        taskTypeId as never,
      );
      // T-73: register vào projectType.tasks (read-modify-write idempotent).
      const existingTasks = ((projectType as { tasks?: string[] }).tasks ?? []) as string[];
      if (!existingTasks.includes(taskTypeId)) {
        await tctx.client.updateDoc(
          PROJECT_TYPE_CLASS,
          MODEL_SPACE,
          projectType._id as never,
          { tasks: [...existingTasks, taskTypeId] } as never,
        );
      }
      return {
        content: `Created task type "${params.name}" + registered to projectType.tasks.`,
        details: { id, name: params.name, projectType: projectType._id, registered: true },
      };
    },
  }),

  // 5. create_issue_status — T-73: full proper flow (register workflow)
  //   - resolve taskType → statusClass dynamic (taskType.statusClass)
  //   - core.space.Model space (KHÔNG workspace root)
  //   - category = Ref<StatusCategory> via STATUS_CATEGORY_REFS (KHÔNG raw enum)
  //   - register: TaskType.statuses + ProjectType.statuses (ProjectStatus object)
  //   - idempotent: findOne exact name trên target taskType (KHÔNG global)
  defineHulyTool({
    name: "create_issue_status",
    label: "Create issue status",
    description:
      "Create issue status + register vào project workflow. Requires taskType param (resolve statusClass). Idempotent per taskType+name.",
    parameters: Type.Object({
      workspace: workspaceParam,
      taskType: Type.String({ description: "TaskType _id (resolve statusClass + register)." }),
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
      // T-73: resolve taskType → statusClass + parent projectType.
      const taskType = await tctx.client.findOne(TASK_TYPE_CLASS, {
        _id: params.taskType,
      });
      if (!taskType) {
        return {
          content: `Task type "${params.taskType}" not found.`,
          isError: true,
          details: { taskType: params.taskType },
        };
      }
      const statusClass = (taskType as { statusClass?: string }).statusClass;
      if (!statusClass) {
        return {
          content: `Task type "${params.taskType}" has no statusClass (cannot determine target class).`,
          isError: true,
          details: { taskType: params.taskType },
        };
      }
      const projectTypeId = (taskType as { parent?: string }).parent;
      if (!projectTypeId) {
        return {
          content: `Task type "${params.taskType}" has no parent projectType.`,
          isError: true,
          details: { taskType: params.taskType },
        };
      }
      // Idempotent: findOne exact name trên target taskType (KHÔNG global — tránh
      // cross-taskType name collision).
      const existing = await tctx.client.findOne(
        statusClass as never,
        {
          name: params.name,
          ofTaskType: params.taskType,
        } as never,
      );
      if (existing) {
        return {
          content: `Status "${params.name}" already exists on taskType ${params.taskType} (idempotent — no-op).`,
          details: {
            id: existing._id,
            name: params.name,
            taskType: params.taskType,
            idempotent: true,
          },
        };
      }
      // T-73: category = Ref<StatusCategory> (KHÔNG raw enum string).
      const categoryRef = STATUS_CATEGORY_REFS[params.category];
      if (!categoryRef) {
        return {
          content: `Invalid category "${params.category}". Valid: ${Object.keys(STATUS_CATEGORY_REFS).join(", ")}.`,
          isError: true,
          details: { invalidCategory: params.category },
        };
      }
      // T-73: createDoc statusClass (dynamic) core.space.Model.
      const statusId = genId("tracker:status");
      await tctx.client.createDoc(
        statusClass as never,
        MODEL_SPACE,
        {
          name: params.name,
          ofTaskType: params.taskType,
          category: categoryRef,
        } as never,
        statusId as never,
      );
      // T-73: register vào TaskType.statuses (read-modify-write idempotent).
      const ttStatuses = ((taskType as { statuses?: string[] }).statuses ?? []) as string[];
      if (!ttStatuses.includes(statusId)) {
        await tctx.client.updateDoc(
          TASK_TYPE_CLASS,
          MODEL_SPACE,
          taskType._id as never,
          { statuses: [...ttStatuses, statusId] } as never,
        );
      }
      // T-73: register vào ProjectType.statuses (ProjectStatus[] objects {_id, taskType}).
      const projectType = await tctx.client.findOne(PROJECT_TYPE_CLASS, {
        _id: projectTypeId,
      });
      if (projectType) {
        const ptStatuses =
          (projectType as { statuses?: Array<{ _id?: string; taskType?: string }> }).statuses ?? [];
        if (!ptStatuses.some((s) => s._id === statusId)) {
          await tctx.client.updateDoc(
            PROJECT_TYPE_CLASS,
            MODEL_SPACE,
            projectType._id as never,
            {
              statuses: [...ptStatuses, { _id: statusId, taskType: params.taskType }],
            } as never,
          );
        }
      }
      return {
        content: `Created status "${params.name}" (${params.category}) + registered to workflow.`,
        details: {
          id: statusId,
          name: params.name,
          category: params.category,
          statusClass,
          taskType: params.taskType,
          projectType: projectTypeId,
          registered: true,
        },
      };
    },
  }),
];
