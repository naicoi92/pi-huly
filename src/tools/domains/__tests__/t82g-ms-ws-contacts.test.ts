// T-82G: milestones/workspace/contacts completeness (#108).
// - findPersonByEmailOrName: email resolve via Channel (HIGH VALUE — unblocks
//   T-80 assignee email input).
// - get_milestone: description (markdown), project, modifiedOn, createdOn.
// - set_issue_milestone: null clear.
// - list_persons: city, modifiedOn. list_employees: position, active.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../client/pool.js", () => ({ getClient: vi.fn() }));
vi.mock("../../../config/resolver.js", () => ({
  resolveWorkspace: vi.fn().mockResolvedValue("ws1"),
  resolveProject: vi.fn().mockResolvedValue("PD"),
  NeedsInitError: class extends Error {},
  NeedsDisambiguationError: class extends Error {},
}));
vi.mock("../../../client/errors.js", () => ({
  HulyError: class extends Error {
    readonly class: string;
    constructor(c: string, m: string) {
      super(m);
      this.class = c;
    }
  },
  mapError: vi.fn((e: unknown) => ({ class: "Internal", message: String(e) })),
  sanitize: vi.fn((s: string) => s),
  LEAK_PATTERNS: [],
}));

import { getClient } from "../../../client/pool.js";
import { findPersonByEmailOrName } from "../contacts.js";
import { tools as contactsTools } from "../contacts.js";
import { tools as msTools } from "../milestones.js";

const ctx = { hasUI: false, cwd: "/proj", ui: { confirm: vi.fn() } } as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("T-82G: findPersonByEmailOrName email via Channel (#108)", () => {
  it("email input → findOne Channel (provider email, value exact) → Person via attachedTo", async () => {
    const client = {
      getCurrentUser: vi.fn(),
      findOne: vi
        .fn()
        .mockResolvedValueOnce({ _id: "ch1", attachedTo: "person-9" }) // Channel
        .mockResolvedValueOnce({ _id: "person-9", name: "Doe, Jane" }), // Person
      findAll: vi.fn(),
    };
    vi.mocked(getClient).mockResolvedValue(client as never);

    const id = await findPersonByEmailOrName(client as never, "jane@x.com");

    expect(client.findOne).toHaveBeenCalledWith("contact:class:Channel", {
      value: "jane@x.com",
      provider: "contact:channelProvider:Email",
    });
    expect(id).toBe("person-9");
  });

  it("email Channel miss → name fallback attempted (KHÔNG throw)", async () => {
    const client = {
      findOne: vi.fn().mockResolvedValue(null), // Channel miss + name miss
      findAll: vi.fn(),
    };

    const id = await findPersonByEmailOrName(client as never, "jane@x.com");

    // Channel lookup ran (email input), name lookup ran (fallback), no match.
    expect(id).toBeUndefined();
    const calls = client.findOne.mock.calls.map((c: unknown[]) => c[0]);
    expect(calls).toContain("contact:class:Channel");
    expect(calls).toContain("contact:class:Person");
  });

  it("non-email input → name match only (KHÔNG query Channel)", async () => {
    const client = {
      findOne: vi.fn().mockResolvedValueOnce({ _id: "person-1", name: "Doe, Jane" }),
      findAll: vi.fn(),
    };

    const id = await findPersonByEmailOrName(client as never, "Doe, Jane");

    expect(id).toBe("person-1");
    const channelCall = client.findOne.mock.calls.find(
      (c: unknown[]) => c[0] === "contact:class:Channel",
    );
    expect(channelCall).toBeUndefined();
  });
});

describe("T-82G: get_milestone fields (#108)", () => {
  it("includes description (markdown), project, modifiedOn, createdOn", async () => {
    const client = {
      getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "U", email: "u@x.com" }),
      findOne: vi.fn().mockResolvedValue({
        _id: "m1",
        space: "proj-1",
        label: "Sprint 1",
        status: 0,
        description: "desc-ref",
        modifiedOn: 1700000000000,
        createdOn: 1600000000000,
      }),
      fetchMarkup: vi.fn().mockResolvedValue("# Sprint goal"),
      findAll: vi.fn(),
    };
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = msTools.find((t) => t.name === "huly_get_milestone")!;
    const result = await tool.execute("tc1", { milestone: "m1" }, undefined, undefined, ctx);

    expect(result.details).toMatchObject({
      description: "# Sprint goal",
      project: "proj-1",
      modifiedOn: 1700000000000,
      createdOn: 1600000000000,
    });
  });
});

describe("T-82G: set_issue_milestone null clear (#108)", () => {
  it("milestone=null → clear (component:null on issue)", async () => {
    const client = {
      getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "U", email: "u@x.com" }),
      findOne: vi.fn().mockResolvedValueOnce({ _id: "i1", space: "proj-1", identifier: "PD-1" }),
      updateDoc: vi.fn().mockResolvedValue(undefined),
      findAll: vi.fn(),
    };
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = msTools.find((t) => t.name === "huly_set_issue_milestone")!;
    await tool.execute("tc1", { identifier: "PD-1", milestone: null }, undefined, undefined, ctx);

    expect(client.updateDoc.mock.calls[0]?.[3]).toEqual({ milestone: null });
  });
});

describe("T-82G: list_persons/list_employees new fields (#108)", () => {
  it("list_persons includes city + modifiedOn", async () => {
    const client = {
      getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "U", email: "u@x.com" }),
      findAll: vi
        .fn()
        .mockResolvedValue([
          { _id: "p1", name: "Doe, Jane", city: "Hanoi", modifiedOn: 1700000000000 },
        ]),
      findOne: vi.fn(),
    };
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = contactsTools.find((t) => t.name === "huly_list_persons")!;
    const result = await tool.execute("tc1", {}, undefined, undefined, ctx);

    const persons = (result.details as { persons: Array<Record<string, unknown>> }).persons;
    expect(persons[0]).toMatchObject({ city: "Hanoi", modifiedOn: 1700000000000 });
    expect(persons[0]).not.toHaveProperty("email");
  });

  it("list_employees includes position + active", async () => {
    const client = {
      getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "U", email: "u@x.com" }),
      findAll: vi
        .fn()
        .mockResolvedValue([{ _id: "e1", name: "Doe, Jane", role: "Engineer", active: true }]),
      findOne: vi.fn(),
    };
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = contactsTools.find((t) => t.name === "huly_list_employees")!;
    const result = await tool.execute("tc1", {}, undefined, undefined, ctx);

    const employees = (result.details as { employees: Array<Record<string, unknown>> }).employees;
    expect(employees[0]).toMatchObject({ position: "Engineer", active: true });
  });
});
