// tools/domains/issues-relations.ts — Issue relations + doclink domain (5 tools).
// Design: 06-api.md §4 Issue relations. DAG + doc↔issue links.
//
// Tools (5, FR-04 D4):
//   1. add_issue_relation     2. remove_issue_relation  3. list_issue_relations
//   4. link_document_to_issue 5. unlink_document_to_issue

import { Type } from "typebox";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { ISSUE_CLASS, DOCUMENT_CLASS, TS_RELATION_CLASS, idRef } from "./_class-refs.js";
import { workspaceParam, projectParam, identifierParam, resolveIdentifier } from "./_common.js";

export const tools: HulyToolDefinition[] = [
  // 1. add_issue_relation — DAG dependency
  defineHulyTool({
    name: "add_issue_relation",
    label: "Add issue relation",
    description: "Add relation between issues. relationType: blocks | is-blocked-by | relates-to.",
    needsProject: true,
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      identifier: identifierParam,
      targetIssue: Type.String({ description: "Target issue identifier." }),
      relationType: Type.Union([
        Type.Literal("blocks"),
        Type.Literal("is-blocked-by"),
        Type.Literal("relates-to"),
      ]),
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
      await tctx.client.addCollection(
        TS_RELATION_CLASS,
        issue.space as never,
        issue._id as never,
        ISSUE_CLASS,
        "relations",
        {
          targetIssue: idRef(params.targetIssue),
          relationType: params.relationType,
        },
      );
      return {
        content: `Added relation ${params.identifier} -[${params.relationType}]-> ${params.targetIssue}.`,
        details: {
          identifier: params.identifier,
          targetIssue: params.targetIssue,
          relationType: params.relationType,
        },
      };
    },
  }),

  // 2. remove_issue_relation
  defineHulyTool({
    name: "remove_issue_relation",
    label: "Remove issue relation",
    description: "Remove relation between issues.",
    destructive: true,
    needsProject: true,
    destructiveContext: (p) => ({
      type: "issue relation",
      id: (p as { identifier?: string }).identifier ?? "<unknown>",
    }),
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      identifier: identifierParam,
      relation: Type.String({ description: "Relation _id to remove." }),
    }),
    async handler(params, tctx) {
      const r = await tctx.client.findOne(TS_RELATION_CLASS, { _id: params.relation });
      if (!r) {
        return {
          content: `Relation "${params.relation}" not found.`,
          isError: true,
          details: { relation: params.relation },
        };
      }
      await tctx.client.removeDoc(TS_RELATION_CLASS, r.space as never, r._id as never);
      return {
        content: `Removed relation ${params.relation}.`,
        details: { deleted: true, relation: params.relation },
      };
    },
  }),

  // 3. list_issue_relations
  defineHulyTool({
    name: "list_issue_relations",
    label: "List issue relations",
    description: "List relations (blocks/blocked-by/relates) của issue.",
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
      const relations = await tctx.client.findAll(TS_RELATION_CLASS, { attachedTo: issue._id }, {});
      const list = relations.map((r) => ({
        _id: r._id,
        targetIssue: (r as { targetIssue?: string }).targetIssue,
        relationType: (r as { relationType?: string }).relationType,
      }));
      return {
        content: `Found ${list.length} relation(s) on ${params.identifier}.`,
        details: { count: list.length, relations: list },
      };
    },
  }),

  // 4. link_document_to_issue
  defineHulyTool({
    name: "link_document_to_issue",
    label: "Link document to issue",
    description: "Link document ↔ issue (native Relations panel).",
    needsProject: true,
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      identifier: identifierParam,
      document: Type.String(),
    }),
    async handler(params, tctx) {
      const issue = await tctx.client.findOne(ISSUE_CLASS, {
        identifier: resolveIdentifier(tctx.project!, params.identifier),
      });
      const doc = await tctx.client.findOne(DOCUMENT_CLASS, { _id: params.document });
      if (!issue || !doc) {
        return {
          content: `Issue or document not found.`,
          isError: true,
          details: { identifier: params.identifier, document: params.document },
        };
      }
      const links = ((issue as { documents?: unknown[] }).documents ?? []) as unknown[];
      if (links.includes(params.document)) {
        return {
          content: `Document ${params.document} already linked (no-op).`,
          details: { linked: true, idempotent: true },
        };
      }
      await tctx.client.updateDoc(ISSUE_CLASS, issue.space as never, issue._id as never, {
        $push: { documents: idRef(params.document) },
      });
      return {
        content: `Linked document ${params.document} to ${params.identifier}.`,
        details: { identifier: params.identifier, document: params.document },
      };
    },
  }),

  // 5. unlink_document_to_issue
  defineHulyTool({
    name: "unlink_document_to_issue",
    label: "Unlink document from issue",
    description: "Unlink document from issue.",
    needsProject: true,
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      identifier: identifierParam,
      document: Type.String(),
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
        $pull: { documents: idRef(params.document) },
      });
      return {
        content: `Unlinked document ${params.document} from ${params.identifier}.`,
        details: { identifier: params.identifier, document: params.document },
      };
    },
  }),
];
