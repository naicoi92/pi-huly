// tools/domains/issues-core.ts — Issues core domain (8 tools).
// Design: 06-api.md §4 Issues (subset). List/get/create/update/delete/move + labels.
//
// Tools (8, FR-04 D4):
//   1. list_issues      2. get_issue      3. create_issue
//   4. update_issue     5. delete_issue   6. move_issue
//   7. add_issue_label  8. remove_issue_label
//
// Assignee default: D15 FR-18 (currentUser email khi absent).

import { Type } from "typebox";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { ISSUE_CLASS, PROJECT_CLASS, LABEL_CLASS, idRef } from "./_class-refs.js";
import {
  workspaceParam,
  projectParam,
  identifierParam,
  prioritySchema,
  statusCategorySchema,
  resolveIdentifier,
  escapeLikePattern,
} from "./_common.js";
import { mdToMarkup } from "../../markup/markup.js";

export const tools: HulyToolDefinition[] = [
  // 1. list_issues
  defineHulyTool({
    name: "list_issues",
    label: "List issues",
    description:
      "List issues trong project. Filter by status, statusCategory, assignee, component, parentIssue, titleSearch.",
    promptSnippet: "List Huly issues in a project.",
    needsProject: true,
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      status: Type.Optional(Type.String()),
      statusCategory: statusCategorySchema,
      assignee: Type.Optional(Type.String()),
      component: Type.Optional(Type.String()),
      parentIssue: Type.Optional(Type.String()),
      titleSearch: Type.Optional(Type.String()),
      limit: Type.Optional(Type.Integer({ minimum: 1 })),
    }),
    async handler(params, tctx) {
      const limit = typeof params.limit === "number" ? params.limit : 50;
      const query: Record<string, unknown> = {
        // Filter theo project prefix (vd "PD-%") — issue scoped theo project.
        identifier: { $like: `${tctx.project!}-%` },
      };
      if (params.status !== undefined) query.status = params.status;
      if (params.statusCategory !== undefined) query.statusCategory = params.statusCategory;
      if (params.assignee !== undefined) query.assignee = params.assignee;
      if (params.component !== undefined) query.component = params.component;
      if (params.parentIssue !== undefined) query.parentIssue = params.parentIssue;
      if (params.titleSearch !== undefined) {
        // Override identifier filter khi search title (KHÔNG combine $like)
        delete query.identifier;
        query.title = { $like: `%${escapeLikePattern(params.titleSearch)}%` };
      }
      const issues = await tctx.client.findAll(ISSUE_CLASS, query, { limit });
      const list = issues.map((i) => ({
        identifier: (i as { identifier?: string }).identifier ?? "",
        title: (i as { title?: string }).title ?? "",
        status: (i as { status?: string }).status,
        priority: (i as { priority?: string }).priority,
        assignee: (i as { assignee?: string }).assignee,
      }));
      return {
        content: `Found ${list.length} issue(s).`,
        details: { count: list.length, issues: list },
      };
    },
  }),

  // 2. get_issue
  defineHulyTool({
    name: "get_issue",
    label: "Get issue",
    description: "Get issue detail by identifier.",
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
      const f = issue as {
        _id?: string;
        identifier?: string;
        title?: string;
        description?: string | null;
        status?: string;
        priority?: string;
        assignee?: string;
        milestone?: string;
        component?: string;
        dueDate?: number;
        estimation?: number;
      };
      // T-41 #23: Issue.description là MarkupBlobRef (document ref), KHÔNG inline
      // markup string. fetchMarkup resolve ref → markdown content qua collaborator.
      // Null/undefined description → skip. fetchMarkup fail → fallback descriptionRef
      // rõ ràng cho LLM (tránh trả ref string vô nghĩa).
      let description: string | undefined;
      let descriptionRef: string | undefined;
      if (f.description !== null && f.description !== undefined && f._id !== undefined) {
        try {
          const markup = await tctx.client.fetchMarkup(
            ISSUE_CLASS,
            f._id,
            "description",
            f.description,
            "markdown",
          );
          description = typeof markup === "string" ? markup : undefined;
        } catch {
          // fetchMarkup fail (ref stale / collaborator down / REST transport) →
          // fallback descriptionRef rõ ràng, không trả ref vô nghĩa cho LLM.
          descriptionRef = f.description;
        }
      }
      return {
        content: `${f.identifier}: ${f.title ?? ""}\n\nStatus: ${f.status ?? "?"} · Priority: ${f.priority ?? "?"} · Assignee: ${f.assignee ?? "?"}\n\n${description ?? ""}`,
        details: {
          identifier: f.identifier,
          title: f.title,
          description,
          descriptionRef,
          status: f.status,
          priority: f.priority,
          assignee: f.assignee,
          milestone: f.milestone,
          component: f.component,
          dueDate: f.dueDate,
          estimation: f.estimation,
        },
      };
    },
  }),

  // 3. create_issue
  defineHulyTool({
    name: "create_issue",
    label: "Create issue",
    description:
      "Create issue. Assignee absent → default currentUser email (D15). Description = markdown.",
    promptSnippet: "Create a new Huly issue.",
    needsProject: true,
    needsAssignee: true,
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      title: Type.String(),
      description: Type.Optional(Type.String()),
      priority: prioritySchema,
      assignee: Type.Optional(Type.String()),
      status: Type.Optional(Type.String()),
      taskType: Type.Optional(Type.String()),
      parentIssue: Type.Optional(Type.String()),
      dueDate: Type.Optional(Type.Integer()),
      estimation: Type.Optional(Type.Integer()),
    }),
    async handler(params, tctx) {
      const project = await tctx.client.findOne(PROJECT_CLASS, {
        identifier: tctx.project,
      });
      if (!project) {
        return {
          content: `Project "${tctx.project}" not found. Run /huly init or check binding.`,
          isError: true,
          details: { project: tctx.project },
        };
      }
      // Description markdown → markup (FR-13 R8)
      const descriptionMarkup =
        params.description !== undefined
          ? JSON.stringify(mdToMarkup(params.description))
          : undefined;
      const id = await tctx.client.createDoc(ISSUE_CLASS, project.space as never, {
        title: params.title,
        description: descriptionMarkup,
        priority: params.priority,
        assignee: params.assignee,
        status: params.status,
        taskType: params.taskType,
        parentIssue: params.parentIssue,
        dueDate: params.dueDate,
        estimation: params.estimation,
      });
      // T-40 #26: identifier (vd "PD-42") được server gán sau createDoc.
      // createDoc chỉ trả _id internal → lookup issue để lấy identifier cho LLM
      // (90% tool khác như get/update/add_comment cần identifier, không _id).
      // Lookup fail (server async index chậm) → vẫn trả id, identifier=undefined
      // + hint content rõ ràng để LLM biết retry qua list_issues (tránh stuck
      // khi LLM cố dùng _id internal cho get_issue — resolveIdentifier fail).
      let identifier: string | undefined;
      try {
        const created = await tctx.client.findOne(ISSUE_CLASS, { _id: id });
        identifier = (created as { identifier?: string } | null)?.identifier;
      } catch {
        // Lookup fail không block success — identifier optional, LLM có _id dự phòng
      }
      const contentMsg =
        identifier !== undefined
          ? `Created issue ${identifier}: "${params.title}".`
          : `Created issue "${params.title}". Identifier pending (server indexing) — use huly_list_issues to find by title if needed.`;
      return {
        content: contentMsg,
        details: { id, identifier, title: params.title },
      };
    },
  }),

  // 4. update_issue
  defineHulyTool({
    name: "update_issue",
    label: "Update issue",
    description: "Update issue fields.",
    needsProject: true,
    needsAssignee: true,
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      identifier: identifierParam,
      title: Type.Optional(Type.String()),
      description: Type.Optional(Type.String()),
      priority: prioritySchema,
      assignee: Type.Optional(Type.String()),
      status: Type.Optional(Type.String()),
      dueDate: Type.Optional(Type.Integer()),
      estimation: Type.Optional(Type.Integer()),
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
      const ops: Record<string, unknown> = {};
      if (params.title !== undefined) ops.title = params.title;
      if (params.description !== undefined)
        ops.description = JSON.stringify(mdToMarkup(params.description));
      if (params.priority !== undefined) ops.priority = params.priority;
      if (params.assignee !== undefined) ops.assignee = params.assignee;
      if (params.status !== undefined) ops.status = params.status;
      if (params.dueDate !== undefined) ops.dueDate = params.dueDate;
      if (params.estimation !== undefined) ops.estimation = params.estimation;
      if (Object.keys(ops).length === 0) {
        return { content: "No fields to update.", details: { updated: false } };
      }
      await tctx.client.updateDoc(ISSUE_CLASS, issue.space as never, issue._id as never, ops);
      return {
        content: `Updated issue ${params.identifier}: ${Object.keys(ops).join(", ")}`,
        details: { updated: true, identifier: params.identifier, fields: Object.keys(ops) },
      };
    },
  }),

  // 5. delete_issue — destructive
  defineHulyTool({
    name: "delete_issue",
    label: "Delete issue",
    description: "Delete issue (destructive — confirm gate).",
    destructive: true,
    needsProject: true,
    destructiveContext: (p) => ({
      type: "issue",
      id: (p as { identifier?: string }).identifier ?? "<unknown>",
    }),
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
      await tctx.client.removeDoc(ISSUE_CLASS, issue.space as never, issue._id as never);
      return {
        content: `Deleted issue ${params.identifier}.`,
        details: { deleted: true, identifier: params.identifier },
      };
    },
  }),

  // 6. move_issue — change parent OR project (simplified: parent)
  defineHulyTool({
    name: "move_issue",
    label: "Move issue",
    description: "Move issue to new parent (epic). parentIssue=null → promote top-level.",
    needsProject: true,
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      identifier: identifierParam,
      parentIssue: Type.Optional(
        Type.String({ description: "New parent issue identifier. null = top-level." }),
      ),
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
        parentIssue: params.parentIssue === undefined ? null : idRef(params.parentIssue),
      });
      return {
        content: `Moved ${params.identifier} → parent ${params.parentIssue ?? "top-level"}.`,
        details: { identifier: params.identifier, parentIssue: params.parentIssue ?? null },
      };
    },
  }),

  // 7. add_issue_label — GLOBAL labels (05-data-model §3)
  // T-45 #27: validate label tồn tại + push TagReference object shape (audit §4).
  // Trước đây push raw string → sai shape (TagReference extends AttachedDoc, có
  // tag/title/color fields). Label không tồn tại vẫn "Added" → issue mang ref rác.
  defineHulyTool({
    name: "add_issue_label",
    label: "Add issue label",
    description:
      "Add global label to issue. Accepts label title (human) or _id (raw ref). " +
      "Validates label exists before push.",
    needsProject: true,
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      identifier: identifierParam,
      label: Type.String({ description: "Label title or _id ref." }),
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
      // T-45: validate label tồn tại — try by title first, fallback by _id.
      const label =
        (await tctx.client.findOne(LABEL_CLASS, {
          title: params.label,
        })) ?? (await tctx.client.findOne(LABEL_CLASS, { _id: idRef(params.label) }));
      if (!label) {
        return {
          content: `Label "${params.label}" not found. Create via create_label first.`,
          isError: true,
          details: { label: params.label, identifier: params.identifier },
        };
      }
      const labelDoc = label as { _id: string; title?: string; color?: number };
      // Idempotent: nếu label đã có trên issue (match tag ref) → no-op.
      const labels = ((issue as { labels?: unknown[] }).labels ?? []) as Array<{
        tag?: string;
        title?: string;
      }>;
      if (labels.some((l) => l?.tag === labelDoc._id)) {
        return {
          content: `Label ${params.label} already on ${params.identifier} (no-op).`,
          details: { added: false, idempotent: true, label: params.label },
        };
      }
      // Push TagReference object shape (audit §4 — NOT raw string).
      await tctx.client.updateDoc(ISSUE_CLASS, issue.space as never, issue._id as never, {
        $push: {
          labels: {
            tag: labelDoc._id,
            title: labelDoc.title ?? params.label,
            color: labelDoc.color ?? 0,
          },
        },
      });
      return {
        content: `Added label ${params.label} to ${params.identifier}.`,
        details: {
          added: true,
          identifier: params.identifier,
          label: params.label,
          labelId: labelDoc._id,
        },
      };
    },
  }),

  // 8. remove_issue_label — symmetric with add (T-45)
  defineHulyTool({
    name: "remove_issue_label",
    label: "Remove issue label",
    description:
      "Remove global label from issue. Accepts label title or _id. " +
      "No-op if label not present on issue (idempotent).",
    needsProject: true,
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      identifier: identifierParam,
      label: Type.String({ description: "Label title or _id ref." }),
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
      // Validate label exists (consistent with add — đừng remove label không tồn tại).
      const label =
        (await tctx.client.findOne(LABEL_CLASS, {
          title: params.label,
        })) ?? (await tctx.client.findOne(LABEL_CLASS, { _id: idRef(params.label) }));
      if (!label) {
        return {
          content: `Label "${params.label}" not found. Cannot remove.`,
          isError: true,
          details: { label: params.label, identifier: params.identifier },
        };
      }
      const labelDoc = label as { _id: string };
      // Idempotent: nếu label không có trên issue → no-op (KHÔNG crash).
      const labels = ((issue as { labels?: unknown[] }).labels ?? []) as Array<{
        tag?: string;
      }>;
      if (!labels.some((l) => l?.tag === labelDoc._id)) {
        return {
          content: `Label ${params.label} not on ${params.identifier} (no-op).`,
          details: { removed: false, idempotent: true, label: params.label },
        };
      }
      // $pull bằng tag ref object (match shape khi push).
      await tctx.client.updateDoc(ISSUE_CLASS, issue.space as never, issue._id as never, {
        $pull: { labels: { tag: labelDoc._id } },
      });
      return {
        content: `Removed label ${params.label} from ${params.identifier}.`,
        details: {
          removed: true,
          identifier: params.identifier,
          label: params.label,
          labelId: labelDoc._id,
        },
      };
    },
  }),
];
