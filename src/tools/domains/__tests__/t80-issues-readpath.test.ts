// T-80: issues read-path fixes (#103).
// - get_issue: status→name (getProjectStatuses), assignee→Person.name, labels
//   (TagReference), parentIssue (parents[last].identifier), subIssues, modifiedOn,
//   createdOn.
// - list_issue_relations: fix broken blocks query (object form, KHÔNG dotted) +
//   resolve raw _id → identifier (batch findAll $in).
// - update_issue: resolve assignee email/name → Person._id + null clear (unassign).

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
  mdToMarkup: vi.fn((s: string) => `markup(${s})`),
  markupToMd: vi.fn((s: unknown) => `md(${JSON.stringify(s).slice(0, 20)})`),
}));

import { getClient } from "../../../client/pool.js";
import { tools as coreTools } from "../issues-core.js";
import { tools as relTools } from "../issues-relations.js";

const ctx = {
  hasUI: false,
  cwd: "/proj",
  ui: { confirm: vi.fn() },
} as never;

function findTool(name: string) {
  return [...coreTools, ...relTools].find((t) => t.name === name)!;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// getProjectStatuses flow (T-81 #104): findOne(PROJECT) → findOne(PROJECT_TYPE)
// → findAll(core.class.Status, {_id:{$in}}) batch. Returns findOne + findAll mocks.
function makeStatusResolvingClient() {
  const project = {
    _id: "proj-1",
    identifier: "PD",
    type: "pt-1",
    defaultIssueStatus: "tracker:status:Done",
  };
  const projectType = {
    _id: "pt-1",
    statuses: [{ _id: "tracker:status:Todo" }, { _id: "tracker:status:Done" }],
  };
  const statuses = [
    { _id: "tracker:status:Todo", name: "Todo", category: "task:statusCategory:ToDo" },
    { _id: "tracker:status:Done", name: "Done", category: "task:statusCategory:Won" },
  ];
  const findOne = vi.fn();
  findOne.mockImplementation((cls: unknown, query: { _id?: unknown; identifier?: unknown }) => {
    if (query?._id === "pt-1") return projectType;
    if (cls === "tracker:class:Project" || query?.identifier === "PD") return project;
    return undefined;
  });
  return { findOne, findAll: vi.fn().mockResolvedValue(statuses) };
}

describe("T-80: get_issue resolve raw refs + new fields (#103)", () => {
  it("status _id ref → name (qua getProjectStatuses)", async () => {
    const statusMocks = makeStatusResolvingClient();
    const client = {
      getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "U", email: "u@x.com" }),
      findAll: statusMocks.findAll,
      findOne: statusMocks.findOne,
      fetchMarkup: vi.fn(),
    };
    client.findOne.mockReturnValueOnce({
      _id: "issue-1",
      space: "sp1",
      identifier: "PD-1",
      title: "X",
      status: "tracker:status:Done",
      priority: "high",
    });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_get_issue");
    const result = await tool.execute("tc1", { identifier: "PD-1" }, undefined, undefined, ctx);

    expect(result.details).toMatchObject({
      status: "Done",
      statusRef: "tracker:status:Done",
    });
  });

  it("assignee Person _id → name (findOne PERSON_CLASS)", async () => {
    const client = {
      getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "U", email: "u@x.com" }),
      findAll: vi.fn().mockResolvedValue([]),
      findOne: vi.fn(),
      fetchMarkup: vi.fn(),
    };
    // issue KHÔNG có status → getProjectStatuses skip → findOne call #2 = PERSON.
    client.findOne = client.findOne
      .mockReturnValueOnce({
        _id: "issue-1",
        space: "sp1",
        identifier: "PD-1",
        title: "X",
        assignee: "person-9",
      })
      .mockReturnValueOnce({ _id: "person-9", name: "Nguyen, Van" }); // PERSON lookup
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_get_issue");
    const result = await tool.execute("tc1", { identifier: "PD-1" }, undefined, undefined, ctx);

    expect(result.details).toMatchObject({
      assignee: "Nguyen, Van",
      assigneeRef: "person-9",
    });
    // findOne PERSON_CLASS called with assignee _id
    const personCall = client.findOne.mock.calls.find(
      (c: unknown[]) => c[0] === "contact:class:Person",
    );
    expect(personCall?.[1]).toMatchObject({ _id: "person-9" });
  });

  it("labels via TagReference findAll + parentIssue + subIssues + modifiedOn", async () => {
    const client = {
      getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "U", email: "u@x.com" }),
      findOne: vi.fn(),
      findAll: vi.fn().mockResolvedValue([
        { title: "bug", color: "red" },
        { title: "urgent", color: "orange" },
      ]),
      fetchMarkup: vi.fn(),
    };
    client.findOne = client.findOne.mockReturnValueOnce({
      _id: "issue-1",
      space: "sp1",
      identifier: "PD-1",
      title: "Child",
      status: "Todo",
      parents: [{ _id: "parent-1", identifier: "PD-0" }],
      subIssues: 3,
      modifiedOn: 1700000000000,
      createdOn: 1600000000000,
    });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_get_issue");
    const result = await tool.execute("tc1", { identifier: "PD-1" }, undefined, undefined, ctx);

    // labels findAll by attachedTo
    const tagCall = client.findAll.mock.calls.find(
      (c: unknown[]) => c[0] === "tags:class:TagReference",
    );
    expect(tagCall?.[1]).toMatchObject({ attachedTo: "issue-1" });
    expect(result.details).toMatchObject({
      labels: [
        { title: "bug", color: "red" },
        { title: "urgent", color: "orange" },
      ],
      parentIssue: "PD-0",
      subIssues: 3,
      modifiedOn: 1700000000000,
      createdOn: 1600000000000,
    });
  });
});

