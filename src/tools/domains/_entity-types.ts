// Native entity interfaces cho Huly docs (T-90).
//
// Pi-huly KHÔNG bundle @hcengineering type defs (ambient minimal surface only).
// Client methods `findOne<T extends Doc>`/`findAll<T extends Doc>` đã generic —
// truyền explicit type param (`findOne<TeamspaceDoc>(...)`) cho result typed,
// KHÔNG cần inline `as { field?: ... }` narrowing hay `as never` dư thừa.
//
// Base `Doc` (ambient @hcengineering/core): { _id, space, modifiedOn, modifiedBy }.
// Mọi interface extend Doc + optional fields theo field thật truy cập (Huly docs
// trả full payload; optional vì một số field có thể vắng runtime).

import type { Doc } from "@hcengineering/core";

// === tracker ===
export interface IssueDoc extends Doc {
  identifier?: string;
  title?: string;
  status?: string;
  assignee?: string | null;
  description?: unknown;
  labels?: unknown[];
  parentIssue?: string | null;
  subIssues?: number;
  comments?: number;
  attachments?: number;
  blockedBy?: Array<{ _id?: string }>;
  relations?: Array<{ _id?: string }>;
}

export interface ComponentDoc extends Doc {
  label?: string;
  description?: string | null;
  lead?: string;
}

export interface IssueTemplateDoc extends Doc {
  title?: string;
  description?: unknown;
  priority?: string;
  assignee?: string | null;
  component?: string | null;
  estimation?: number;
  createdOn?: number;
  children?: unknown[];
}

// === task ===
export interface TaskTypeDoc extends Doc {
  parent?: string;
  name?: string;
  descriptor?: unknown;
  kind?: string;
  ofClass?: string;
  targetClass?: string;
  statusClass?: string;
  statusCategories?: unknown[];
  statuses?: string[];
  icon?: string;
  color?: unknown;
  allowedAsChildOf?: unknown;
}

export interface ProjectTypeDoc extends Doc {
  name?: string;
  targetClass?: string;
  tasks?: string[];
  statuses?: Array<{ _id?: string; taskType?: string }>;
}

export interface StatusDoc extends Doc {
  name?: string;
  category?: string;
  ofAttribute?: string;
}

// === document ===
export interface TeamspaceDoc extends Doc {
  name?: string;
  description?: string | null;
  private?: boolean;
  archived?: boolean;
  members?: string[];
  owners?: string[];
}

export interface DocumentDoc extends Doc {
  title?: string;
  content?: unknown;
  createdOn?: number;
}

export interface DocumentSnapshotDoc extends Doc {
  attachedTo?: string;
  title?: string;
  parent?: string;
  content?: unknown;
  createdOn?: number;
}

// === contact ===
export interface PersonDoc extends Doc {
  name?: string;
}

// === core ===
export interface MixinDoc extends Doc {
  extends?: string;
  kind?: number;
  label?: string;
  icon?: string;
}

// === tags ===
export interface TagElementDoc extends Doc {
  title?: string;
  color?: number | string;
  targetClass?: string;
}

export interface TagReferenceDoc extends Doc {
  tag?: string;
  title?: string;
  color?: number;
  attachedTo?: string;
  attachedToClass?: string;
  collection?: string;
}
