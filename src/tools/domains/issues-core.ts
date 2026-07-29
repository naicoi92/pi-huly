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
import {
  ISSUE_CLASS,
  PROJECT_CLASS,
  PERSON_CLASS,
  TAG_REFERENCE_CLASS,
  TAG_CLASS,
  idRef,
  NO_PARENT_REF,
  ISSUE_KIND_REF,
} from "./_class-refs.js";
import {
  topLevelIssueParent,
  attachIssueChild,
  hasConcreteIssueParent,
  updateDescendantParents,
  type IssueHierarchyFields,
} from "./issues-hierarchy.js";
import {
  workspaceParam,
  projectParam,
  identifierParam,
  prioritySchema,
  statusCategorySchema,
  resolveIdentifier,
  escapeLikePattern,
  safeUpdateDoc,
  safeRemoveDoc,
  getProjectSpace,
  getProjectStatuses,
} from "./_common.js";
import { findPersonByEmailOrName } from "./contacts.js";

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
      // T-71: space scoping — project._id = space (canonical, thay identifier $like).
      const space = await getProjectSpace(tctx.client, tctx.project!);
      if (!space) {
        return {
          content: `Project "${tctx.project}" not found.`,
          isError: true,
          details: { project: tctx.project },
        };
      }
      const query: Record<string, unknown> = { space };
      if (params.status !== undefined) query.status = params.status;
      if (params.statusCategory !== undefined) query.statusCategory = params.statusCategory;
      // T-71: assignee resolve email/name → Person._id (Issue.assignee = Ref<Person>).
      if (params.assignee !== undefined) {
        const personId = await findPersonByEmailOrName(tctx.client, params.assignee);
        if (!personId) {
          return {
            content: `Assignee "${params.assignee}" not found (no Person matching email/name).`,
            isError: true,
            details: { assignee: params.assignee },
          };
        }
        query.assignee = personId;
      }
      if (params.component !== undefined) query.component = params.component;
      // T-68: parentIssue filter → resolve identifier → _id, query.attachedTo.
      if (params.parentIssue !== undefined) {
        const parent = await tctx.client.findOne(ISSUE_CLASS, {
          identifier: resolveIdentifier(tctx.project!, params.parentIssue),
        });
        if (!parent) {
          return {
            content: `Parent issue "${params.parentIssue}" not found.`,
            isError: true,
            details: { parentIssue: params.parentIssue },
          };
        }
        query.attachedTo = parent._id;
      }
      // T-71: titleSearch ADD filter (KHÔNG xóa space — tránh leak cross-project).
      if (params.titleSearch !== undefined) {
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
        parents?: Array<{ _id?: string; identifier?: string }>;
        subIssues?: number;
        modifiedOn?: number;
        createdOn?: number;
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
      // T-80 #103: resolve raw refs → human names. status _id → name (qua
      // getProjectStatuses ProjectType traversal). assignee Person _id → name.
      // labels = TagReference attachedTo issue. parentIssue = parents[last].
      let statusName = f.status;
      if (f.status !== undefined) {
        const projectStatuses = await getProjectStatuses(tctx.client, tctx.project!);
        const match = projectStatuses?.statuses.find((s) => s._id === f.status);
        if (match) statusName = match.name;
      }
      let assigneeName: string | undefined;
      if (f.assignee !== undefined && f.assignee !== null) {
        const person = await tctx.client.findOne(PERSON_CLASS, { _id: f.assignee } as never);
        assigneeName = (person as { name?: string } | null)?.name;
      }
      let labels: Array<{ title?: unknown; color?: unknown }> = [];
      if (f._id !== undefined) {
        const tagRefs = (await tctx.client.findAll(TAG_REFERENCE_CLASS, {
          attachedTo: f._id,
        } as never)) as Array<{ title?: unknown; color?: unknown }>;
        labels = tagRefs;
      }
      const directParent =
        f.parents !== undefined && f.parents.length > 0
          ? f.parents[f.parents.length - 1]
          : undefined;
      return {
        content:
          `${f.identifier}: ${f.title ?? ""}\n\n` +
          `Status: ${statusName ?? "?"} · Priority: ${f.priority ?? "?"} · Assignee: ${assigneeName ?? "?"}\n\n` +
          `${description ?? ""}`,
        details: {
          identifier: f.identifier,
          title: f.title,
          description,
          descriptionRef,
          status: statusName,
          statusRef: f.status,
          priority: f.priority,
          assignee: assigneeName,
          assigneeRef: f.assignee,
          milestone: f.milestone,
          component: f.component,
          dueDate: f.dueDate,
          estimation: f.estimation,
          parentIssue: directParent?.identifier,
          subIssues: f.subIssues,
          labels: labels.map((l) => ({ title: l.title, color: l.color })),
          modifiedOn: f.modifiedOn,
          createdOn: f.createdOn,
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
      // T-67 #75: $inc sequence trên Project → lấy sequence number (atomic, tránh
      // race duplicate identifier). trusted issues-write.ts:133.
      const incResult = await tctx.client.updateDoc(
        PROJECT_CLASS,
        "core:space:Space" as never,
        project._id as never,
        { $inc: { sequence: 1 } } as never,
        true,
      );
      // Extract sequence từ txResult (Huly trả { object: { sequence: N } }).
      const seqRaw = (incResult as { object?: { sequence?: number } })?.object?.sequence;
      const sequence =
        typeof seqRaw === "number"
          ? seqRaw
          : ((project as { sequence?: number }).sequence ?? 0) + 1;
      const identifier = `${(project as { identifier?: string }).identifier ?? tctx.project}-${sequence}`;

      // T-72 #80: description = MarkupBlobRef (KHÔNG inline string). uploadMarkup
      // trả ref → gán vào description. Format "markdown" — client parse md→markup.
      const issueId = `tracker:issue.${Math.random().toString(36).slice(2, 14)}`;
      let descriptionRef: unknown = null;
      if (params.description !== undefined && params.description.trim() !== "") {
        descriptionRef = await tctx.client.uploadMarkup(
          ISSUE_CLASS,
          issueId,
          "description",
          params.description,
          "markdown",
        );
      }
      const id = await tctx.client.addCollection(
        ISSUE_CLASS,
        project._id as never, // space = project (issues live trong project space)
        NO_PARENT_REF, // attachedTo = NoParent sentinel (top-level)
        ISSUE_CLASS, // attachedToClass
        "subIssues", // collection
        {
          title: params.title,
          description: descriptionRef,
          priority: params.priority,
          assignee: params.assignee,
          status: params.status,
          number: sequence,
          kind: ISSUE_KIND_REF,
          identifier,
          component: null,
          estimation: params.estimation ?? 0,
          remainingTime: 0,
          reportedTime: 0,
          reports: 0,
          subIssues: 0,
          parents: [],
          childInfo: [],
          dueDate: params.dueDate ?? null,
          rank: "", // lexorank empty — server gán nếu empty (pattern T-46)
        } as never,
        issueId as never,
      );
      // T-40 #26: identifier computed locally (T-67) — KHÔNG cần lookup server.
      const contentMsg = `Created issue ${identifier}: "${params.title}".`;
      return {
        content: contentMsg,
        details: { id, identifier, title: params.title, number: sequence },
      };
    },
  }),

  // 4. update_issue
  // T-47 #36: KHÔNG dùng needsAssignee (D15 chỉ cho create). Update KHÔNG
  // auto-fill assignee → caller muốn đổi assignee phải truyền rõ. Trước đây
  // leak sang update → mọi update tự claim current user (silent overwrite).
  // T-47 #36: status phải validate workflow enum — server reject raw short
  // name ("Done") mà cần full ref ("tracker:status:Done"). Trước đây push raw
  // → silent reject, status không persist. Giờ lookup IssueStatus → resolve.
  defineHulyTool({
    name: "update_issue",
    label: "Update issue",
    description:
      "Update issue fields. Status must match exact IssueStatus name (case-sensitive) or _id full ref.",
    needsProject: true,
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      identifier: identifierParam,
      title: Type.Optional(Type.String()),
      description: Type.Optional(Type.String()),
      priority: prioritySchema,
      assignee: Type.Optional(Type.Union([Type.String(), Type.Null()])),
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
      // T-72 review: track in-place description update (updateMarkup execute NHƯNG
      // KHÔNG thêm vào ops → guard empty-ops + response phải account cho flag này).
      let descriptionUpdatedInPlace = false;
      if (params.title !== undefined) ops.title = params.title;
      // T-72 #80: description = MarkupBlobRef. Nếu issue đã có description ref →
      // updateMarkup overwrite; chưa có → uploadMarkup create + ops.description = ref.
      if (params.description !== undefined) {
        const existingDesc = (issue as { description?: unknown }).description;
        if (existingDesc) {
          await tctx.client.updateMarkup(
            ISSUE_CLASS,
            issue._id,
            "description",
            params.description,
            "markdown",
          );
          descriptionUpdatedInPlace = true;
        } else {
          const ref = await tctx.client.uploadMarkup(
            ISSUE_CLASS,
            issue._id,
            "description",
            params.description,
            "markdown",
          );
          ops.description = ref;
        }
      }
      if (params.priority !== undefined) ops.priority = params.priority;
      if (params.assignee !== undefined) {
        // T-80 #103: resolve assignee email/name → Person._id (đồng bộ create_issue).
        // Trước đây push raw string vào Ref<Person> → garbage. Hỗ trợ null (unassign).
        if (params.assignee === null) {
          ops.assignee = null;
        } else {
          const personId = await findPersonByEmailOrName(tctx.client, params.assignee);
          if (!personId) {
            return {
              content:
                `Assignee "${params.assignee}" not found (no Person matching email/name). ` +
                `Assignee unchanged.`,
              isError: true,
              details: { assignee: params.assignee, identifier: params.identifier },
            };
          }
          ops.assignee = personId;
        }
      }
      if (params.dueDate !== undefined) ops.dueDate = params.dueDate;
      if (params.estimation !== undefined) ops.estimation = params.estimation;
      // T-47 #36: resolve status short name ("Done") → full ref
      // ("tracker:status:Done") trước khi push. Huly IssueStatus có _id = full
      // ref, name = short human. Match _id exact trước (caller truyền full ref
      // → match chắc), fallback name (caller truyền short → heuristic; có thể
      // ambiguous nếu multi-project workspace có cùng status name — documented
      // limitation, scope của fix này không filter theo taskType). Invalid →
      // isError + list valid statuses cho LLM retry.
      //
      // T-47 review fix:
      // - Empty statuses (fresh workspace chưa config workflow) → isError rõ
      //   ràng KHÔNG "Valid statuses: ." (misleading). Hướng dẫn setup trước.
      // - Match thành công nhưng _id undefined (schema drift) → isError KHÔNG
      //   fallback raw params.status (reintroduce bug gốc — raw short name bị
      //   server silent reject).
      // - Input trim → match linh hoạt với " Done " / "Done" (caller LLM hay
      //   thêm whitespace). Exact case vẫn giữ (Huly status name verbatim).
      if (params.status !== undefined) {
        // T-72 #80: scope status theo project (getProjectStatuses T-71 ProjectType
        // traversal) — KHÔNG findAll global (cross-project ambiguous match).
        const projectStatuses = await getProjectStatuses(tctx.client, tctx.project!);
        if (!projectStatuses) {
          return {
            content: `Project "${tctx.project}" not found.`,
            isError: true,
            details: { identifier: params.identifier, project: tctx.project },
          };
        }
        const statuses = projectStatuses.statuses;
        if (statuses.length === 0) {
          return {
            content:
              "No workflow statuses configured for this project. " +
              "Set up project workflow or create statuses first (huly_create_issue_status).",
            isError: true,
            details: {
              identifier: params.identifier,
              requestedStatus: params.status,
              noStatusesConfigured: true,
            },
          };
        }
        const requested = params.status.trim();
        // Ưu tiên _id exact trước name short (giảm ambiguity multi-project).
        const byId = statuses.find((s) => s._id === requested);
        const byName = statuses.find((s) => s.name === requested);
        const match = byId ?? byName;
        if (match === undefined) {
          const valid = statuses
            .map((s) => s.name)
            .filter((n) => n.length > 0)
            .join(", ");
          return {
            content: `Invalid status "${params.status}". Valid statuses: ${valid}.`,
            isError: true,
            details: {
              identifier: params.identifier,
              invalidStatus: params.status,
              validStatuses: statuses.map((s) => s.name),
            },
          };
        }
        ops.status = match._id;
      }
      if (Object.keys(ops).length === 0 && !descriptionUpdatedInPlace) {
        return { content: "No fields to update.", details: { updated: false } };
      }
      // T-72 review: nếu chỉ description in-place (ops empty), KHÔNG gọi updateDoc
      // (description đã write qua updateMarkup). Response báo success.
      if (Object.keys(ops).length === 0 && descriptionUpdatedInPlace) {
        return {
          content: `Updated issue ${params.identifier}: description`,
          details: { updated: true, identifier: params.identifier, fields: ["description"] },
        };
      }
      const updResult = await safeUpdateDoc(tctx.client, ISSUE_CLASS, issue, ops);
      if (!updResult.ok) return updResult.error;
      const fields = Object.keys(ops);
      if (descriptionUpdatedInPlace) fields.push("description");
      return {
        content: `Updated issue ${params.identifier}: ${fields.join(", ")}`,
        details: { updated: true, identifier: params.identifier, fields },
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
      const delResult = await safeRemoveDoc(tctx.client, ISSUE_CLASS, issue);
      if (!delResult.ok) return delResult.error;
      return {
        content: `Deleted issue ${params.identifier}.`,
        details: { deleted: true, identifier: params.identifier },
      };
    },
  }),

  // 6. move_issue — change parent (AttachedDoc hierarchy, T-68 fix).
  // T-52 #42: KHÔNG truyền parentIssue = top-level promotion (Option A user chốt).
  // T-68: dùng attachedTo/attachedToClass/collection/parents/subIssues thay vì
  // field `parentIssue` (KHÔNG tồn tại runtime). Helper issues-hierarchy.ts.
  defineHulyTool({
    name: "move_issue",
    label: "Move issue",
    description: "Move issue to new parent (epic). KHÔNG truyền parentIssue → promote top-level.",
    needsProject: true,
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      identifier: identifierParam,
      parentIssue: Type.Optional(
        Type.String({
          description: "New parent issue identifier. KHÔNG truyền = top-level promotion.",
        }),
      ),
    }),
    async handler(params, tctx) {
      const issue = (await tctx.client.findOne(ISSUE_CLASS, {
        identifier: resolveIdentifier(tctx.project!, params.identifier),
      })) as IssueHierarchyFields & { space?: string };
      if (!issue) {
        return {
          content: `Issue "${params.identifier}" not found.`,
          isError: true,
          details: { identifier: params.identifier },
        };
      }
      const projectSpace = (issue.space ?? "") as never;
      // Capture old parent state BEFORE mutate (attachIssueChild overwrites attachedTo).
      const oldAttachedTo = issue.attachedTo;
      const wasChild = hasConcreteIssueParent(issue);

      // Case A: top-level promotion (no parentIssue param).
      if (params.parentIssue === undefined) {
        const topFields = topLevelIssueParent();
        await tctx.client.updateDoc(
          ISSUE_CLASS,
          projectSpace,
          issue._id as never,
          {
            attachedTo: topFields.attachedTo,
            attachedToClass: topFields.attachedToClass,
            collection: topFields.collection,
            parents: topFields.parents,
          } as never,
        );
        // Dec old parent subIssues if was child (trusted always decs when oldParentIsIssue).
        if (wasChild && oldAttachedTo) {
          await tctx.client.updateDoc(
            ISSUE_CLASS,
            projectSpace,
            oldAttachedTo as never,
            { $inc: { subIssues: -1 } } as never,
          );
        }
        // Re-breadcrumb descendants (clear chain to []).
        if ((issue.subIssues ?? 0) > 0) {
          await updateDescendantParents(tctx.client, projectSpace as string, issue, []);
        }
        return {
          content: `Moved ${params.identifier} → top-level.`,
          details: { identifier: params.identifier, parentIssue: null },
        };
      }

      // Case B: move to new parent.
      const parent = (await tctx.client.findOne(ISSUE_CLASS, {
        identifier: resolveIdentifier(tctx.project!, params.parentIssue),
      })) as IssueHierarchyFields;
      if (!parent) {
        return {
          content: `Parent issue "${params.parentIssue}" not found.`,
          isError: true,
          details: { identifier: params.identifier, parentIssue: params.parentIssue },
        };
      }
      // attachIssueChild: set child fields + $inc new parent subIssues +1.
      await attachIssueChild(tctx.client, projectSpace as string, issue._id, parent, {});
      // Dec old parent subIssues if was child (always when wasChild — same-parent net 0).
      if (wasChild && oldAttachedTo) {
        await tctx.client.updateDoc(
          ISSUE_CLASS,
          projectSpace,
          oldAttachedTo as never,
          { $inc: { subIssues: -1 } } as never,
        );
      }
      // Re-breadcrumb descendants với new ancestor chain.
      if ((issue.subIssues ?? 0) > 0) {
        const parentInfo = {
          parentId: parent._id,
          identifier: parent.identifier ?? "",
          parentTitle: parent.title ?? "",
          space: projectSpace as string,
        };
        await updateDescendantParents(tctx.client, projectSpace as string, issue, [
          ...(parent.parents ?? []),
          parentInfo,
        ]);
      }
      return {
        content: `Moved ${params.identifier} → parent ${params.parentIssue}.`,
        details: { identifier: params.identifier, parentIssue: params.parentIssue },
      };
    },
  }),

  // 7. add_issue_label — GLOBAL labels (05-data-model §3)
  // T-45 #27: validate label tồn tại + push TagReference object shape (audit §4).
  // T-58 #43: dùng TAG_CLASS (TagElement) thay LABEL_CLASS (deprecated —
  // view:class:Label 0 match runtime). Label workflow giờ dùng tag entity.
  defineHulyTool({
    name: "add_issue_label",
    label: "Add issue label",
    description:
      "Add label/tag to issue. Accepts tag title or _id (resolved via tags:class:TagElement). " +
      "Validates tag exists before push. Use huly_create_tag to create new.",
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
      // T-45 + T-58: validate tag tồn tại — try by title first, fallback by _id.
      // T-58: dùng TAG_CLASS (TagElement) thay LABEL_CLASS (deprecated — view:class:Label
      // 0 match runtime). Label workflow giờ dùng tag entity (redirect từ labels.ts).
      const label =
        (await tctx.client.findOne(TAG_CLASS, {
          title: params.label,
        })) ?? (await tctx.client.findOne(TAG_CLASS, { _id: idRef(params.label) }));
      if (!label) {
        return {
          content: `Label/tag "${params.label}" not found. Create via huly_create_tag first.`,
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
      const updResult = await safeUpdateDoc(tctx.client, ISSUE_CLASS, issue, {
        $push: {
          labels: {
            tag: labelDoc._id,
            title: labelDoc.title ?? params.label,
            color: labelDoc.color ?? 0,
          },
        },
      });
      if (!updResult.ok) return updResult.error;
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
      // Validate tag exists (T-58: TAG_CLASS thay LABEL_CLASS deprecated).
      const label =
        (await tctx.client.findOne(TAG_CLASS, {
          title: params.label,
        })) ?? (await tctx.client.findOne(TAG_CLASS, { _id: idRef(params.label) }));
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
      const updResult = await safeUpdateDoc(tctx.client, ISSUE_CLASS, issue, {
        $pull: { labels: { tag: labelDoc._id } },
      });
      if (!updResult.ok) return updResult.error;
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
