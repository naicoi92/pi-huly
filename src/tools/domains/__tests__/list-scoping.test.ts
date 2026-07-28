// T-71: list_milestones/components/templates/statuses space scoping + ProjectType traversal.

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
import { tools as milestoneTools } from "../milestones.js";
import { tools as componentTools } from "../components.js";
import { tools as templateTools } from "../issues-templates.js";
import { tools as projectTools } from "../projects.js";
import { MILESTONE_CLASS, COMPONENT_CLASS, ISSUE_TEMPLATE_CLASS } from "../_class-refs.js";

const ctx = { hasUI: false, cwd: "/proj", ui: { confirm: vi.fn() } } as never;

function makeClient() {
  return {
    getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "User", email: "u@x.com" }),
    findAll: vi.fn().mockResolvedValue([]),
    findOne: vi.fn(),
  };
}

function findTool(list: { name: string }[], name: string) {
  const t = list.find((x) => x.name === name);
  if (!t) throw new Error(`tool ${name} not found`);
  return t as never as {
    name: string;
    execute: (
      id: string,
      params: Record<string, unknown>,
      signal: undefined,
      onUpdate: undefined,
      ctx: unknown,
    ) => Promise<{
      content: Array<{ type: "text"; text: string }>;
      details: Record<string, unknown>;
      isError?: true;
    }>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("T-71: list_milestones space scoping", () => {
  it("findAll MILESTONE_CLASS với space: project._id", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce({ _id: "sp1", identifier: "PD" });
    vi.mocked(getClient).mockResolvedValue(client as never);
    await findTool(milestoneTools, "huly_list_milestones").execute(
      "tc1",
      {},
      undefined,
      undefined,
      ctx,
    );
    expect(client.findAll).toHaveBeenCalledWith(MILESTONE_CLASS, { space: "sp1" }, {});
  });

  it("project not found → isError", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce(undefined);
    vi.mocked(getClient).mockResolvedValue(client as never);
    const result = await findTool(milestoneTools, "huly_list_milestones").execute(
      "tc1",
      {},
      undefined,
      undefined,
      ctx,
    );
    expect(result.isError).toBe(true);
  });
});

describe("T-71: list_components space scoping", () => {
  it("findAll COMPONENT_CLASS với space", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce({ _id: "sp1", identifier: "PD" });
    vi.mocked(getClient).mockResolvedValue(client as never);
    await findTool(componentTools, "huly_list_components").execute(
      "tc1",
      {},
      undefined,
      undefined,
      ctx,
    );
    expect(client.findAll).toHaveBeenCalledWith(COMPONENT_CLASS, { space: "sp1" }, {});
  });
});

describe("T-71: list_templates space scoping", () => {
  it("findAll ISSUE_TEMPLATE_CLASS với space", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce({ _id: "sp1", identifier: "PD" });
    vi.mocked(getClient).mockResolvedValue(client as never);
    await findTool(templateTools, "huly_list_templates").execute(
      "tc1",
      {},
      undefined,
      undefined,
      ctx,
    );
    expect(client.findAll).toHaveBeenCalledWith(ISSUE_TEMPLATE_CLASS, { space: "sp1" }, {});
  });
});

describe("T-71: list_statuses ProjectType traversal", () => {
  it("Project → ProjectType.statuses Ref[] → resolve IssueStatus docs + category enum + isDefault", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({
        _id: "sp1",
        identifier: "PD",
        type: "pt-1",
        defaultIssueStatus: "st-2",
      }) // Project
      .mockResolvedValueOnce({ statuses: [{ _id: "st-1" }, { _id: "st-2" }] }) // ProjectType (objects, T-71 B1)
      .mockResolvedValueOnce({ _id: "st-1", name: "Todo", category: "task:statusCategory:ToDo" })
      .mockResolvedValueOnce({ _id: "st-2", name: "Done", category: "task:statusCategory:Won" });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const result = await findTool(projectTools, "huly_list_statuses").execute(
      "tc1",
      {},
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    const statuses = (result.details as { statuses: Array<Record<string, unknown>> }).statuses;
    expect(statuses).toHaveLength(2);
    expect(statuses[0]).toMatchObject({ name: "Todo", category: "ToDo", isDefault: false });
    expect(statuses[1]).toMatchObject({ name: "Done", category: "Won", isDefault: true });
  });

  it("project not found → isError", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce(undefined);
    vi.mocked(getClient).mockResolvedValue(client as never);
    const result = await findTool(projectTools, "huly_list_statuses").execute(
      "tc1",
      {},
      undefined,
      undefined,
      ctx,
    );
    expect(result.isError).toBe(true);
  });

  it("project without type → empty statuses (KHÔNG crash)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce({ _id: "sp1", identifier: "PD" }); // no type
    vi.mocked(getClient).mockResolvedValue(client as never);
    const result = await findTool(projectTools, "huly_list_statuses").execute(
      "tc1",
      {},
      undefined,
      undefined,
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect((result.details as { count: number }).count).toBe(0);
  });
});
