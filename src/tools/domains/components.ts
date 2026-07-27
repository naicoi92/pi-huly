// tools/domains/components.ts — Components domain (6 tools).
// Design: 06-api.md §4 Components. CRUD + set_issue_component.

import { Type } from "typebox";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { COMPONENT_CLASS, ISSUE_CLASS, PROJECT_CLASS, idRef } from "./_class-refs.js";
import { workspaceParam, projectParam, identifierParam, resolveIdentifier } from "./_common.js";

export const tools: HulyToolDefinition[] = [
  // 1. list_components
  defineHulyTool({
    name: "list_components",
    label: "List components",
    description: "List components trong project.",
    needsProject: true,
    parameters: Type.Object({ workspace: workspaceParam, project: projectParam }),
    async handler(_params, tctx) {
      const comps = await tctx.client.findAll(COMPONENT_CLASS, {}, {});
      const list = comps.map((c) => ({
        id: c._id,
        label: (c as { label?: string }).label ?? "",
        lead: (c as { lead?: string }).lead,
      }));
      return {
        content: `Found ${list.length} component(s).`,
        details: { count: list.length, components: list },
      };
    },
  }),

  // 2. get_component
  defineHulyTool({
    name: "get_component",
    label: "Get component",
    description: "Get component by id.",
    needsProject: true,
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      component: Type.String(),
    }),
    async handler(params, tctx) {
      const c = await tctx.client.findOne(COMPONENT_CLASS, { _id: params.component });
      if (!c) {
        return {
          content: `Component "${params.component}" not found.`,
          isError: true,
          details: { component: params.component },
        };
      }
      return {
        content: `Component ${(c as { label?: string }).label ?? ""}`,
        details: {
          id: c._id,
          label: (c as { label?: string }).label,
          description: (c as { description?: string }).description,
          lead: (c as { lead?: string }).lead,
        },
      };
    },
  }),

  // 3. create_component
  defineHulyTool({
    name: "create_component",
    label: "Create component",
    description: "Create component.",
    needsProject: true,
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      label: Type.String(),
      description: Type.Optional(Type.String()),
      lead: Type.Optional(Type.String({ description: "Lead email/name." })),
    }),
    async handler(params, tctx) {
      const project = await tctx.client.findOne(PROJECT_CLASS, {
        identifier: tctx.project,
      });
      const id = await tctx.client.createDoc(
        COMPONENT_CLASS,
        (project?.space ?? tctx.workspace) as never,
        {
          label: params.label,
          description: params.description,
          lead: params.lead,
        },
      );
      return {
        content: `Created component "${params.label}".`,
        details: { id, label: params.label },
      };
    },
  }),

  // 4. update_component
  defineHulyTool({
    name: "update_component",
    label: "Update component",
    description: "Update component (label, description, lead).",
    needsProject: true,
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      component: Type.String(),
      label: Type.Optional(Type.String()),
      description: Type.Optional(Type.String()),
      lead: Type.Optional(Type.String()),
    }),
    async handler(params, tctx) {
      const c = await tctx.client.findOne(COMPONENT_CLASS, { _id: params.component });
      if (!c) {
        return {
          content: `Component "${params.component}" not found.`,
          isError: true,
          details: { component: params.component },
        };
      }
      const ops: Record<string, unknown> = {};
      if (params.label !== undefined) ops.label = params.label;
      if (params.description !== undefined) ops.description = params.description;
      if (params.lead !== undefined) ops.lead = params.lead;
      if (Object.keys(ops).length === 0) {
        return { content: "No fields to update.", details: { updated: false } };
      }
      await tctx.client.updateDoc(COMPONENT_CLASS, c.space as never, c._id as never, ops);
      return {
        content: `Updated component ${params.component}.`,
        details: { updated: true, fields: Object.keys(ops) },
      };
    },
  }),

  // 5. set_issue_component
  defineHulyTool({
    name: "set_issue_component",
    label: "Set issue component",
    description: "Gán component cho issue.",
    needsProject: true,
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      identifier: identifierParam,
      component: Type.String(),
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
        component: idRef(params.component),
      });
      return {
        content: `Set ${params.identifier} → component ${params.component}.`,
        details: { identifier: params.identifier, component: params.component },
      };
    },
  }),

  // 6. delete_component — destructive
  defineHulyTool({
    name: "delete_component",
    label: "Delete component",
    description: "Delete component (destructive).",
    destructive: true,
    needsProject: true,
    destructiveContext: (p) => ({
      type: "component",
      id: (p as { component?: string }).component ?? "<unknown>",
    }),
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      component: Type.String(),
    }),
    async handler(params, tctx) {
      const c = await tctx.client.findOne(COMPONENT_CLASS, { _id: params.component });
      if (!c) {
        return {
          content: `Component "${params.component}" not found.`,
          isError: true,
          details: { component: params.component },
        };
      }
      await tctx.client.removeDoc(COMPONENT_CLASS, c.space as never, c._id as never);
      return {
        content: `Deleted component ${params.component}.`,
        details: { deleted: true, component: params.component },
      };
    },
  }),
];
