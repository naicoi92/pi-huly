// Huly _class refs — string literal cast `as never` (branded Ref<T> bypass).
// Centralized ở đây để domain modules KHÔNG lặp pattern, dễ search/audit.
// Runtime: Huly packages có đầy đủ tracker/contact/document/..., pi-huly chỉ
// dùng string literal (packages KHÔNG trong bundle, only runtime).
//
// T-43 fix (2026-07-27): re-verified class refs từ @hcengineering/*@0.7.423
// source map (npm tarball extraction). Source of truth:
// docs/design/11-runtime-audit.md. 6+ class broken root cause từng loại riêng
// (mixin vs class / cross-package import / rename / base abstract).
//
// T-58 fix (2026-07-28): DEEP-AUDIT 12 packages @0.7.423 — verify plugin()
// class block registration (KHÔNG chỉ interface existence). Key findings:
//   - Document interface exists trong tracker source NHƯNG KHÔNG register class
//     → `tracker:class:Document` runtime fail (interface orphan). Document search
//     marked honest-unavailable (T-60).
//   - Label: 0 match toàn packages → deprecated (Huly dùng TagElement).
//   - TsRelation: 0 match → Issue.relations inline RelatedDocument[] (T-59
//     refactor $push/$pull inline, xóa TS_RELATION_CLASS dead code).
//   - DocumentSnapshot: 0 match → deprecated (T-58 honest-unavailable).
//   - Space base abstract → Teamspace = drive:class:Drive (T-54).

/**
 * Cast plain string thành Huly _class Ref (branded type bypass).
 * Runtime: string. Compile-time: Ref<T> (KHÔNG break generic constraint).
 */
export function classRef(ref: string): never {
  return ref as never;
}

/** Cast plain string thành Huly _id Ref (branded type bypass). */
export function idRef(id: string): never {
  return id as never;
}

/** Cast plain string thành Huly space Ref. */
export function spaceRef(space: string): never {
  return space as never;
}

// === Domain class refs (verified từ @hcengineering/*@0.7.423 source map, 2026-07-27) ===

// contact (Persons + Employee mixin)
// Person/Contact = class. Employee = mixin (KHÔNG phải class — runtime lookup
// khác → "domain not found" nếu query như class).
export const PERSON_CLASS = classRef("contact:class:Person");
export const EMPLOYEE_CLASS = classRef("contact:mixin:Employee"); // T-43: class → mixin
export const CONTACT_CLASS = classRef("contact:class:Contact");

// tracker (Issues/Milestones/Components/Projects — extends Task)
// Issue/Milestone/Component/Project/IssueStatus/IssueTemplate/TimeSpendReport
// define trong tracker package source (extends Task từ task package).
export const ISSUE_CLASS = classRef("tracker:class:Issue");
export const MILESTONE_CLASS = classRef("tracker:class:Milestone");
export const COMPONENT_CLASS = classRef("tracker:class:Component");
export const PROJECT_CLASS = classRef("tracker:class:Project");
export const ISSUE_STATUS_CLASS = classRef("tracker:class:IssueStatus");
export const ISSUE_TEMPLATE_CLASS = classRef("tracker:class:IssueTemplate");
export const TIME_SPEND_REPORT_CLASS = classRef("tracker:class:TimeSpendReport"); // T-43: activity → tracker (verify runtime)

// task (Task/TaskType/ProjectType — generic task model, tracker extends)
// TaskType/ProjectType defined trong @hcengineering/task, import vào tracker.
// Pi-huly đoán tracker pkg → sai domain.
export const TASK_TYPE_CLASS = classRef("task:class:TaskType"); // T-43: tracker → task
export const PROJECT_TYPE_CLASS = classRef("task:class:ProjectType"); // T-43: tracker → task

// Document — T-58 DEEP-AUDIT (2026-07-28): interface exists trong tracker source
// (src/index.ts:338 `interface Document extends Doc`) NHƯNG KHÔNG register trong
// plugin() class block (chỉ Project/Issue/IssueTemplate/Component/IssueStatus/
// Milestone/TimeSpendReport). → `tracker:class:Document` runtime fail "domain
// not found" (interface orphan — #55 report 2 lần). Document search marked
// honest-unavailable (T-60) cho đến khi Huly register class hoặc pi-huly switch
// sang class thật (candidates: chunter:class:Doc — cần verify).
export const DOCUMENT_CLASS = classRef("tracker:class:Document");
// T-58 DEEP-AUDIT: DocumentSnapshot KHÔNG tồn tại trong 12 packages audited
// (0 match interface + class). Deprecated — tool marked honest-unavailable.
export const DOCUMENT_SNAPSHOT_CLASS = classRef("document:class:DocumentSnapshot");

// Space — base abstract class trong @hcengineering/core (KHÔNG phải document).
// T-54 reality-checker (2026-07-28) STRONG confirm: `core:class:Space` là base
// class KHÔNG có SpaceTypeDescriptor → KHÔNG thể instantiate trực tiếp cho user
// space (UI vô hình, không permission model). User spaces phải đi qua TypedSpace
// subclass (tracker:class:Project / drive:class:Drive / chunter:class:ChunterSpace).
// KHÔNG có class "Teamspace" runtime — đây là UI label only.
//
// READ-ONLY SAFE: findAll/findOne trên SPACE_CLASS trả subclasses qua inheritance
// (list_teamspaces/get_teamspace OK). CREATE dùng DRIVE_CLASS (Documents space).
export const SPACE_CLASS = classRef("core:class:Space"); // T-43: document → core
// T-54: drive:class:Drive = Documents/Files Teamspace thật (extends TypedSpace,
// có SpaceTypeDescriptor). Register trong drive plugin() class block line 31.
export const DRIVE_CLASS = classRef("drive:class:Drive");

// chunter (Comments = ChatMessage)
export const CHAT_MESSAGE_CLASS = classRef("chunter:class:ChatMessage");

// attachment (Attachments)
export const ATTACHMENT_CLASS = classRef("attachment:class:Attachment");

// tags (TagElement = entity thật, NOT "Tag")
// Huly thiết kế: TagElement = tag entity, TagReference = ref trong doc, TagCategory = group.
export const TAG_CLASS = classRef("tags:class:TagElement"); // T-43: Tag → TagElement
export const TAG_CATEGORY_CLASS = classRef("tags:class:TagCategory");

// view — T-58 DEEP-AUDIT: Label KHÔNG tồn tại trong 12 packages (0 match).
// Deprecated — Huly dùng TagElement (tags:class:TagElement) cho tag/label entity.
// Labels tools refactor dùng TAG_CLASS (T-45 pattern đã verify).
export const LABEL_CLASS = classRef("view:class:Label");

// time (ToDo — chữ viết hoa D, NOT "Todo")
// ToDo extends AttachedDoc, define trong @hcengineering/time (KHÔNG phải task).
export const TODO_CLASS = classRef("time:class:ToDo"); // T-43: task:Todo → time:ToDo

// T-59 (2026-07-28): TS_RELATION_CLASS XÓA — Issue relations KHÔNG phải class
// riêng. Issue.relations?: RelatedDocument[] + Issue.blockedBy?: RelatedDocument[]
// inline (RelatedDocument = Pick<Doc, '_id' | '_class'>). add/remove/list dùng
// $push/$pull trực tiếp trên Issue, KHÔNG addCollection.
