// T-81G: projects/spaces/components completeness enhancement (#107).
// 8 gaps: archived-filter, widen output, name/label resolution, null-clear, new fields.

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
vi.mock("../../../markup/markup.js", () => ({
  mdToMarkup: vi.fn(),
  markupToMd: vi.fn(),
}));

import { getClient } from "../../../client/pool.js";
import { tools as projTools } from "../projects.js";
import { tools as spaceTools } from "../spaces.js";
import { tools as compTools } from "../components.js";

const ctx = { hasUI: false, cwd: "/proj", ui: { confirm: vi.fn() } } as never;

function findTool(name: string) {
  return [...projTools, ...spaceTools, ...compTools].find((t) => t.name === name)!;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("T-81G: list_projects archived-filter + output (#107)", () => {
  it("default exclude archived (query archived:{$ne:true})", async () => {
    const client = {
      getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "U", email: "u@x.com" }),
      findAll: vi.fn().mockResolvedValue([]),
      findOne: vi.fn(),
    };
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_list_projects");
    await tool.execute("tc1", {}, undefined, undefined, ctx);

    expect(client.findAll.mock.calls[0]?.[1]).toEqual({ archived: { $ne: true } });
  });

  it("includeArchived=true → query {} + output widen (description, archived, total)", async () => {
    const client = {
      getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "U", email: "u@x.com" }),
      findAll: vi.fn().mockResolvedValue([
        { _id: "p1", identifier: "PD", name: "Dev", description: "d", archived: false, sequence: 42 },
        { _id: "p2", identifier: "OLD", name: "Legacy", archived: true, sequence: 3 },
      ]),
      findOne: vi.fn(),
    };
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_list_projects");
    const result = await tool.execute(
      "tc1",
      { includeArchived: true },
      undefined,
      undefined,
      ctx,
    );

    expect(client.findAll.mock.calls[0]?.[1]).toEqual({});
    const projects = (result.details as { projects: Array<Record<string, unknown>> }).projects;
    expect(projects[0]).toMatchObject({
      identifier: "PD",
      description: "d",
      archived: false,
      total: 42,
    });
    expect(projects[1]).toMatchObject({ archived: true });
  });
});

describe("T-81G: get_project defaultStatus + statuses inline (#107)", () => {
  it("get_project includes defaultStatus + statuses[]", async () => {
    const client = {
      getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "U", email: "u@x.com" }),
      findAll: vi.fn().mockResolvedValue([
        { _id: "st-1", name: "Todo", category: "task:statusCategory:ToDo" },
        { _id: "st-2", name: "Done", category: "task:statusCategory:Won" },
      ]),
      findOne: vi
        .fn()
        .mockResolvedValueOnce({ _id: "sp1", identifier: "PD", name: "Dev", type: "pt-1", defaultIssueStatus: "st-2" }) // get_project project lookup
        .mockResolvedValueOnce({ _id: "sp1", identifier: "PD", type: "pt-1", defaultIssueStatus: "st-2" }) // getProjectStatuses findOne(PROJECT)
        .mockResolvedValueOnce({ statuses: [{ _id: "st-1" }, { _id: "st-2" }] }), // getProjectStatuses findOne(PROJECT_TYPE)
    };
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_get_project");
    const result = await tool.execute("tc1", {}, undefined, undefined, ctx);

    expect(result.details).toMatchObject({
      defaultStatus: "Done",
      statuses: [{ name: "Todo", category: "ToDo" }, { name: "Done", category: "Won" }],
    });
  });
});

describe("T-81G: update_project description null clear (#107)", () => {
  it("description=null → $unset clear", async () => {
    const client = {
      getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "U", email: "u@x.com" }),
      findAll: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue({ _id: "p1", space: "p1", identifier: "PD" }),
      updateDoc: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_update_project");
    await tool.execute("tc1", { description: null }, undefined, undefined, ctx);

    expect(client.updateDoc.mock.calls[0]?.[3]).toEqual({ $unset: { description: "" } });
  });
});

describe("T-81G: list_spaces archived-filter (#107)", () => {
  it("default exclude archived", async () => {
    const client = {
      getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "U", email: "u@x.com" }),
      findAll: vi.fn().mockResolvedValue([]),
      findOne: vi.fn(),
    };
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_list_spaces");
    await tool.execute("tc1", {}, undefined, undefined, ctx);

    expect(client.findAll.mock.calls[0]?.[1]).toEqual({ archived: { $ne: true } });
  });
});

