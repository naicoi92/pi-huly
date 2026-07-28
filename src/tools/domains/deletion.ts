// tools/domains/deletion.ts — Deletion preview domain (1 tool).
// Design: 06-api.md §4 Deletion. Preview cascade trước khi delete.

import { Type } from "typebox";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { workspaceParam, projectParam, identifierParam, resolveIdentifier } from "./_common.js";
import { ISSUE_CLASS } from "./_class-refs.js";

export const tools: HulyToolDefinition[] = [
  // 1. preview_deletion — cascade preview
  defineHulyTool({
    name: "preview_deletion",
    label: "Preview deletion",
    description:
      "Preview cascade deletion của entity (issues, comments, attachments affected). KHÔNG xóa — preview only.",
    needsProject: true,
    parameters: Type.Object({
      workspace: workspaceParam,
      project: projectParam,
      identifier: identifierParam,
      _class: Type.Optional(
        Type.String({ description: "Entity _class (default: tracker:class:Issue)." }),
      ),
    }),
    async handler(params, tctx) {
      const cls = (params._class ?? ISSUE_CLASS) as never;
      const entity = await tctx.client.findOne(cls, {
        identifier: resolveIdentifier(tctx.project!, params.identifier),
      });
      if (!entity) {
        return {
          content: `Entity "${params.identifier}" not found.`,
          isError: true,
          details: { identifier: params.identifier },
        };
      }
      // T-77: cascade preview — count comments + attachments + subIssues +
      // reverse-blocks + inline blockedBy/relations (before chỉ comments+attachments).
      const comments = await tctx.client.findAll(
        "chunter:class:ChatMessage" as never,
        { attachedTo: entity._id },
        {},
      );
      const attachments = await tctx.client.findAll(
        "attachment:class:Attachment" as never,
        { attachedTo: entity._id },
        {},
      );
      // subIssues: direct child issues (AttachedDoc attachedTo=entity).
      const subIssues = await tctx.client.findAll(
        ISSUE_CLASS,
        { attachedTo: entity._id } as never,
        {},
      );
      // Reverse blocks: issues whose blockedBy references this entity.
      const reverseBlocks = await tctx.client.findAll(
        ISSUE_CLASS,
        { "blockedBy._id": entity._id } as never,
        {},
      );
      // Inline arrays trên Issue (RelatedDocument[]).
      const issueFields = entity as {
        blockedBy?: Array<{ _id?: string }>;
        relations?: Array<{ _id?: string }>;
      };
      const blockedByCount = issueFields.blockedBy?.length ?? 0;
      const relationsCount = issueFields.relations?.length ?? 0;
      const cascade = {
        entity: entity._id,
        comments: comments.length,
        attachments: attachments.length,
        subIssues: subIssues.length,
        blockedBy: blockedByCount,
        relations: relationsCount,
        reverseBlocks: reverseBlocks.length,
        total: 1 + comments.length + attachments.length + subIssues.length + reverseBlocks.length,
      };
      const warnings: string[] = [];
      if (subIssues.length > 0) warnings.push(`${subIssues.length} sub-issue(s) orphaned`);
      if (reverseBlocks.length > 0)
        warnings.push(`${reverseBlocks.length} issue(s) lose a block reference`);
      if (blockedByCount > 0) warnings.push(`${blockedByCount} blockedBy reference(s) dropped`);
      if (relationsCount > 0) warnings.push(`${relationsCount} relation(s) dropped`);
      const warnText = warnings.length > 0 ? ` Warnings: ${warnings.join("; ")}.` : "";
      return {
        content: `Deletion preview for ${params.identifier}: ${cascade.total} item(s) affected (1 entity + ${cascade.comments} comments + ${cascade.attachments} attachments + ${cascade.subIssues} sub-issues + ${cascade.reverseBlocks} reverse-blocks).${warnText}`,
        details: { cascade, warnings: warnings.length > 0 ? warnings : undefined },
      };
    },
  }),
];
