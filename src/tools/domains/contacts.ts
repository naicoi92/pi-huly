// tools/domains/contacts.ts — Contacts domain (2 tools, read-only).
// Design: 06-api.md §4 Contacts. List employees/persons cho assignee resolution.

import { Type } from "typebox";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { PERSON_CLASS, EMPLOYEE_CLASS } from "./_class-refs.js";
import { workspaceParam, limitParam } from "./_common.js";
import type { HulyClient } from "../../client/client.js";

/**
 * T-71: Resolve Person._id từ name (cho list_issues assignee filter).
 * Match: findOne Person {name} (Huly Person.name = "LastName, FirstName").
 *
 * NOTE: email resolve CẦN Channel(Email)/SocialIdentity lookup (Person.email
 * field KHÔNG tồn tại — email lives trong Channel attachedTo Person). Deferred
 * follow-up — hiện tại chỉ name match. Caller truyền email → undefined → isError.
 *
 * Port pattern (name path) trusted contacts-shared.ts:190.
 */
export async function findPersonByEmailOrName(
  client: HulyClient,
  input: string,
): Promise<string | undefined> {
  // Name match (Huly Person.name = "LastName, FirstName").
  const byName = await client.findOne(PERSON_CLASS, { name: input } as never);
  return byName?._id;
}

export const tools: HulyToolDefinition[] = [
  // 1. list_employees
  defineHulyTool({
    name: "list_employees",
    label: "List employees",
    description: "List employees trong workspace (cho assignee resolution).",
    parameters: Type.Object({ workspace: workspaceParam, limit: limitParam }),
    async handler(params, tctx) {
      const limit = typeof params.limit === "number" ? params.limit : 50;
      const employees = await tctx.client.findAll(EMPLOYEE_CLASS, {}, { limit });
      // T-74: email field KHÔNG tồn tại trên Employee/Person (lives trong Channel).
      // Drop email claim (was always undefined). name reliable.
      const list = employees.map((e) => ({
        id: e._id,
        name: (e as { name?: string }).name ?? "",
      }));
      return {
        content: `Found ${list.length} employee(s).`,
        details: { count: list.length, employees: list },
      };
    },
  }),

  // 2. list_persons
  defineHulyTool({
    name: "list_persons",
    label: "List persons",
    description: "List persons (contacts) trong workspace.",
    parameters: Type.Object({ workspace: workspaceParam, limit: limitParam }),
    async handler(params, tctx) {
      const limit = typeof params.limit === "number" ? params.limit : 50;
      const persons = await tctx.client.findAll(PERSON_CLASS, {}, { limit });
      const list = persons.map((p) => ({
        id: p._id,
        name: (p as { name?: string }).name ?? "",
        // T-82 #105: drop dead `email` field — Person.email KHÔNG tồn tại (email
        // lives trong Channel attachedTo Person). Email resolve defer T-82G.
      }));
      return {
        content: `Found ${list.length} person(s).`,
        details: { count: list.length, persons: list },
      };
    },
  }),
];
