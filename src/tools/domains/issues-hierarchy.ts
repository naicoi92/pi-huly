// tools/domains/issues-hierarchy.ts — Issue parent/child hierarchy helpers.
//
// T-68 (2026-07-28): Huly models issue hierarchy qua AttachedDoc fields:
//   - attachedTo:      Ref<Issue> — parent issue _id (top-level = NoParent "")
//   - attachedToClass: Ref<Class>  — tracker:class:Issue
//   - collection:      "subIssues" — Huly collection name
//   - parents:         IssueParentInfo[] — breadcrumb (grandparents → direct parent)
//   - subIssues:       number — count of direct children
//
// Field `parentIssue` KHÔNG tồn tại runtime (T-68 root cause — trusted
// issues-parent.ts dùng attachedTo/attachedToClass/collection/parents).
//
// Port từ trusted issues-parent.ts + issues-move.ts (adapted: string-literal
// class refs, direct async/await thay Effect, HulyClient interface pi-huly).

import type { HulyClient } from "../../client/client.js";
import { ISSUE_CLASS, NO_PARENT_REF } from "./_class-refs.js";

/** IssueParentInfo shape (Huly tracker): breadcrumb entry cho parent chain. */
export interface IssueParentInfo {
  parentId: string;
  identifier: string;
  parentTitle: string;
  space: string;
}

/** Minimal issue shape cho hierarchy ops (chỉ cần fields hierarchy). */
export interface IssueHierarchyFields {
  _id: string;
  identifier?: string;
  title?: string;
  attachedTo?: string;
  attachedToClass?: string;
  subIssues?: number;
  parents?: IssueParentInfo[];
  space?: string;
}

/** Parent data cần set khi attach issue làm child (hoặc top-level). */
export interface IssueParentData {
  attachedTo: string; // Ref<Issue> or NoParent ""
  attachedToClass: string; // ISSUE_CLASS
  collection: "subIssues";
  parents: IssueParentInfo[];
}

/** Build parent data cho top-level issue (NoParent sentinel). */
export function topLevelIssueParent(): IssueParentData {
  return {
    attachedTo: NO_PARENT_REF as string,
    attachedToClass: ISSUE_CLASS as string,
    collection: "subIssues",
    parents: [],
  };
}

/** Build parent data cho child issue (attached to parentIssue). */
export function childIssueParent(
  parentIssue: Pick<IssueHierarchyFields, "_id" | "identifier" | "parents" | "title">,
  projectSpace: string,
): IssueParentData {
  return {
    attachedTo: parentIssue._id,
    attachedToClass: ISSUE_CLASS as string,
    collection: "subIssues",
    parents: [
      ...((parentIssue.parents as IssueParentInfo[] | undefined) ?? []),
      {
        parentId: parentIssue._id,
        identifier: parentIssue.identifier ?? "",
        parentTitle: parentIssue.title ?? "",
        space: projectSpace,
      },
    ],
  };
}

/** Check nếu issue có parent là issue (KHÔNG phải top-level NoParent). */
export function hasConcreteIssueParent(
  issue: Pick<IssueHierarchyFields, "attachedTo" | "attachedToClass">,
): boolean {
  return (
    issue.attachedToClass === (ISSUE_CLASS as string) &&
    issue.attachedTo !== (NO_PARENT_REF as string) &&
    issue.attachedTo !== undefined &&
    issue.attachedTo !== ""
  );
}

/**
 * Attach issue làm child của parentIssue:
 *   1. updateDoc issue: set attachedTo/attachedToClass/collection/parents + extra ops
 *   2. updateDoc parentIssue: $inc subIssues +1
 *
 * Non-atomic (2 thao tác riêng, khớp trusted attachIssueChild).
 */
export async function attachIssueChild(
  client: HulyClient,
  projectSpace: string,
  childId: string,
  parentIssue: Pick<IssueHierarchyFields, "_id" | "identifier" | "parents" | "title">,
  additionalUpdate: Record<string, unknown>,
): Promise<void> {
  const parent = childIssueParent(parentIssue, projectSpace);
  await client.updateDoc(
    ISSUE_CLASS,
    projectSpace as never,
    childId as never,
    {
      ...additionalUpdate,
      attachedTo: parent.attachedTo,
      attachedToClass: parent.attachedToClass,
      collection: parent.collection,
      parents: parent.parents,
    } as never,
  );
  await client.updateDoc(
    ISSUE_CLASS,
    projectSpace as never,
    parentIssue._id as never,
    { $inc: { subIssues: 1 } } as never,
  );
}

/**
 * Recursively update parents[] breadcrumb trên tất cả descendants khi 1 issue
 * được move. Mỗi descendant giữ chain cũ NHƯNG prepend new ancestor chain.
 *
 * Port từ trusted updateDescendantParents (issues-move.ts:161-188).
 */
export async function updateDescendantParents(
  client: HulyClient,
  spaceId: string,
  parentIssue: IssueHierarchyFields,
  parentNewParents: IssueParentInfo[],
): Promise<void> {
  const thisParentInfo: IssueParentInfo = {
    parentId: parentIssue._id,
    identifier: parentIssue.identifier ?? "",
    parentTitle: parentIssue.title ?? "",
    space: spaceId,
  };
  const children = (await client.findAll(ISSUE_CLASS, {
    attachedTo: parentIssue._id,
    space: spaceId,
  } as never)) as IssueHierarchyFields[];
  for (const child of children) {
    const childNewParents = [...parentNewParents, thisParentInfo];
    await client.updateDoc(
      ISSUE_CLASS,
      spaceId as never,
      child._id as never,
      { parents: childNewParents } as never,
    );
    if ((child.subIssues ?? 0) > 0) {
      await updateDescendantParents(client, spaceId, child, childNewParents);
    }
  }
}
