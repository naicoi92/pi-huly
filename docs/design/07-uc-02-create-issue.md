# UC-02: create_issue composite (huly-tasks createTask)

> Bước 7/10. Size L — multi-call orchestration: create + setMilestone +
> setComponent + addLabel(s) + assignee auto-resolve + relation. Partial-failure
> risk. Trace [06](./06-api.md), huly-tasks skill.

## Overview

Agent tạo task đầy đủ (project-design Bước 9): create issue → gán milestone +
component + labels + assignee (auto) + relation. Trigger: bulk issue creation,
task setup. Outcome: issue fully configured.

## Actors & Systems

| Actor/System | Vai trò |
|---|---|
| Agent | orchestrate multi-call |
| huly_create_issue / set_issue_milestone / set_issue_component / add_issue_label / add_issue_relation | tool calls |
| AssigneeResolver | resolveAssignee (D15) |
| HulyClient | CRUD |

## Sequence (happy path)

```mermaid
sequenceDiagram
    participant A as Agent
    participant T as huly_* tools
    participant R as AssigneeResolver
    participant C as HulyClient
    participant H as Huly
    A->>T: create_issue({project, title, desc, assignee?})
    T->>R: resolveAssignee(ws, assignee?)
    alt assignee absent
        R->>C: getCurrentUser()
        R-->>T: email (default, D15)
    end
    T->>C: createIssue(...)
    C->>H: createDoc(tracker.Issue)
    H-->>C: identifier "PD-7"
    C-->>T: {identifier}
    T-->>A: "Created PD-7"
    A->>T: set_issue_milestone({identifier, milestone})
    T->>C: setIssueMilestone
    C-->>T: ok
    A->>T: set_issue_component + add_issue_label*(N)
    T->>C: setIssueComponent / addIssueLabel
    C-->>T: ok (each)
    opt blocked-by
        A->>T: add_issue_relation({identifier, target, "is-blocked-by"})
        T->>C: addIssueRelation
        C-->>T: ok
    end
```

## Error Path

- **create fails** (Auth/Connection) → no partial state; create **non-idempotent**
  (KHÔNG retry, tránh dup) → abort, agent decides.
- **create OK but setMilestone/setComponent/addLabel fails** → **partial state**
  (issue created, field unset). Agent thấy error → retry set_*/add_label
  (idempotent, retry OK).
- **assignee not found** → ValidationError **trước** create (resolve early,
  fail-fast) — KHÔNG tạo issue rồih mới phát hiện.

## Notes

- create non-idempotent (no retry) · set_*/add_label/add_relation idempotent
  (retry OK).
- assignee resolve EARLY (before create) → fail-fast.
- agent tự orchestrate multi-call (pi-huly KHÔNG batch — 1 tool = 1 op, FR-04
  full CRUD granularity). Lý do: mỗi op distinct error/retry semantics.
