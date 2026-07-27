// AssigneeResolver — auto-resolve currentUser cho default assignee (D15 FR-18).
// Design: 04-system.md §6 assignee.ts, 01 §B.15 D15.
//
// Resolution:
//   input given → validate (email hoặc name) + lookup nếu cần
//   input absent → default getCurrentUser().email (single source = Huly, KHÔNG store trong credentials)

import type { HulyClient } from "./client.js";

/** Assignee reference cho assignee field. */
export interface AssigneeRef {
  /** Person _id hoặc email (caller decide format per Huly API). */
  identifier: string;
  /** Display name (KHÔNG store trong credentials — fetched từ Huly). */
  name?: string;
  /** True nếu resolve từ getCurrentUser default (KHÔNG explicit user input). */
  resolved: boolean;
}

/**
 * Resolve assignee identifier.
 * - input given → use as-is (caller validate + lookup list_employees nếu cần)
 * - input absent → default getCurrentUser email (D15 FR-18)
 *
 * @param client HulyClient (cho getCurrentUser fallback)
 * @param input Optional user-provided assignee (email hoặc person name)
 */
export async function resolveAssignee(client: HulyClient, input?: string): Promise<AssigneeRef> {
  if (input !== undefined && input.length > 0) {
    return {
      identifier: input,
      resolved: false,
    };
  }
  // Absent → default currentUser
  const user = await client.getCurrentUser();
  return {
    identifier: user.email,
    name: user.name,
    resolved: true,
  };
}
