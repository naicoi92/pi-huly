// tools/domains/search.ts — Search domain (1 tool, global).
// Design: 06-api.md §4 Search. Fulltext global (issues+docs+messages).

import { Type } from "typebox";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { workspaceParam, limitParam, escapeLikePattern } from "./_common.js";

export const tools: HulyToolDefinition[] = [
  // 1. fulltext_search — global (KHÔNG project-scoped)
  defineHulyTool({
    name: "fulltext_search",
    label: "Fulltext search",
    description: "Fulltext search across Huly workspace (issues, documents, messages). Global.",
    promptSnippet: "Search Huly content (issues, documents, messages).",
    parameters: Type.Object({
      workspace: workspaceParam,
      query: Type.String({ description: "Search query." }),
      limit: limitParam,
    }),
    async handler(params, tctx) {
      // Huly search API: client.findOne/findAll không support fulltext trực tiếp.
      // Real implementation dùng dedicated search endpoint (api-client export).
      // Simplified: query title/description substring cho issues.
      // TODO: replace bằng real search API khi Huly expose.
      const limit = typeof params.limit === "number" ? params.limit : 50;
      const issues = await tctx.client.findAll(
        "tracker:class:Issue" as never,
        { title: { $like: `%${escapeLikePattern(params.query)}%` } },
        { limit },
      );
      const list = issues.map((i) => ({
        _id: i._id,
        identifier: (i as { identifier?: string }).identifier ?? "",
        title: (i as { title?: string }).title ?? "",
      }));
      return {
        content: `Found ${list.length} result(s) for "${params.query}".`,
        details: { count: list.length, query: params.query, results: list },
      };
    },
  }),
];
