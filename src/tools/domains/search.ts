// tools/domains/search.ts — Search domain (1 tool, global).
// Design: 06-api.md §4 Search.
//
// T-42 fix (#24): expand query across 3 domains (Issue title, Document title,
// ChatMessage content) thay vì chỉ Issue.title. $like là client-side regex
// predicate (audit §3 — % → .*, case-insensitive, anchored). Server có thể
// KHÔNG support $like → catch + honest error (KHÔNG fake "Found 0").
//
// Honest capability: substring search trên title/content fields (KHÔNG fulltext
// index server-side). Huly KHÔNG expose dedicated fulltext search endpoint
// trong api-client (audit §3 verified).

import { Type } from "typebox";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { workspaceParam, limitParam, escapeLikePattern } from "./_common.js";
import { ISSUE_CLASS, DOCUMENT_CLASS, CHAT_MESSAGE_CLASS } from "./_class-refs.js";

/** Kết quả search từ 1 domain, tag type cho LLM phân biệt. */
interface SearchResult {
  _id: string;
  type: "issue" | "document" | "message";
  identifier?: string;
  title?: string;
  preview?: string;
}

/**
 * Query 1 domain với $like substring, return tagged results.
 * Throw nếu server reject $like (caller catch → honest error).
 */
async function searchDomain(
  client: Parameters<Parameters<typeof defineHulyTool>[0]["handler"]>[1]["client"],
  _class: string,
  field: string,
  query: string,
  limit: number,
  type: SearchResult["type"],
): Promise<SearchResult[]> {
  const docs = await client.findAll(
    _class as never,
    { [field]: { $like: `%${query}%` } } as never,
    {
      limit,
    },
  );
  return (docs as unknown as Array<Record<string, unknown>>).map((d) => ({
    _id: String(d._id ?? ""),
    type,
    identifier: d.identifier !== undefined ? String(d.identifier) : undefined,
    title: d.title !== undefined ? String(d.title) : undefined,
    preview:
      d.content !== undefined
        ? String(d.content).slice(0, 120)
        : d.title !== undefined
          ? String(d.title).slice(0, 120)
          : undefined,
  }));
}

export const tools: HulyToolDefinition[] = [
  // 1. fulltext_search — global (KHÔNG project-scoped)
  defineHulyTool({
    name: "fulltext_search",
    label: "Fulltext search",
    description:
      "Substring search across Huly workspace: issue titles, document titles, message content. " +
      "Uses $like pattern (case-insensitive substring). NOT a fulltext index — complex queries " +
      "may miss partial matches. Global across workspace.",
    promptSnippet: "Search Huly issues, documents, messages by substring.",
    parameters: Type.Object({
      workspace: workspaceParam,
      query: Type.String({ description: "Search query (substring, case-insensitive)." }),
      limit: limitParam,
    }),
    async handler(params, tctx) {
      const limit = typeof params.limit === "number" ? params.limit : 50;
      // Escape wildcards (% _ \) tránh injection / unintended pattern.
      const query = escapeLikePattern(params.query);

      // T-42 #24: expand query across 3 domains. $like client-side predicate
      // (audit §3). Server có thể reject → catch + honest error.
      try {
        const [issues, documents, messages] = await Promise.all([
          searchDomain(tctx.client, ISSUE_CLASS, "title", query, limit, "issue"),
          searchDomain(tctx.client, DOCUMENT_CLASS, "title", query, limit, "document"),
          searchDomain(tctx.client, CHAT_MESSAGE_CLASS, "content", query, limit, "message"),
        ]);
        const results = [...issues, ...documents, ...messages];
        return {
          content:
            `Found ${results.length} result(s) for "${params.query}" ` +
            `(${issues.length} issues, ${documents.length} documents, ${messages.length} messages).`,
          details: { count: results.length, query: params.query, results },
        };
      } catch (e) {
        // Server reject $like (vd platform:status:BadRequest) HOẶC network fail.
        // Honest error — KHÔNG fake "Found 0 results" (LLM sẽ tưởng không có data).
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content:
            `Search failed: ${msg}. Huly may not support $like on this field, ` +
            `or query too complex. Try simpler query or use list_issues with titleSearch.`,
          isError: true,
          details: { query: params.query, error: msg },
        };
      }
    },
  }),
];
