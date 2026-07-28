// Test T-51 #41 cho issues-templates domain — silent space fallback fix.
// Cover: create_template + create_issue_from_template. Tool sau có 2 findOne
// (template + project) → 2 error paths khác nhau cần test riêng.

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
import { tools } from "../issues-templates.js";

const ctx = {
  hasUI: false,
  cwd: "/proj",
  ui: { confirm: vi.fn() },
} as never;

function makeClient() {
  return {
    getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "User", email: "u@x.com" }),
    findAll: vi.fn().mockResolvedValue([]),
    findOne: vi.fn(),
    createDoc: vi.fn().mockResolvedValue("tpl-id-1"),
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

describe("T-51 #41: create_template project space resolve", () => {
  it("project null → isError + createDoc KHÔNG gọi", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_template");
    const result = await tool.execute("tc1", { title: "Bug template" }, undefined, undefined, ctx);

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/not found/i);
    expect(text).toMatch(/huly init/i);
    expect(client.createDoc).not.toHaveBeenCalled();
  });

  it("project exists → createDoc dùng project.space", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({ _id: "proj-1", space: "tpl-space" });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_template");
    const result = await tool.execute("tc1", { title: "Bug template" }, undefined, undefined, ctx);

    expect(result.isError).toBeUndefined();
    const call = client.createDoc.mock.calls[0];
    expect(call?.[1]).toBe("tpl-space");
    expect(call?.[1]).not.toBe("ws1");
  });
});

describe("T-51 #41: create_issue_from_template (2 lookup paths)", () => {
  it("template not found → isError (regression — KHÔNG regress existing behavior)", async () => {
    const client = makeClient();
    // findOne lần 1 (template) trả undefined
    client.findOne = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_issue_from_template");
    const result = await tool.execute("tc1", { template: "tpl-123" }, undefined, undefined, ctx);

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/template.*not found/i);
    expect(client.createDoc).not.toHaveBeenCalled();
  });

  it("template exists + project null → isError MỚI + createDoc KHÔNG gọi", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "tpl-123", title: "Bug" }) // template OK
      .mockResolvedValueOnce(undefined); // project not found
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_issue_from_template");
    const result = await tool.execute("tc1", { template: "tpl-123" }, undefined, undefined, ctx);

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/project.*not found/i);
    expect(text).toMatch(/huly init/i);
    expect(client.createDoc).not.toHaveBeenCalled();
  });

  it("happy path (cả 2 tồn tại) → createDoc dùng project.space", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "tpl-123", title: "Bug", description: "{}" }) // template
      .mockResolvedValueOnce({ _id: "proj-1", space: "happy-space" }); // project
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_issue_from_template");
    const result = await tool.execute("tc1", { template: "tpl-123" }, undefined, undefined, ctx);

    expect(result.isError).toBeUndefined();
    const call = client.createDoc.mock.calls[0];
    expect(call?.[1]).toBe("happy-space");
    expect(call?.[1]).not.toBe("ws1");
  });
});

// T-76: add/remove_template_child object shape + create_template defaults + create_from fields.
describe("T-76: add_template_child builds IssueTemplateChild object + replaces array", () => {
  it("add → updateDoc với children = [...existing, {id,title,...}] (KHÔNG $push raw string)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce({ _id: "tpl-1", space: "sp1", children: [] });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = tools.find((t) => t.name === "huly_add_template_child")!;
    const result = await tool.execute(
      "tc1",
      { template: "tpl-1", title: "Sub task", priority: "high", estimation: 120 },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    const ops = client.updateDoc.mock.calls[0]?.[3] as Record<string, unknown>;
    expect(ops.$push).toBeUndefined(); // KHÔNG $push
    expect(ops.children as Array<Record<string, unknown>>).toHaveLength(1);
    expect((ops.children as Array<Record<string, unknown>>)[0]).toMatchObject({
      title: "Sub task",
      priority: "high",
      estimation: 120,
    });
    const children = ops.children as Array<Record<string, unknown>>;
    expect(typeof children[0]?.id).toBe("string"); // generated id
  });

  it("template not found → isError", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce(undefined);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = tools.find((t) => t.name === "huly_add_template_child")!;
    const result = await tool.execute(
      "tc1",
      { template: "x", title: "y" },
      undefined,
      undefined,
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(client.updateDoc).not.toHaveBeenCalled();
  });
});

describe("T-76: remove_template_child find by id + replace array", () => {
  it("remove → find by childId, filter out, replace children array", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce({
      _id: "tpl-1",
      space: "sp1",
      children: [
        { id: "c-1", title: "A" },
        { id: "c-2", title: "B" },
      ],
    });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = tools.find((t) => t.name === "huly_remove_template_child")!;
    const result = await tool.execute(
      "tc1",
      { template: "tpl-1", childId: "c-1" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    const ops = client.updateDoc.mock.calls[0]?.[3] as Record<string, unknown>;
    expect(ops.$pull).toBeUndefined();
    expect(ops.children as Array<Record<string, unknown>>).toHaveLength(1);
    expect((ops.children as Array<Record<string, unknown>>)[0].id).toBe("c-2");
  });

  it("childId not found → isError", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce({ _id: "tpl-1", children: [{ id: "c-1" }] });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = tools.find((t) => t.name === "huly_remove_template_child")!;
    const result = await tool.execute(
      "tc1",
      { template: "tpl-1", childId: "missing" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(client.updateDoc).not.toHaveBeenCalled();
  });
});

describe("T-76: create_template default fields", () => {
  it("create → createDoc với priority/assignee/component/estimation/children/comments defaults", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce({ _id: "p-1", identifier: "PD", space: "sp1" });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = tools.find((t) => t.name === "huly_create_template")!;
    await tool.execute("tc1", { title: "My Template" }, undefined, undefined, ctx);

    const attrs = client.createDoc.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(attrs.priority).toBe("no-priority");
    expect(attrs.assignee).toBeNull();
    expect(attrs.component).toBeNull();
    expect(attrs.estimation).toBe(0);
    expect(attrs.children).toEqual([]);
    expect(attrs.comments).toBe(0);
  });
});

describe("T-76: create_issue_from_template copies priority/assignee/component", () => {
  it("create_from → createDoc copies template fields (KHÔNG chỉ title+description)", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({
        _id: "tpl-1",
        title: "Tpl",
        description: "desc",
        priority: "high",
        assignee: "person-1",
        component: "comp-1",
      }) // template
      .mockResolvedValueOnce({ _id: "p-1", identifier: "PD", space: "sp1" }); // project
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = tools.find((t) => t.name === "huly_create_issue_from_template")!;
    await tool.execute("tc1", { template: "tpl-1" }, undefined, undefined, ctx);

    const attrs = client.createDoc.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(attrs.priority).toBe("high"); // copied from template
    expect(attrs.assignee).toBe("person-1");
    expect(attrs.component).toBe("comp-1");
  });
});
