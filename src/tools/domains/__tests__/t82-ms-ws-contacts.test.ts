// T-82: milestones/workspace/contacts fixes (#105).
// - milestone status READ number→string (milestoneStatusToString reverse map; T-72
//   only fixed write). get_milestone + list_milestones.
// - list_persons: drop dead `email` field (Person.email KHÔNG tồn tại).
// - update_user_profile: firstName/lastName → "LastName,FirstName" (Option B —
//   KHÔNG raw Person.name phá format).

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
import { tools as msTools } from "../milestones.js";
import { tools as wsTools } from "../workspace.js";
import { tools as contactsTools } from "../contacts.js";

const ctx = { hasUI: false, cwd: "/proj", ui: { confirm: vi.fn() } } as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("T-82: milestone status READ → string (#105)", () => {
  it("list_milestones status number → string (KHÔNG raw 0)", async () => {
    const client = {
      getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "U", email: "u@x.com" }),
      findAll: vi.fn().mockResolvedValue([
        { _id: "m1", label: "Sprint 1", status: 0 },
        { _id: "m2", label: "Sprint 2", status: 2 },
        { _id: "m3", label: "Sprint 3", status: 1 },
      ]),
      findOne: vi.fn().mockResolvedValue({ _id: "proj-1", identifier: "PD" }),
    };
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = msTools.find((t) => t.name === "huly_list_milestones")!;
    const result = await tool.execute("tc1", {}, undefined, undefined, ctx);

    const milestones = (result.details as { milestones: Array<{ status: unknown }> }).milestones;
    expect(milestones.map((m) => m.status)).toEqual(["planned", "completed", "in-progress"]);
  });

  it("get_milestone status number → string (KHÔNG raw 0)", async () => {
    const client = {
      getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "U", email: "u@x.com" }),
      findOne: vi.fn().mockResolvedValue({ _id: "m1", label: "M1", status: 3 }),
      findAll: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = msTools.find((t) => t.name === "huly_get_milestone")!;
    const result = await tool.execute("tc1", { milestone: "m1" }, undefined, undefined, ctx);

    expect(result.details).toMatchObject({ status: "canceled" });
  });
});

describe("T-82: list_persons drop dead email (#105)", () => {
  it("list_persons KHÔNG trả email field (Person.email KHÔNG tồn tại)", async () => {
    const client = {
      getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "U", email: "u@x.com" }),
      findAll: vi.fn().mockResolvedValue([{ _id: "p1", name: "Doe, Jane" }]),
      findOne: vi.fn(),
    };
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = contactsTools.find((t) => t.name === "huly_list_persons")!;
    const result = await tool.execute("tc1", {}, undefined, undefined, ctx);

    const persons = (result.details as { persons: Array<Record<string, unknown>> }).persons;
    expect(persons[0]).toMatchObject({ id: "p1", name: "Doe, Jane" });
    expect(persons[0]).not.toHaveProperty("email");
  });
});

describe("T-82: update_user_profile firstName/lastName format (#105)", () => {
  function makeClient(personName = "Old,Name") {
    return {
      getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "U", email: "u@x.com" }),
      findOne: vi.fn().mockResolvedValue({ _id: "u1", space: "sp1", name: personName }),
      updateDoc: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("firstName + lastName → name 'LastName,FirstName'", async () => {
    const client = makeClient();
    vi.mocked(getClient).mockResolvedValue(client as never);
    const tool = wsTools.find((t) => t.name === "huly_update_user_profile")!;
    await tool.execute("tc1", { firstName: "Jane", lastName: "Doe" }, undefined, undefined, ctx);

    expect(client.updateDoc).toHaveBeenCalledWith("contact:class:Person", "sp1", "u1", {
      name: "Doe,Jane",
    });
  });

  it("firstName only → parse current, giữ lastName", async () => {
    const client = makeClient("Smith,John");
    vi.mocked(getClient).mockResolvedValue(client as never);
    const tool = wsTools.find((t) => t.name === "huly_update_user_profile")!;
    await tool.execute("tc1", { firstName: "Johnny" }, undefined, undefined, ctx);

    expect(client.updateDoc.mock.calls[0]?.[3]).toEqual({ name: "Smith,Johnny" });
  });

  it("lastName only → parse current, giữ firstName", async () => {
    const client = makeClient("Smith,John");
    vi.mocked(getClient).mockResolvedValue(client as never);
    const tool = wsTools.find((t) => t.name === "huly_update_user_profile")!;
    await tool.execute("tc1", { lastName: "Doe" }, undefined, undefined, ctx);

    expect(client.updateDoc.mock.calls[0]?.[3]).toEqual({ name: "Doe,John" });
  });

  it("no firstName/lastName → no update", async () => {
    const client = makeClient();
    vi.mocked(getClient).mockResolvedValue(client as never);
    const tool = wsTools.find((t) => t.name === "huly_update_user_profile")!;
    const result = await tool.execute("tc1", {}, undefined, undefined, ctx);

    expect(client.updateDoc).not.toHaveBeenCalled();
    expect(result.details).toMatchObject({ updated: false });
  });
});
