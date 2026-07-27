// Huly _class refs — string literal cast `as never` (branded Ref<T> bypass).
// Centralized ở đây để domain modules KHÔNG lặp pattern, dễ search/audit.
// Runtime: Huly packages có đầy đủ tracker/contact/document/..., pi-huly chỉ
// dùng string literal (packages KHÔNG trong bundle, only runtime).

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

// === Domain class refs (verified từ Huly source) ===

// contact (Persons/Employees)
export const PERSON_CLASS = classRef("contact:class:Person");
export const EMPLOYEE_CLASS = classRef("contact:class:Employee");
export const CONTACT_CLASS = classRef("contact:class:Contact");

// tracker (Issues/Milestones/Components/Projects/TaskTypes)
export const ISSUE_CLASS = classRef("tracker:class:Issue");
export const MILESTONE_CLASS = classRef("tracker:class:Milestone");
export const COMPONENT_CLASS = classRef("tracker:class:Component");
export const PROJECT_CLASS = classRef("tracker:class:Project");
export const TASK_TYPE_CLASS = classRef("tracker:class:TaskType");
export const ISSUE_STATUS_CLASS = classRef("tracker:class:IssueStatus");
export const ISSUE_TEMPLATE_CLASS = classRef("tracker:class:IssueTemplate");
export const PROJECT_TYPE_CLASS = classRef("tracker:class:ProjectType");

// document (Documents/Teamspaces)
export const DOCUMENT_CLASS = classRef("document:class:Document");
export const DOCUMENT_SNAPSHOT_CLASS = classRef("document:class:DocumentSnapshot");
export const SPACE_CLASS = classRef("document:class:Space");

// chunter (Comments = ChatMessage)
export const CHAT_MESSAGE_CLASS = classRef("chunter:class:ChatMessage");

// attachment (Attachments)
export const ATTACHMENT_CLASS = classRef("attachment:class:Attachment");

// tags (Tags/TagCategories)
export const TAG_CLASS = classRef("tags:class:Tag");
export const TAG_CATEGORY_CLASS = classRef("tags:class:TagCategory");

// view (Labels — GLOBAL namespace)
export const LABEL_CLASS = classRef("view:class:Label");

// activity (TimeSpendReport cho log_time)
export const TIME_SPEND_REPORT_CLASS = classRef("activity:class:TimeSpendReport");

// core (Relation cho issue relations + doc links)
export const TS_RELATION_CLASS = classRef("core:class:TsRelation");
