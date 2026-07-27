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

  describe("class refs needing FIX (audit findings — verify pending T-43)", () => {
    // NOTE: sau T-43 merge, các expect này sẽ đổi sang giá trị đúng.
    // Trước T-43: giữ audit snapshot hiện tại (broken state) để track change.

    it("audit SNAPSHOT pre-T-43: broken class refs documented", () => {
      // These are WRONG per audit — T-43 will fix.
      // Snapshot locked tại audit date 2026-07-27.
      expect(raw(EMPLOYEE_CLASS)).toBe("contact:class:Employee"); // → contact:mixin:Employee
      expect(raw(TASK_TYPE_CLASS)).toBe("tracker:class:TaskType"); // → task:class:TaskType
      expect(raw(PROJECT_TYPE_CLASS)).toBe("tracker:class:ProjectType"); // → task:class:ProjectType
      expect(raw(DOCUMENT_CLASS)).toBe("document:class:Document"); // → tracker:class:Document
      expect(raw(SPACE_CLASS)).toBe("document:class:Space"); // → core:class:Space
      expect(raw(TAG_CLASS)).toBe("tags:class:Tag"); // → tags:class:TagElement
      // NOTE: TODO_CLASS defined local trong todos.ts (KHÔNG trong _class-refs.ts)
      // hiện là "task:class:Todo" → "time:class:ToDo" sau T-46.
    });

    it("TimeSpendReport hiện ở activity pkg (audit cần verify — có thể tracker)", () => {
      // Audit §1: tracker source define TimeSpendReport interface, nhưng pi-huly
      // dùng activity pkg. Cần verify runtime — UNVERIFIED.
      expect(raw(TIME_SPEND_REPORT_CLASS)).toBe("activity:class:TimeSpendReport");
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
    ];

    it("mọi class ref match pattern <plugin>:class:<Name> hoặc <plugin>:mixin:<Name>", () => {
      for (const ref of allRefs) {
        const s = raw(ref);
        expect(s).toMatch(/^[a-z]+:(class|mixin):[A-Za-z]+$/);
      }
    });

    it("LABEL_CLASS + TS_RELATION_CLASS + DOCUMENT_SNAPSHOT_CLASS — UNVERIFIED (audit §7)", () => {
      // Audit §7: chưa tìm thấy class thật trong audited packages.
      // Cần runtime verify hoặc audit sâu hơn (T-43 implementation).
      // Snapshot hiện tại:
      expect(raw(LABEL_CLASS)).toBe("view:class:Label");
      expect(raw(TS_RELATION_CLASS)).toBe("core:class:TsRelation");
      expect(raw(DOCUMENT_SNAPSHOT_CLASS)).toBe("document:class:DocumentSnapshot");
    });
  });
});
