// tools/domains/issues-relations.ts — Issue relations + doclink domain (5 tools).
// Design: 06-api.md §4 Issue relations. DAG + doc↔issue links.
//
// T-59 #63 refactor (2026-07-28): Issue relations KHÔNG phải class riêng —
// stored INLINE trong 2 mảng trên Issue:
//   - Issue.relations?: RelatedDocument[]    (blocks / relates-to direction)
//   - Issue.blockedBy?: RelatedDocument[]    (is-blocked-by direction)
// RelatedDocument = Pick<Doc, '_id' | '_class'> = { _id, _class } — KHÔNG có
// relationType field. add/remove dùng $push/$pull trực tiếp trên Issue (KHÔNG
// addCollection — TS_RELATION_CLASS KHÔNG tồn tại runtime, dead code đã xóa).
//
// Mapping relationType → storage:
//   - "blocks" / "relates-to" → source.relations[] push { _id: target, _class }
//     (KHÔNG phân biệt được 2 loại sau khi lưu — Huly data model không có type)
//   - "is-blocked-by" → target.blockedBy[] push { _id: source, _class }
//     (reverse direction — push lên Issue ĐÍCH, không phải nguồn)
//
// Tools (5, FR-04 D4):
//   1. add_issue_relation     2. remove_issue_relation  3. list_issue_relations
//   4. link_document_to_issue 5. unlink_document_to_issue

import { Type } from "typebox";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { ISSUE_CLASS } from "./_class-refs.js";
import { workspaceParam, projectParam, identifierParam, resolveIdentifier } from "./_common.js";

/** RelatedDocument shape = { _id: Ref<Doc>, _class: Ref<Class<Doc>> }. */
function makeRelatedDoc(targetId: string): { _id: string; _class: string } {
  return { _id: targetId, _class: ISSUE_CLASS };
}

/** Check nếu relation đã tồn tại trong mảng (idempotent guard). */
function hasRelation(arr: unknown[] | undefined, targetId: string): boolean {
  if (!Array.isArray(arr)) return false;
  return arr.some((r) => (r as { _id?: string })._id === targetId);
}

