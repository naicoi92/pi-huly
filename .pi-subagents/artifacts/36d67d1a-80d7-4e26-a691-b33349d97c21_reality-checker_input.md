# Task for reality-checker

Audit T-65 deviation in pi-huly PR #87 (branch fix/T-65-document-class-ref, commit 817b34b).

CONTEXT: T-58 audit concluded `tracker:class:Document` is interface-orphan (interface exists in tracker source but NOT registered in tracker plugin() class block). Marked 7 tools honest-unavailable.

T-65 SUPERSPEDES: claims real class registered in `@hcengineering/document` plugin() block, class string = `document:class:Document`. Fix = change string literal in `src/tools/domains/_class-refs.ts` (NOT add dep + plugin loader as audit proposed).

YOUR BOUND (verify claim chính, KHÔNG deep-research):
1. Verify `/tmp/huly-mcp-trusted/src/huly/huly-plugins.ts` loads `@hcengineering/document` plugin.
2. Verify trusted uses `documentPlugin.class.Document` / `Teamspace` / `DocumentSnapshot` (grep src/).
3. Verify class string pattern: grep `document:class:Document|document:class:Teamspace|document:class:DocumentSnapshot` in trusted src + test.
4. CHECK: is string literal `classRef("document:class:Document")` equivalent runtime to `documentPlugin.class.Document`? (Both resolve to same branded string sent to server — YES if Ref is branded string).
5. CHECK pi-huly's claim that server-side Huly bundles document plugin (standard installation). Look for evidence.

DELIVERABLE: VERDICT (CONFIRM deviation OK / NEEDS WORK / BLOCKER) + evidence. Specifically answer: does T-65 string-literal fix unblock T-66 re-enable, or is dep+loader actually required?

## Acceptance Contract
Acceptance level: checked
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Implement the requested change without widening scope
- criterion-2: Return evidence sufficient for an independent acceptance review

Required evidence: changed-files, tests-added, commands-run, residual-risks, no-staged-files

Review gate: required by reviewer.

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
`criteriaSatisfied[].status` must be exactly one of: satisfied, not-satisfied, not-applicable.
`commandsRun[].result` must be exactly one of: passed, failed, not-run.
`manualNotes` and `notes` are optional strings; an empty string means no note and does not satisfy `manual-notes` evidence.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    },
    {
      "id": "criterion-2",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```