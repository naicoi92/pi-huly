// T-73: workflow registration — create_issue_status + create_task_type + list fixes.

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
import { tools } from "../task-management.js";
import { TASK_TYPE_CLASS, PROJECT_TYPE_CLASS, MODEL_SPACE } from "../_class-refs.js";

const ctx = { hasUI: false, cwd: "/proj", ui: { confirm: vi.fn() } } as never;

function makeClient() {
  return {
    getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "User", email: "u@x.com" }),
    findAll: vi.fn().mockResolvedValue([]),
    findOne: vi.fn(),
    createDoc: vi.fn().mockResolvedValue("new-id"),
    updateDoc: vi.fn().mockResolvedValue(undefined),
  };
}

function findTool(name: string) {
  const t = tools.find((x) => x.name === name);
  if (!t) throw new Error(`tool ${name}`);
  return t as never as {
    name: string;
    execute: (
      id: string,
      params: Record<string, unknown>,
      s: undefined,
      u: undefined,
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

describe("T-73: create_issue_status full workflow registration", () => {
  it("create status → dynamic statusClass + core.space.Model + category Ref + register TaskType + ProjectType", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({
        _id: "tt-1",
        statusClass: "tracker:class:IssueStatus",
        parent: "pt-1",
        statuses: [],
      })
      .mockResolvedValueOnce(undefined) // existing check (not exist)
      .mockResolvedValueOnce({ _id: "pt-1", statuses: [] }); // projectType for register
    vi.mocked(getClient).mockResolvedValue(client as never);

    const result = await findTool("huly_create_issue_status").execute(
      "tc1",
      { taskType: "tt-1", name: "Done", category: "Won" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    // createDoc với dynamic statusClass + MODEL_SPACE
    const createCall = client.createDoc.mock.calls[0];
    expect(createCall?.[0]).toBe("tracker:class:IssueStatus");
    expect(createCall?.[1]).toBe(MODEL_SPACE);
    const attrs = createCall?.[2] as Record<string, unknown>;
    expect(attrs.category).toBe("task:statusCategory:Won"); // Ref (KHÔNG raw "Won")
    expect(attrs.ofTaskType).toBe("tt-1");
    // 2 updateDoc register: TaskType.statuses + ProjectType.statuses
    expect(client.updateDoc).toHaveBeenCalledTimes(2);
    expect(client.updateDoc.mock.calls[0]?.[0]).toBe(TASK_TYPE_CLASS);
    expect(client.updateDoc.mock.calls[1]?.[0]).toBe(PROJECT_TYPE_CLASS);
    expect(result.details).toMatchObject({
      registered: true,
      statusClass: "tracker:class:IssueStatus",
    });
  });

  it("taskType not found → isError", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce(undefined);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const result = await findTool("huly_create_issue_status").execute(
      "tc1",
      { taskType: "missing", name: "Done", category: "Won" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(client.createDoc).not.toHaveBeenCalled();
  });

  it("idempotent: status exists trên taskType → no-op (KHÔNG createDoc)", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({
        _id: "tt-1",
        statusClass: "tracker:class:IssueStatus",
        parent: "pt-1",
      })
      .mockResolvedValueOnce({ _id: "s1", name: "Done" }); // existing
    vi.mocked(getClient).mockResolvedValue(client as never);

    const result = await findTool("huly_create_issue_status").execute(
      "tc1",
      { taskType: "tt-1", name: "Done", category: "Won" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.details).toMatchObject({ idempotent: true });
    expect(client.createDoc).not.toHaveBeenCalled();
    expect(client.updateDoc).not.toHaveBeenCalled();
  });
});

describe("T-73: create_task_type parent field + register projectType.tasks", () => {
  it("create tasktype → parent field (KHÔNG ofProjectType) + core.space.Model + register", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce({ _id: "pt-1", tasks: [] });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const result = await findTool("huly_create_task_type").execute(
      "tc1",
      { name: "Bug", projectType: "pt-1" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    const createCall = client.createDoc.mock.calls[0];
    expect(createCall?.[1]).toBe(MODEL_SPACE);
    const attrs = createCall?.[2] as Record<string, unknown>;
    expect(attrs.parent).toBe("pt-1"); // KHÔNG ofProjectType
    // register projectType.tasks
    const regCall = client.updateDoc.mock.calls[0];
    expect(regCall?.[0]).toBe(PROJECT_TYPE_CLASS);
    expect(((regCall?.[3] as { tasks?: string[] }) ?? {}).tasks?.length).toBe(1);
    expect(result.details).toMatchObject({ registered: true });
  });

  it("projectType not found → isError", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce(undefined);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const result = await findTool("huly_create_task_type").execute(
      "tc1",
      { name: "Bug", projectType: "missing" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(client.createDoc).not.toHaveBeenCalled();
  });
});

describe("T-73: list_task_types field parent (KHÔNG ofProjectType)", () => {
  it("list với projectType → query { parent }", async () => {
    const client = makeClient();
    client.findAll = vi.fn().mockResolvedValue([{ _id: "tt-1", name: "Bug" }]);
    vi.mocked(getClient).mockResolvedValue(client as never);

    await findTool("huly_list_task_types").execute(
      "tc1",
      { projectType: "pt-1" },
      undefined,
      undefined,
      ctx,
    );

    const query = client.findAll.mock.calls[0]?.[1];
    expect(query).toEqual({ parent: "pt-1" }); // KHÔNG ofProjectType
  });
});
