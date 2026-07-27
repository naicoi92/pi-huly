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
      // Simplified cascade preview: count related comments + attachments
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
      const cascade = {
        entity: entity._id,
        comments: comments.length,
        attachments: attachments.length,
        total: comments.length + attachments.length + 1,
      };
      return {
        content: `Deletion preview for ${params.identifier}: ${cascade.total} item(s) will be removed (1 entity + ${cascade.comments} comments + ${cascade.attachments} attachments).`,
        details: { cascade },
      };
    },
  }),
];
