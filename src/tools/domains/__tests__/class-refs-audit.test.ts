// T-44 audit — verify class refs match Huly registry truth từ npm tarball source
// map extraction (docs/design/11-runtime-audit.md).
//
// KHÔNG runtime server — pure static verification: class refs trong _class-refs.ts
// phải match format/pattern Huly generate server-side (audit đã verify).
//
// Regression catch: nếu maintainer đổi class ref string mà không qua audit,
// test fail. Chứ KHÔNG verify server-side "domain found" (cần runtime).

import { describe, expect, it } from "vitest";
import {
  PERSON_CLASS,
  EMPLOYEE_CLASS,
  CONTACT_CLASS,
  ISSUE_CLASS,
  MILESTONE_CLASS,
  COMPONENT_CLASS,
  PROJECT_CLASS,
  TASK_TYPE_CLASS,
  ISSUE_STATUS_CLASS,
  ISSUE_TEMPLATE_CLASS,
  PROJECT_TYPE_CLASS,
  DOCUMENT_CLASS,
  DOCUMENT_SNAPSHOT_CLASS,
  SPACE_CLASS,
  CHAT_MESSAGE_CLASS,
  ATTACHMENT_CLASS,
  TAG_CLASS,
  TAG_CATEGORY_CLASS,
  LABEL_CLASS,
  TIME_SPEND_REPORT_CLASS,
  TS_RELATION_CLASS,
  TODO_CLASS,
} from "../_class-refs.js";

/**
 * Class ref format: `<plugin>:class:<ClassName>` (string runtime, branded type
 * compile-time bypass). Extract raw string qua cast.
 */
function raw(ref: unknown): string {
  return ref as string;
}

describe("T-44 §1 class registry truth (audit 11-runtime-audit.md)", () => {
  describe("class refs verified KEEP (STRONG/MEDIUM evidence)", () => {
    it("contact package — Person/Contact classes (NOT Employee — Employee is mixin)", () => {
      expect(raw(PERSON_CLASS)).toBe("contact:class:Person");
      expect(raw(CONTACT_CLASS)).toBe("contact:class:Contact");
      // Employee = mixin, NOT class — see T-43 fix
    });

    it("tracker package — Issue/Milestone/Component/Project/IssueStatus/IssueTemplate", () => {
      expect(raw(ISSUE_CLASS)).toBe("tracker:class:Issue");
      expect(raw(MILESTONE_CLASS)).toBe("tracker:class:Milestone");
      expect(raw(COMPONENT_CLASS)).toBe("tracker:class:Component");
      expect(raw(PROJECT_CLASS)).toBe("tracker:class:Project");
      expect(raw(ISSUE_STATUS_CLASS)).toBe("tracker:class:IssueStatus");
      expect(raw(ISSUE_TEMPLATE_CLASS)).toBe("tracker:class:IssueTemplate");
    });

    it("chunter — ChatMessage", () => {
      expect(raw(CHAT_MESSAGE_CLASS)).toBe("chunter:class:ChatMessage");
    });

    it("attachment — Attachment", () => {
      expect(raw(ATTACHMENT_CLASS)).toBe("attachment:class:Attachment");
    });

    it("tags — TagCategory (NOT Tag — Tag → TagElement)", () => {
      expect(raw(TAG_CATEGORY_CLASS)).toBe("tags:class:TagCategory");
    });
  });

  describe("class refs FIXED (T-43 — verified from audit 11-runtime-audit.md)", () => {
    // T-43 (2026-07-27): fixed per audit findings.
    // Verify each ref matches source map truth from @hcengineering/*@0.7.423.

    it("Employee: class → mixin (contact:mixin:Employee)", () => {
      expect(raw(EMPLOYEE_CLASS)).toBe("contact:mixin:Employee");
    });

    it("TaskType + ProjectType: tracker → task pkg (cross-package imports)", () => {
      expect(raw(TASK_TYPE_CLASS)).toBe("task:class:TaskType");
      expect(raw(PROJECT_TYPE_CLASS)).toBe("task:class:ProjectType");
    });

    it("Document: document → tracker pkg (Document define trong tracker source)", () => {
      expect(raw(DOCUMENT_CLASS)).toBe("tracker:class:Document");
    });

    it("Space: document → core pkg (base abstract class)", () => {
      expect(raw(SPACE_CLASS)).toBe("core:class:Space");
    });

    it("Tag: Tag → TagElement (entity rename)", () => {
      expect(raw(TAG_CLASS)).toBe("tags:class:TagElement");
    });

    it("TimeSpendReport: activity → tracker (interface define trong tracker source)", () => {
      expect(raw(TIME_SPEND_REPORT_CLASS)).toBe("tracker:class:TimeSpendReport");
    });

    it("TODO_CLASS: task:Todo → time:ToDo (cross-pkg time + chữ viết hoa D)", () => {
      expect(raw(TODO_CLASS)).toBe("time:class:ToDo");
    });
  });

  describe("UNVERIFIED (audit §7 — cần runtime server hoặc audit sâu hơn)", () => {
    it("LABEL_CLASS giữ view:class:Label (chưa tìm thấy trong audited packages)", () => {
      expect(raw(LABEL_CLASS)).toBe("view:class:Label");
    });

    it("TS_RELATION_CLASS giữ core:class:TsRelation (Issue relations có thể stored inline)", () => {
      expect(raw(TS_RELATION_CLASS)).toBe("core:class:TsRelation");
    });

    it("DOCUMENT_SNAPSHOT_CLASS giữ document:class:DocumentSnapshot (chưa confirm)", () => {
      expect(raw(DOCUMENT_SNAPSHOT_CLASS)).toBe("document:class:DocumentSnapshot");
    });
  });

  describe("format validation — every class ref follows Huly pattern", () => {
    const allRefs = [
      PERSON_CLASS,
      EMPLOYEE_CLASS,
      CONTACT_CLASS,
      ISSUE_CLASS,
      MILESTONE_CLASS,
      COMPONENT_CLASS,
      PROJECT_CLASS,
      TASK_TYPE_CLASS,
      ISSUE_STATUS_CLASS,
      ISSUE_TEMPLATE_CLASS,
      PROJECT_TYPE_CLASS,
      DOCUMENT_CLASS,
      DOCUMENT_SNAPSHOT_CLASS,
      SPACE_CLASS,
      CHAT_MESSAGE_CLASS,
      ATTACHMENT_CLASS,
      TAG_CLASS,
      TAG_CATEGORY_CLASS,
      LABEL_CLASS,
      TIME_SPEND_REPORT_CLASS,
      TS_RELATION_CLASS,
      TODO_CLASS,
    ];

    it("mọi class ref match pattern <plugin>:class:<Name> hoặc <plugin>:mixin:<Name>", () => {
      for (const ref of allRefs) {
        const s = raw(ref);
        expect(s).toMatch(/^[a-z]+:(class|mixin):[A-Za-z]+$/);
      }
    });
  });
});