describe("T-81G: get_space name-fallback (#107)", () => {
  it("_id match → return space", async () => {
    const client = {
      getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "U", email: "u@x.com" }),
      findOne: vi.fn().mockResolvedValue({ _id: "s1", _class: "core:class:Space", name: "Main" }),
      findAll: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_get_space");
    const result = await tool.execute("tc1", { space: "s1" }, undefined, undefined, ctx);

    expect(result.details).toMatchObject({ _id: "s1", name: "Main", class: "core:class:Space" });
  });

  it("_id miss → name match → return space", async () => {
    const client = {
      getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "U", email: "u@x.com" }),
      findOne: vi.fn().mockResolvedValue(null),
      findAll: vi.fn().mockResolvedValue([{ _id: "s9", name: "Main" }]),
    };
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_get_space");
    const result = await tool.execute("tc1", { space: "Main" }, undefined, undefined, ctx);

    expect(result.details).toMatchObject({ _id: "s9", name: "Main" });
  });

  it("ambiguous name → isError + candidates", async () => {
    const client = {
      getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "U", email: "u@x.com" }),
      findOne: vi.fn().mockResolvedValue(null),
      findAll: vi
        .fn()
        .mockResolvedValue([{ _id: "s1", name: "Dup" }, { _id: "s2", name: "Dup" }]),
    };
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_get_space");
    const result = await tool.execute("tc1", { space: "Dup" }, undefined, undefined, ctx);

    expect(result.isError).toBe(true);
    expect((result.details as { candidates: unknown[] }).candidates).toHaveLength(2);
  });
});

describe("T-81G: update_space new fields (#107)", () => {
  it("private/archived/autoJoin fields set", async () => {
    const client = {
      getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "U", email: "u@x.com" }),
      findOne: vi.fn().mockResolvedValue({ _id: "s1", space: "s1" }),
      updateDoc: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_update_space");
    await tool.execute(
      "tc1",
      { space: "s1", private: true, archived: false, autoJoin: true },
      undefined,
      undefined,
      ctx,
    );

    expect(client.updateDoc.mock.calls[0]?.[3]).toMatchObject({
      private: true,
      archived: false,
      autoJoin: true,
    });
  });
});

describe("T-81G: get_component lead→name + set_issue_component label/null (#107)", () => {
  it("get_component resolves lead Ref → Person name", async () => {
    const client = {
      getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "U", email: "u@x.com" }),
      findOne: vi
        .fn()
        .mockResolvedValueOnce({ _id: "proj-1", identifier: "PD" }) // getProjectSpace
        .mockResolvedValueOnce({ _id: "c1", space: "proj-1", label: "BE", lead: "person-1" }) // component
        .mockResolvedValueOnce({ _id: "person-1", name: "Doe, Jane" }), // Person
      fetchMarkup: vi.fn().mockResolvedValue("# desc"),
    };
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_get_component");
    const result = await tool.execute("tc1", { component: "c1" }, undefined, undefined, ctx);

    expect(result.details).toMatchObject({ lead: "Doe, Jane", leadRef: "person-1" });
  });

  it("set_issue_component null → clear (component:null)", async () => {
    const client = {
      getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "U", email: "u@x.com" }),
      findOne: vi.fn().mockResolvedValueOnce({ _id: "i1", space: "proj-1", identifier: "PD-1" }),
      updateDoc: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_set_issue_component");
    await tool.execute(
      "tc1",
      { identifier: "PD-1", component: null },
      undefined,
      undefined,
      ctx,
    );

    expect(client.updateDoc.mock.calls[0]?.[3]).toEqual({ component: null });
  });

  it("set_issue_component label-fallback resolve (_id miss → label match)", async () => {
    const client = {
      getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "U", email: "u@x.com" }),
      findOne: vi
        .fn()
        .mockResolvedValueOnce({ _id: "i1", space: "proj-1", identifier: "PD-1" }) // issue
        .mockResolvedValueOnce(null) // _id miss
        .mockResolvedValueOnce({ _id: "c9", space: "proj-1", label: "Backend" }), // label match
      updateDoc: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_set_issue_component");
    await tool.execute(
      "tc1",
      { identifier: "PD-1", component: "Backend" },
      undefined,
      undefined,
      ctx,
    );

    expect(client.updateDoc.mock.calls[0]?.[3]).toEqual({ component: "c9" });
  });
});
