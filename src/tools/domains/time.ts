// tools/domains/time.ts — Time log domain (1 tool).
// Design: 06-api.md §4 Time. log_time minutes.

import { Type } from "typebox";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { TIME_SPEND_REPORT_CLASS, ISSUE_CLASS } from "./_class-refs.js";
import { workspaceParam, projectParam, identifierParam, resolveIdentifier } from "./_common.js";

export const tools: HulyToolDefinition[] = [
  // 1. log_time — value = minutes
  defineHulyTool({
    name: "log_time",
    label: "Log time",
    description: "Log time on issue (value = minutes). User implicit = current.",
    promptSnippet: "Log time spent on a Huly issue.",
    needsProject: true,
    needsAssignee: true,
    assigneeField: "user",
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      identifier: identifierParam,
      value: Type.Integer({ description: "Time in minutes.", minimum: 1 }),
      description: Type.Optional(Type.String()),
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
      await tctx.client.addCollection(
        TIME_SPEND_REPORT_CLASS,
        issue.space as never,
        issue._id as never,
        ISSUE_CLASS,
        "timetracking",
        {
          value: params.value,
          description: params.description,
        },
      );
      return {
        content: `Logged ${params.value} min on ${params.identifier}.`,
        details: { identifier: params.identifier, value: params.value },
      };
    },
  }),
];
