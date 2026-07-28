// tools/domains/milestones.ts — Milestones domain (6 tools).
// Design: 06-api.md §4 Milestones. CRUD + set_issue_milestone.
//
// Tools (6, FR-04 D4):
//   1. huly_list_milestones        — list trong project
//   2. huly_get_milestone          — get by id
//   3. huly_create_milestone       — {project, label, description?, targetDate} → {id}
//   4. huly_update_milestone       — update label/description/targetDate/status
//   5. huly_set_issue_milestone    — gán issue → milestone
//   6. huly_delete_milestone       — destructive

import { Type } from "typebox";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { MILESTONE_CLASS, ISSUE_CLASS, PROJECT_CLASS } from "./_class-refs.js";
import {
  workspaceParam,
  projectParam,
  identifierParam,
  resolveIdentifier,
  safeUpdateDoc,
  safeRemoveDoc,
} from "./_common.js";

export const tools: HulyToolDefinition[] = [
  // 1. list_milestones
  defineHulyTool({
    name: "list_milestones",
    label: "List milestones",
    description: "List milestones trong project.",
    needsProject: true,
    parameters: Type.Object({ workspace: workspaceParam, project: projectParam }),
    async handler(_params, tctx) {
      const milestones = await tctx.client.findAll(MILESTONE_CLASS, {}, {});
      const list = milestones.map((m) => ({
        id: m._id,
        label: (m as { label?: string }).label ?? "",
        status: (m as { status?: string }).status ?? "planned",
        targetDate: (m as { targetDate?: number }).targetDate,
      }));
      return {
        content: `Found ${list.length} milestone(s).`,
        details: { count: list.length, milestones: list },
      };
    },
  }),

  // 2. get_milestone
  defineHulyTool({
    name: "get_milestone",
    label: "Get milestone",
    description: "Get milestone by id.",
    needsProject: true,
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      milestone: Type.String({ description: "Milestone id." }),
    }),
    async handler(params, tctx) {
      const m = await tctx.client.findOne(MILESTONE_CLASS, { _id: params.milestone });
      if (!m) {
        return {
          content: `Milestone "${params.milestone}" not found.`,
          isError: true,
          details: { milestone: params.milestone },
        };
      }
      return {
        content: `Milestone ${(m as { label?: string }).label ?? ""}`,
        details: {
          id: m._id,
          label: (m as { label?: string }).label,
          status: (m as { status?: string }).status,
          targetDate: (m as { targetDate?: number }).targetDate,
        },
      };
    },
  }),

  // 3. create_milestone
  defineHulyTool({
    name: "create_milestone",
    label: "Create milestone",
    description: "Create milestone. targetDate BẮT BUỘC (Unix ms).",
    needsProject: true,
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      label: Type.String(),
      description: Type.Optional(Type.String()),
      targetDate: Type.Integer({
        description: "Unix ms timestamp (BẮT BUỘC).",
      }),
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
      const id = await tctx.client.createDoc(MILESTONE_CLASS, project.space as never, {
        label: params.label,
        description: params.description,
        targetDate: params.targetDate,
        status: "planned",
      });
      return {
        content: `Created milestone "${params.label}".`,
        details: { id, label: params.label },
      };
    },
  }),

  // 4. update_milestone
  defineHulyTool({
    name: "update_milestone",
    label: "Update milestone",
    description: "Update milestone (label, description, targetDate, status).",
    needsProject: true,
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      milestone: Type.String(),
      label: Type.Optional(Type.String()),
      description: Type.Optional(Type.String()),
      targetDate: Type.Optional(Type.Integer()),
      status: Type.Optional(
        Type.Union([
          Type.Literal("planned"),
          Type.Literal("in-progress"),
          Type.Literal("completed"),
          Type.Literal("canceled"),
        ]),
      ),
    }),
    async handler(params, tctx) {
      const m = await tctx.client.findOne(MILESTONE_CLASS, { _id: params.milestone });
      if (!m) {
        return {
          content: `Milestone "${params.milestone}" not found.`,
          isError: true,
          details: { milestone: params.milestone },
        };
      }
      const ops: Record<string, unknown> = {};
      if (params.label !== undefined) ops.label = params.label;
      if (params.description !== undefined) ops.description = params.description;
      if (params.targetDate !== undefined) ops.targetDate = params.targetDate;
      if (params.status !== undefined) ops.status = params.status;
      if (Object.keys(ops).length === 0) {
        return { content: "No fields to update.", details: { updated: false } };
      }
      const updResult = await safeUpdateDoc(tctx.client, MILESTONE_CLASS, m, ops);
      if (!updResult.ok) return updResult.error;
      return {
        content: `Updated milestone ${params.milestone}: ${Object.keys(ops).join(", ")}`,
        details: { updated: true, fields: Object.keys(ops) },
      };
    },
  }),

  // 5. set_issue_milestone
  defineHulyTool({
    name: "set_issue_milestone",
    label: "Set issue milestone",
    description: "Gán milestone cho issue. Qua identifier (PD-123 HOẶC raw num).",
    needsProject: true,
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      identifier: identifierParam,
      milestone: Type.String({ description: "Milestone id." }),
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
      // T-52 #42: validate milestone tồn tại trước khi set ref.
      const milestone = await tctx.client.findOne(MILESTONE_CLASS, { _id: params.milestone });
      if (!milestone) {
        return {
          content: `Milestone "${params.milestone}" not found.`,
          isError: true,
          details: { identifier: params.identifier, milestone: params.milestone },
        };
      }
      const updResult = await safeUpdateDoc(tctx.client, ISSUE_CLASS, issue, {
        milestone: milestone._id as never,
      });
      if (!updResult.ok) return updResult.error;
      return {
        content: `Set ${params.identifier} → milestone ${params.milestone}.`,
        details: { identifier: params.identifier, milestone: params.milestone },
      };
    },
  }),

  // 6. delete_milestone — destructive
  defineHulyTool({
    name: "delete_milestone",
    label: "Delete milestone",
    description: "Delete milestone (destructive — confirm gate).",
    destructive: true,
    needsProject: true,
    destructiveContext: (p) => ({
      type: "milestone",
      id: (p as { milestone?: string }).milestone ?? "<unknown>",
    }),
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      milestone: Type.String(),
    }),
    async handler(params, tctx) {
      const m = await tctx.client.findOne(MILESTONE_CLASS, { _id: params.milestone });
      if (!m) {
        return {
          content: `Milestone "${params.milestone}" not found.`,
          isError: true,
          details: { milestone: params.milestone },
        };
      }
      const delResult = await safeRemoveDoc(tctx.client, MILESTONE_CLASS, m);
      if (!delResult.ok) return delResult.error;
      return {
        content: `Deleted milestone ${params.milestone}.`,
        details: { deleted: true, milestone: params.milestone },
      };
    },
  }),
];

// resolveIdentifier imported từ _common.ts
