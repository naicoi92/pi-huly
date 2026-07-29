// T-81: projects/spaces/components fixes (#104).
// - create_component: lead raw string → Ref<Employee> (findPersonByEmailOrName) +
//   comments:0 default.
// - update_component: lead resolve.
// - get/update/delete_component + set_issue_component: component lookup scoped theo
//   project (space: project._id).
// - getProjectStatuses (_common.ts): core.class.Status + batch $in (KHÔNG N+1
//   IssueStatus — covered in list-scoping.test.ts, here assert class ref).

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
  markupToMd: vi.fn(),
}));

import { getClient } from "../../../client/pool.js";
import { tools } from "../components.js";
import { getProjectStatuses } from "../_common.js";

const ctx = { hasUI: false, cwd: "/proj", ui: { confirm: vi.fn() } } as never;
const ctxConfirmed = {
  hasUI: true,
  cwd: "/proj",
  ui: { confirm: vi.fn().mockResolvedValue(true) },
} as never;

function makeClient() {
  return {
    getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "U", email: "u@x.com" }),
    findAll: vi.fn().mockResolvedValue([]),
    findOne: vi.fn(),
    createDoc: vi.fn().mockResolvedValue("comp-id"),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    removeDoc: vi.fn().mockResolvedValue(undefined),
  };
}

function findTool(name: string) {
  return tools.find((t) => t.name === name)!;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("T-81: create_component lead resolve + comments:0 (#104)", () => {
  it("lead email/name → resolve Person._id (KHÔNG raw string)", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "proj-1", space: "proj-1" }) // project
      .mockResolvedValueOnce({ _id: "person-7", name: "Doe, Jane" }); // findPersonByEmailOrName
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_component");
    await tool.execute("tc1", { label: "Backend", lead: "Doe, Jane" }, undefined, undefined, ctx);

    const data = client.createDoc.mock.calls[0]?.[2];
    expect(data).toMatchObject({ lead: "person-7", comments: 0 });
    expect(data).not.toMatchObject({ lead: "Doe, Jane" });
  });

  it("create_component data luôn có comments:0 (kể cả khi không có lead)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce({ _id: "proj-1", space: "proj-1" });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_component");
    await tool.execute("tc1", { label: "Frontend" }, undefined, undefined, ctx);

    const data = client.createDoc.mock.calls[0]?.[2];
    expect(data).toMatchObject({ comments: 0, label: "Frontend" });
  });

  it("lead Person không tìm thấy → isError, createDoc KHÔNG gọi", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "proj-1", space: "proj-1" }) // project
      .mockResolvedValueOnce(undefined); // Person not found
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_component");
    const result = await tool.execute(
      "tc1",
      { label: "X", lead: "Nobody" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(client.createDoc).not.toHaveBeenCalled();
  });
});

describe("T-81: update_component lead resolve (#104)", () => {
  it("update lead → resolve Person._id trước push", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "proj-1", identifier: "PD" }) // getProjectSpace project
      .mockResolvedValueOnce({ _id: "comp-1", space: "proj-1", label: "X" }) // component
      .mockResolvedValueOnce({ _id: "person-9", name: "Roe, John" }); // findPersonByEmailOrName
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_update_component");
    await tool.execute(
      "tc1",
      { component: "comp-1", lead: "Roe, John" },
      undefined,
      undefined,
      ctx,
    );

    const ops = client.updateDoc.mock.calls[0]?.[3];
    expect(ops).toMatchObject({ lead: "person-9" });
  });
});

describe("T-81: component lookups space-scoped theo project (#104)", () => {
  it("get_component findOne có space: project._id filter", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "proj-1", identifier: "PD" }) // getProjectSpace
      .mockResolvedValueOnce({ _id: "comp-1", space: "proj-1", label: "X" }); // component
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_get_component");
    await tool.execute("tc1", { component: "comp-1" }, undefined, undefined, ctx);

    const compCall = client.findOne.mock.calls.find(
      (c: unknown[]) => c[0] === "tracker:class:Component",
    );
    expect(compCall?.[1]).toMatchObject({ _id: "comp-1", space: "proj-1" });
  });

  it("delete_component findOne có space filter", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "proj-1", identifier: "PD" })
      .mockResolvedValueOnce({ _id: "comp-2", space: "proj-1" });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_delete_component");
    await tool.execute("tc1", { component: "comp-2" }, undefined, undefined, ctxConfirmed);

    const compCall = client.findOne.mock.calls.find(
      (c: unknown[]) => c[0] === "tracker:class:Component",
    );
    expect(compCall?.[1]).toMatchObject({ _id: "comp-2", space: "proj-1" });
  });

  it("set_issue_component component lookup scoped theo issue.space", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "i1", space: "proj-1", identifier: "PD-1" }) // issue
      .mockResolvedValueOnce({ _id: "comp-3", space: "proj-1" }); // component
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_set_issue_component");
    await tool.execute(
      "tc1",
      { identifier: "PD-1", component: "comp-3" },
      undefined,
      undefined,
      ctx,
    );

    const compCall = client.findOne.mock.calls.find(
      (c: unknown[]) => c[0] === "tracker:class:Component",
    );
    expect(compCall?.[1]).toMatchObject({ _id: "comp-3", space: "proj-1" });
  });
});

describe("T-81: getProjectStatuses dùng core.class.Status batch $in (#104)", () => {
  it("findAll core:class:Status với {_id:{$in}} (KHÔNG findOne IssueStatus per ref)", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({
        _id: "sp1",
        identifier: "PD",
        type: "pt-1",
        defaultIssueStatus: "st-1",
      })
      .mockResolvedValueOnce({ statuses: [{ _id: "st-1" }, { _id: "st-2" }] }); // ProjectType
    client.findAll = vi.fn().mockResolvedValue([
      { _id: "st-1", name: "Todo", category: "task:statusCategory:ToDo" },
      { _id: "st-2", name: "Done", category: "task:statusCategory:Won" },
    ]);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const result = await getProjectStatuses(client as never, "PD");

    // findAll core:class:Status batch $in
    const statusCall = client.findAll.mock.calls.find(
      (c: unknown[]) => c[0] === "core:class:Status",
    );
    expect(statusCall?.[1]).toMatchObject({ _id: { $in: ["st-1", "st-2"] } });
    // KHÔNG query IssueStatus class
    const issueStatusCall = client.findOne.mock.calls.find(
      (c: unknown[]) => c[0] === "tracker:class:IssueStatus",
    );
    expect(issueStatusCall).toBeUndefined();
    expect(result?.statuses).toEqual([
      { _id: "st-1", name: "Todo", category: "ToDo", isDefault: true },
      { _id: "st-2", name: "Done", category: "Won", isDefault: false },
    ]);
  });
});
