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
      "Substring search across Huly workspace: issue titles, document titles (if available), " +
      "message content. Uses $like pattern (case-insensitive substring). NOT a fulltext index — " +
      "complex queries may miss partial matches. Some domains may be unavailable — results " +
      "show which succeeded. Global across workspace.",
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

      // T-49 #38: Promise.allSettled thay Promise.all — 1 domain fail (vd
      // Document class sai runtime "domain not found") không kéo cả search fail.
      // Filter fulfilled → partial result; collect rejected → warning log.
      // Promise.allSettled KHÔNG throw (per-domain reject thành status value),
      // nên outer catch chỉ còn safety net cho unexpected programming errors
      // (vd .map throw trên doc shape bất thường, sync bug) — KHÔNG domain error.
      const domainConfigs: Array<{
        name: string;
        type: SearchResult["type"];
        _class: string;
        field: string;
      }> = [
        { name: "issues", type: "issue", _class: ISSUE_CLASS, field: "title" },
        { name: "documents", type: "document", _class: DOCUMENT_CLASS, field: "title" },
        { name: "messages", type: "message", _class: CHAT_MESSAGE_CLASS, field: "content" },
      ];

      try {
        const settled = await Promise.allSettled(
          domainConfigs.map((cfg) =>
            searchDomain(tctx.client, cfg._class, cfg.field, query, limit, cfg.type),
          ),
        );

        const results: SearchResult[] = [];
        const counts: Record<string, number> = {};
        const failedDomains: Array<{ name: string; reason: string }> = [];

        settled.forEach((s, idx) => {
          const cfg = domainConfigs[idx];
          if (s.status === "fulfilled") {
            results.push(...s.value);
            counts[cfg.name] = s.value.length;
          } else {
            // Non-Error rejection (string/number/object) → String() fallback
            const reason = s.reason instanceof Error ? s.reason.message : String(s.reason);
            failedDomains.push({ name: cfg.name, reason });
            counts[cfg.name] = 0;
          }
        });

        // All domains failed → isError (KHÔNG fake "Found 0 results").
        if (results.length === 0 && failedDomains.length === domainConfigs.length) {
          const reasons = failedDomains.map((d) => `${d.name}: ${d.reason}`).join("; ");
          return {
            content: `All search domains failed: ${reasons}.`,
            isError: true,
            details: { query: params.query, failedDomains },
          };
        }

        // Build content: partial result + warning nếu có domain fail.
        const countSummary = domainConfigs
          .map((cfg) => `${counts[cfg.name] ?? 0} ${cfg.name}`)
          .join(", ");
        let content = `Found ${results.length} result(s) for "${params.query}" (${countSummary}).`;
        if (failedDomains.length > 0) {
          // 1 dòng per failed domain, truncate reason tránh phình content.
          const warnings = failedDomains
            .map((d) => `${d.name} search failed: ${d.reason.slice(0, 100)}`)
            .join(" | ");
          content += ` Warning: ${warnings}.`;
        }

        return {
          content,
          details: {
            count: results.length,
            query: params.query,
            results,
            failedDomains: failedDomains.length > 0 ? failedDomains : undefined,
          },
        };
      } catch (e) {
        // Safety net cho unexpected programming errors (vd .map throw trên
        // doc shape bất thường, sync bug). KHÔNG catch domain error (đã settle).
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: `Search failed unexpectedly: ${msg}.`,
          isError: true,
          details: { query: params.query, error: msg },
        };
      }
    },
  }),
];
