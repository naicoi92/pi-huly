// tools/domains/projects.ts — Projects domain (6 tools).
// Design: 06-api.md §4 Projects. CRUD projects + list_statuses.
//
// Tools (6, FR-04 D4):
//   1. huly_list_projects          — list trong workspace (project-scoped)
//   2. huly_get_project            — get by identifier
//   3. huly_create_project         — {name, identifier} → {identifier}
//   4. huly_update_project         — update name/description
//   5. huly_delete_project         — destructive, confirm gate
//   6. huly_list_statuses          — workflow statuses cho project

import { Type } from "typebox";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { PROJECT_CLASS, ISSUE_STATUS_CLASS, spaceRef } from "./_class-refs.js";
import { workspaceParam, projectParam, safeUpdateDoc, safeRemoveDoc } from "./_common.js";

export const tools: HulyToolDefinition[] = [
  // 1. list_projects
  defineHulyTool({
    name: "list_projects",
    label: "List projects",
    description: "List Huly projects trong workspace.",
    promptSnippet: "List Huly projects.",
    parameters: Type.Object({ workspace: workspaceParam }),
    async handler(_params, tctx) {
      const projects = await tctx.client.findAll(PROJECT_CLASS, {}, {});
      const list = projects.map((p) => ({
        identifier: (p as { identifier?: string }).identifier ?? "",
        name: (p as { name?: string }).name ?? "",
      }));
      return {
        content: `Found ${list.length} project(s): ${list.map((p) => p.identifier).join(", ")}`,
        details: { count: list.length, projects: list },
      };
    },
  }),

  // 2. get_project
  defineHulyTool({
    name: "get_project",
    label: "Get project",
    description: "Get Huly project by identifier.",
    promptSnippet: "Get Huly project details.",
    needsProject: true,
    parameters: Type.Object({ workspace: workspaceParam, project: projectParam }),
    async handler(_params, tctx) {
      const project = await tctx.client.findOne(PROJECT_CLASS, {
        identifier: tctx.project,
      });
      if (!project) {
        return {
          content: `Project "${tctx.project}" not found.`,
          isError: true,
          details: { project: tctx.project, found: false },
        };
      }
      const projFields = project as {
        identifier?: string;
        name?: string;
        description?: string;
        archived?: boolean;
      };
      return {
        content: `Project ${projFields.identifier}: ${projFields.name ?? ""}`,
        details: {
          identifier: projFields.identifier,
          name: projFields.name,
          description: projFields.description,
          archived: projFields.archived ?? false,
        },
      };
    },
  }),

  // 3. create_project
  defineHulyTool({
    name: "create_project",
    label: "Create project",
    description: "Create Huly project. Returns identifier. KHÔNG idempotent (mỗi call = new).",
    promptSnippet: "Create a new Huly project.",
    parameters: Type.Object({
      workspace: workspaceParam,
      name: Type.String({ description: "Project name." }),
      identifier: Type.String({
        description: "1-5 chars uppercase, start with letter.",
        minLength: 1,
        maxLength: 5,
      }),
      description: Type.Optional(Type.String()),
    }),
    async handler(params, tctx) {
      const id = await tctx.client.createDoc(PROJECT_CLASS, spaceRef(tctx.workspace), {
        name: params.name,
        identifier: params.identifier,
        description: params.description,
      });
      return {
        content: `Created project ${params.identifier} (${params.name}).`,
        details: { identifier: params.identifier, id },
      };
    },
  }),

  // 4. update_project
  defineHulyTool({
    name: "update_project",
    label: "Update project",
    description: "Update Huly project (name, description).",
    needsProject: true,
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      name: Type.Optional(Type.String()),
      description: Type.Optional(Type.String()),
    }),
    async handler(params, tctx) {
      const existing = await tctx.client.findOne(PROJECT_CLASS, {
        identifier: tctx.project,
      });
      if (!existing) {
        return {
          content: `Project "${tctx.project}" not found.`,
          isError: true,
          details: { project: tctx.project },
        };
      }
      const operations: Record<string, unknown> = {};
      if (typeof params.name === "string") operations.name = params.name;
      if (typeof params.description === "string") operations.description = params.description;
      if (Object.keys(operations).length === 0) {
        return { content: "No fields to update.", details: { updated: false } };
      }
      const updResult = await safeUpdateDoc(tctx.client, PROJECT_CLASS, existing, operations);
      if (!updResult.ok) return updResult.error;
      return {
        content: `Updated project ${tctx.project}: ${Object.keys(operations).join(", ")}`,
        details: { updated: true, fields: Object.keys(operations) },
      };
    },
  }),

  // 5. delete_project — destructive, confirm gate
  defineHulyTool({
    name: "delete_project",
    label: "Delete project",
    description: "Delete Huly project (destructive — confirm gate).",
    promptSnippet: "Delete a Huly project (asks confirmation).",
    destructive: true,
    needsProject: true,
    destructiveContext: (p) => ({
      type: "project",
      id: (p as { project?: string }).project ?? "<unknown>",
    }),
    parameters: Type.Object({ workspace: workspaceParam, project: projectParam }),
    async handler(_params, tctx) {
      const existing = await tctx.client.findOne(PROJECT_CLASS, {
        identifier: tctx.project,
      });
      if (!existing) {
        return {
          content: `Project "${tctx.project}" not found.`,
          isError: true,
          details: { project: tctx.project },
        };
      }
      const delResult = await safeRemoveDoc(tctx.client, PROJECT_CLASS, existing);
      if (!delResult.ok) return delResult.error;
      return {
        content: `Deleted project ${tctx.project}.`,
        details: { deleted: true, identifier: tctx.project },
      };
    },
  }),

  // 6. list_statuses
  defineHulyTool({
    name: "list_statuses",
    label: "List statuses",
    description: "List workflow statuses cho project.",
    needsProject: true,
    parameters: Type.Object({ workspace: workspaceParam, project: projectParam }),
    async handler(_params, tctx) {
      const statuses = await tctx.client.findAll(ISSUE_STATUS_CLASS, {}, {});
      const list = statuses.map((s) => ({
        name: (s as { name?: string }).name ?? "",
        category: (s as { category?: string }).category ?? "",
      }));
      return {
        content: `Found ${list.length} status(es).`,
        details: { count: list.length, statuses: list },
      };
    },
  }),
];
