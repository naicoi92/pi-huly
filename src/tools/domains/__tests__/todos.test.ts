// Test T-46 create_todo — addCollection signature + required fields (audit §5).
// Cover: correct class (time:class:ToDo), attachedToClass field, required fields
// (user/visibility/rank/priority/workslots), priority number enum, error wrap.

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
import { tools } from "../todos.js";

const ctx = {
  hasUI: false,
  cwd: "/proj",
  ui: { confirm: vi.fn() },
} as never;

function makeClient() {
  return {
    getCurrentUser: vi.fn().mockResolvedValue({ id: "emp-1", name: "User", email: "u@x.com" }),
    findAll: vi.fn().mockResolvedValue([]),
    findOne: vi.fn(),
    createDoc: vi.fn().mockResolvedValue("new-id"),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    removeDoc: vi.fn().mockResolvedValue(undefined),
    addCollection: vi.fn().mockResolvedValue("new-todo-id"),
    createMixin: vi.fn(),
    fetchMarkup: vi.fn(),
    getAccount: vi.fn(),
  };
}

function findTool(name: string) {
  return tools.find((t) => t.name === name)!;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("T-46: create_todo addCollection signature (#28)", () => {
  it("addCollection dùng class time:class:ToDo (KHÔNG task:Todo)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({
      _id: "issue-1",
      space: "sp1",
      identifier: "PD-1",
    });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_todo");
    await tool.execute(
      "tc1",
      { identifier: "PD-1", title: "Write tests" },
      undefined,
      undefined,
      ctx,
    );

    const call = client.addCollection.mock.calls[0];
    expect(call?.[0]).toBe("time:class:ToDo");
  });

  it("addCollection attributes có đầy đủ required fields (audit §5)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({
      _id: "issue-1",
      space: "sp1",
      identifier: "PD-1",
    });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_todo");
    await tool.execute(
      "tc1",
      { identifier: "PD-1", title: "Write tests", description: "desc" },
      undefined,
      undefined,
      ctx,
    );

    const attrs = client.addCollection.mock.calls[0]?.[5];
    expect(attrs).toMatchObject({
      title: "Write tests",
      attachedTo: "issue-1",
      attachedToClass: "tracker:class:Issue",
      attachedSpace: "sp1",
      user: "emp-1", // currentUser.id (Ref<Employee>)
      priority: expect.any(Number), // ToDoPriority number enum (KHÔNG string)
      visibility: "Public", // Visibility.Public default
      rank: expect.any(String), // lexorank string (empty allowed)
      workslots: 0,
    });
    // description là markup JSON string (mdToMarkup wrap)
    expect(attrs).toMatchObject({
      description: expect.stringContaining("markup("),
    });
  });

  it("priority param từ user → map sang ToDoPriority number enum", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({
      _id: "issue-1",
      space: "sp1",
      identifier: "PD-1",
    });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_todo");
    await tool.execute(
      "tc1",
      { identifier: "PD-1", title: "Urgent todo", priority: "urgent" },
      undefined,
      undefined,
      ctx,
    );

    const attrs = client.addCollection.mock.calls[0]?.[5];
    // ToDoPriority enum: High=0, Medium=1, Low=2, NoPriority=3, Urgent=4
    expect(attrs).toMatchObject({ priority: 4 });
  });

  it("issue không tồn tại → isError, addCollection KHÔNG gọi", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_todo");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-999", title: "test" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(client.addCollection).not.toHaveBeenCalled();
  });

  it("addCollection fail (platform:status:UnknownError) → wrap context rõ ràng hơn", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({
      _id: "issue-1",
      space: "sp1",
      identifier: "PD-1",
    });
    client.addCollection = vi.fn().mockRejectedValue(new Error("platform:status:UnknownError"));
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_todo");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", title: "test" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    // Context rõ ràng hơn raw 'platform:status:UnknownError' — mention todo +
    // issue + class để debug
    expect(text).toMatch(/todo|create_todo/i);
    expect(text).toContain("PD-1");
  });
});