export const tools: HulyToolDefinition[] = [
  // 1. add_issue_relation — DAG dependency
  defineHulyTool({
    name: "add_issue_relation",
    label: "Add issue relation",
    description:
      "Add relation between issues. relationType: blocks | is-blocked-by | relates-to. " +
      "Note: Huly stores relations inline (Issue.relations / blockedBy) — blocks và " +
      "relates-to KHÔNG phân biệt được sau khi lưu (cùng mảng relations).",
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
      // T-52 #42: validate targetIssue tồn tại + resolve identifier → _id.
      const target = await tctx.client.findOne(ISSUE_CLASS, {
        identifier: params.targetIssue,
      });
      if (!target) {
        return {
          content: `Target issue "${params.targetIssue}" not found. Check identifier.`,
          isError: true,
          details: { targetIssue: params.targetIssue, identifier: params.identifier },
        };
      }

      // T-59 #63: inline $push trên Issue.relations (blocks/relates-to) HOẶC
      // target.blockedBy (is-blocked-by — reverse direction).
      if (params.relationType === "is-blocked-by") {
        // Reverse: A is-blocked-by B → B.blockedBy[] push A. Push trên target.
        const targetBlockedBy = (target as { blockedBy?: unknown[] }).blockedBy;
        if (hasRelation(targetBlockedBy, issue._id as string)) {
          return {
            content: `Relation ${params.identifier} -[is-blocked-by]-> ${params.targetIssue} already exists (no-op).`,
            details: { idempotent: true, relationType: params.relationType },
          };
        }
        await tctx.client.updateDoc(ISSUE_CLASS, target.space as never, target._id as never, {
          $push: { blockedBy: makeRelatedDoc(issue._id as string) },
        });
      } else {
        // Forward: A blocks/relates-to B → A.relations[] push B.
        const issueRelations = (issue as { relations?: unknown[] }).relations;
        if (hasRelation(issueRelations, target._id as string)) {
          return {
            content: `Relation ${params.identifier} -[${params.relationType}]-> ${params.targetIssue} already exists (no-op).`,
            details: { idempotent: true, relationType: params.relationType },
          };
        }
        await tctx.client.updateDoc(ISSUE_CLASS, issue.space as never, issue._id as never, {
          $push: { relations: makeRelatedDoc(target._id as string) },
        });
      }
      return {
        content: `Added relation ${params.identifier} -[${params.relationType}]-> ${params.targetIssue}.`,
        details: {
          identifier: params.identifier,
          targetIssue: params.targetIssue,
          targetIssueId: target._id,
          relationType: params.relationType,
        },
      };
    },
  }),

  // 2. remove_issue_relation — T-59: $pull theo targetIssue + relationType
  // (KHÔNG dùng relation _id nữa — relation là array element, KHÔNG phải doc riêng)
  defineHulyTool({
    name: "remove_issue_relation",
    label: "Remove issue relation",
    description:
      "Remove relation between issues. Pass targetIssue + relationType (KHÔNG dùng relation _id — " +
      "Huly stores relations inline trong Issue.relations / blockedBy array).",
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
      targetIssue: Type.String({ description: "Target issue identifier to remove relation to." }),
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
      const target = await tctx.client.findOne(ISSUE_CLASS, {
        identifier: params.targetIssue,
      });
      if (!target) {
        return {
          content: `Target issue "${params.targetIssue}" not found.`,
          isError: true,
          details: { targetIssue: params.targetIssue },
        };
      }

      // T-59: $pull theo { _id: targetId } — match array element.
      // code-review M2: early-return khi !existed — tránh waste network call +
      // message "no-op" misleading (server side KHÔNG nhận update).
      const pullRef = makeRelatedDoc(target._id as string);
      const pullSourceRef = makeRelatedDoc(issue._id as string);
      if (params.relationType === "is-blocked-by") {
        // Reverse: remove A khỏi B.blockedBy[]
        if (!hasRelation((target as { blockedBy?: unknown[] }).blockedBy, issue._id as string)) {
          return {
            content: `Relation ${params.identifier} -[is-blocked-by]-> ${params.targetIssue} did not exist (no-op, idempotent).`,
            details: { idempotent: true, relationType: params.relationType },
          };
        }
        await tctx.client.updateDoc(ISSUE_CLASS, target.space as never, target._id as never, {
          $pull: { blockedBy: pullSourceRef },
        });
      } else {
        if (!hasRelation((issue as { relations?: unknown[] }).relations, target._id as string)) {
          return {
            content: `Relation ${params.identifier} -[${params.relationType}]-> ${params.targetIssue} did not exist (no-op, idempotent).`,
            details: { idempotent: true, relationType: params.relationType },
          };
        }
        await tctx.client.updateDoc(ISSUE_CLASS, issue.space as never, issue._id as never, {
          $pull: { relations: pullRef },
        });
      }
      return {
        content: `Removed relation ${params.identifier} -[${params.relationType}]-> ${params.targetIssue}.`,
        details: {
          identifier: params.identifier,
          targetIssue: params.targetIssue,
          relationType: params.relationType,
        },
      };
    },
  }),

  // 3. list_issue_relations — T-59: read Issue.relations + blockedBy trực tiếp
  defineHulyTool({
    name: "list_issue_relations",
    label: "List issue relations",
    description:
      "List relations (blocks/blocked-by/relates) của issue. Huly KHÔNG lưu relationType — " +
      "blocks và relates-to KHÔNG phân biệt được (cùng mảng relations).",
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
      // T-59: read inline arrays trực tiếp (KHÔNG findAll TS_RELATION_CLASS).
      const relations = ((issue as { relations?: unknown[] }).relations ?? []) as Array<{
        _id?: string;
        _class?: string;
      }>;
      const blockedBy = ((issue as { blockedBy?: unknown[] }).blockedBy ?? []) as Array<{
        _id?: string;
        _class?: string;
      }>;
      const relList = relations.map((r) => ({
        targetIssueId: r._id,
        direction: "blocks-or-relates-to" as const,
        note: "Huly KHÔNG phân biệt blocks vs relates-to (cùng mảng relations)",
      }));
      const blockedList = blockedBy.map((r) => ({
        targetIssueId: r._id,
        direction: "is-blocked-by" as const,
      }));
      const all = [...relList, ...blockedList];
      return {
        content: `Found ${all.length} relation(s) on ${params.identifier} (${relList.length} blocks/relates-to, ${blockedList.length} blocked-by).`,
        details: { count: all.length, relations: all },
      };
    },
  }),

  // 4. link_document_to_issue — T-60: honest-unavailable (DOCUMENT_CLASS orphan)
  defineHulyTool({
    name: "link_document_to_issue",
    label: "Link document to issue",
    description:
      "UNAVAILABLE — tracker:class:Document not registered runtime. Link doc↔issue via Huly UI.",
    needsProject: true,
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      identifier: identifierParam,
      document: Type.String(),
    }),
    async handler(_params, _tctx) {
      return {
        content:
          `link_document_to_issue KHÔNG khả dụng: Huly runtime class ` +
          `"tracker:class:Document" KHÔNG register trong plugin() class block ` +
          `(interface orphan — T-58 audit). Link doc↔issue qua Huly UI Relations ` +
          `panel trực tiếp.`,
        isError: true,
        details: { reason: "interface_orphan", useClass: "tracker:class:Document" },
      };
    },
  }),

  // 5. unlink_document_to_issue — T-60: honest-unavailable (DOCUMENT_CLASS orphan)
  defineHulyTool({
    name: "unlink_document_to_issue",
    label: "Unlink document from issue",
    description:
      "UNAVAILABLE — tracker:class:Document not registered runtime. Unlink doc↔issue via Huly UI.",
    needsProject: true,
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      identifier: identifierParam,
      document: Type.String(),
    }),
    async handler(_params, _tctx) {
      return {
        content:
          `unlink_document_to_issue KHÔNG khả dụng: Huly runtime class ` +
          `"tracker:class:Document" KHÔNG register trong plugin() class block ` +
          `(interface orphan — T-58 audit). Unlink doc↔issue qua Huly UI ` +
          `Relations panel trực tiếp.`,
        isError: true,
        details: { reason: "interface_orphan", useClass: "tracker:class:Document" },
      };
    },
  }),
];