describe("T-80: list_issue_relations blocks query + identifier resolve (#103)", () => {
  it("blocks query dùng object form {blockedBy:{_id,_class}} (KHÔNG dotted)", async () => {
    const client = {
      getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "U", email: "u@x.com" }),
      findOne: vi
        .fn()
        .mockResolvedValue({ _id: "A", identifier: "PD-1", blockedBy: [], relations: [] }),
      findAll: vi.fn().mockResolvedValue([
        { _id: "B", identifier: "PD-2" }, // issue blocked by A
      ]),
    };
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_list_issue_relations");
    await tool.execute("tc1", { identifier: "PD-1" }, undefined, undefined, ctx);

    const blocksCall = client.findAll.mock.calls.find(
      (c) => typeof c[1] === "object" && c[1] !== null && "blockedBy" in (c[1] as object),
    );
    expect(blocksCall?.[1]).toEqual({
      blockedBy: { _id: "A", _class: "tracker:class:Issue" },
    });
    // KHÔNG dùng dotted path
    const dottedCall = client.findAll.mock.calls.find(
      (c) => typeof c[1] === "object" && c[1] !== null && "blockedBy._id" in (c[1] as object),
    );
    expect(dottedCall).toBeUndefined();
  });

  it("relations resolve raw _id → identifier (batch findAll $in)", async () => {
    const client = {
      getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "U", email: "u@x.com" }),
      findOne: vi.fn().mockResolvedValue({
        _id: "A",
        identifier: "PD-1",
        blockedBy: [{ _id: "C", _class: "tracker:class:Issue" }], // is-blocked-by C
        relations: [{ _id: "D", _class: "tracker:class:Issue" }], // relates-to D
      }),
      // call 1: blocks reverse query (none). call 2: $in resolve [C, D]
      findAll: vi
        .fn()
        .mockResolvedValueOnce([]) // blocks query
        .mockResolvedValueOnce([
          { _id: "C", identifier: "PD-3" },
          { _id: "D", identifier: "PD-4" },
        ]),
    };
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_list_issue_relations");
    const result = await tool.execute("tc1", { identifier: "PD-1" }, undefined, undefined, ctx);

    // $in resolve query
    const inCall = client.findAll.mock.calls.find(
      (c) => typeof c[1] === "object" && c[1] !== null && "_id" in (c[1] as object),
    );
    expect(inCall?.[1]).toEqual({ _id: { $in: ["C", "D"] } });

    const details = result.details as {
      relations: Array<{ identifier?: string; direction: string }>;
    };
    const byDir = Object.fromEntries(details.relations.map((r) => [r.direction, r.identifier]));
    expect(byDir["is-blocked-by"]).toBe("PD-3");
    expect(byDir["relates-to"]).toBe("PD-4");
  });
});

describe("T-80: update_issue assignee resolve + null clear (#103)", () => {
  it("assignee email/name → resolve Person._id trước push (KHÔNG raw string)", async () => {
    const client = {
      getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "U", email: "u@x.com" }),
      findAll: vi.fn().mockResolvedValue([]),
      findOne: vi
        .fn()
        .mockResolvedValueOnce({ _id: "issue-1", space: "sp1", identifier: "PD-1" }) // issue
        .mockResolvedValueOnce({ _id: "person-5", name: "Doe, John" }), // findPersonByEmailOrName
      updateDoc: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_update_issue");
    await tool.execute(
      "tc1",
      { identifier: "PD-1", assignee: "Doe, John" },
      undefined,
      undefined,
      ctx,
    );

    const ops = client.updateDoc.mock.calls[0]?.[3];
    expect(ops).toMatchObject({ assignee: "person-5" }); // resolved _id, KHÔNG raw string
  });

  it("assignee null → unassign (ops.assignee = null)", async () => {
    const client = {
      getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "U", email: "u@x.com" }),
      findAll: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValueOnce({ _id: "issue-1", space: "sp1", identifier: "PD-1" }),
      updateDoc: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_update_issue");
    await tool.execute("tc1", { identifier: "PD-1", assignee: null }, undefined, undefined, ctx);

    const ops = client.updateDoc.mock.calls[0]?.[3];
    expect(ops).toMatchObject({ assignee: null });
  });

  it("assignee không tìm thấy Person → isError, assignee unchanged", async () => {
    const client = {
      getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "U", email: "u@x.com" }),
      findAll: vi.fn().mockResolvedValue([]),
      findOne: vi
        .fn()
        .mockResolvedValueOnce({ _id: "issue-1", space: "sp1", identifier: "PD-1" })
        .mockResolvedValueOnce(undefined), // Person not found
      updateDoc: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_update_issue");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", assignee: "Nobody" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(client.updateDoc).not.toHaveBeenCalled();
  });
});
