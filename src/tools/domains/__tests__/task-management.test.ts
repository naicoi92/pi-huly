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
import {
  TASK_TYPE_CLASS,
  PROJECT_TYPE_CLASS,
  MODEL_SPACE,
  MIXIN_CLASS,
  TASK_TYPE_MIXIN,
} from "../_class-refs.js";

const ctx = { hasUI: false, cwd: "/proj", ui: { confirm: vi.fn() } } as never;

function makeClient() {
  return {
    getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "User", email: "u@x.com" }),
    findAll: vi.fn().mockResolvedValue([]),
    findOne: vi.fn(),
    createDoc: vi.fn().mockResolvedValue("new-id"),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    createMixin: vi.fn().mockResolvedValue(undefined),
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
    expect(attrs.ofAttribute).toBe("tracker:attribute:IssueStatus"); // T-73 H1 required
    expect(attrs.ofTaskType).toBeUndefined(); // T-73 H2 dropped (fabricated)
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

  it("T-87 #122: same name different category → isError (silent workflow corruption guard)", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({
        _id: "tt-1",
        statusClass: "tracker:class:IssueStatus",
        parent: "pt-1",
      })
      .mockResolvedValueOnce({
        _id: "s1",
        name: "Done",
        category: "task:statusCategory:Won", // existing = Won
      });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const result = await findTool("huly_create_issue_status").execute(
      "tc1",
      { taskType: "tt-1", name: "Done", category: "Lost" }, // request = Lost (mismatch)
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/already exists with category/i);
    expect(text).toMatch(/Won/i); // existing category shown
    expect(text).toMatch(/Lost/i); // requested category shown
    // KHÔNG createDoc/updateDoc (reject, không silent idempotent).
    expect(client.createDoc).not.toHaveBeenCalled();
    expect(client.updateDoc).not.toHaveBeenCalled();
  });
});

describe("T-86: create_task_type Mixin doc + createMixin + statuses copy (#121)", () => {
  it("create tasktype → Mixin classifier doc + createMixin + targetClass mixin ref + statuses copy", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "pt-1", tasks: ["tt-existing"], statuses: [] }) // projectType
      .mockResolvedValueOnce(undefined) // idempotent check (not exist)
      .mockResolvedValueOnce({
        // sibling template
        descriptor: "desc-1",
        kind: "task:kind:Task",
        ofClass: "task:class:Task",
        targetClass: "tracker:class:Issue",
        statusClass: "tracker:class:IssueStatus",
        statusCategories: ["Won"],
        statuses: ["s1", "s2"], // T-86: copy từ template (KHÔNG [])
      });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const result = await findTool("huly_create_task_type").execute(
      "tc1",
      { name: "Bug", projectType: "pt-1" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    // T-86: 2 createDoc — Mixin classifier (call 0) + TaskType (call 1).
    expect(client.createDoc).toHaveBeenCalledTimes(2);
    const mixinCall = client.createDoc.mock.calls[0];
    expect(mixinCall?.[0]).toBe(MIXIN_CLASS);
    expect(mixinCall?.[1]).toBe(MODEL_SPACE);
    const mixinAttrs = mixinCall?.[2] as Record<string, unknown>;
    expect(mixinAttrs.extends).toBe("task:class:Task"); // template.ofClass
    expect(mixinAttrs.kind).toBe(2); // ClassifierKind.MIXIN
    expect(mixinAttrs.label).toBe("embedded:embedded:Bug"); // getEmbeddedLabel format
    // Mixin _id = targetClassId (<taskTypeId>:type:mixin).
    expect(mixinCall?.[3]).toMatch(/:type:mixin$/);

    // T-86: createMixin(targetClassRef, MIXIN_CLASS, MODEL_SPACE, TASK_TYPE_MIXIN, {taskType,projectType}).
    expect(client.createMixin).toHaveBeenCalledTimes(1);
    const mixinCallArgs = client.createMixin.mock.calls[0] as unknown[];
    expect(mixinCallArgs?.[0]).toMatch(/:type:mixin$/); // targetClassRef
    expect(mixinCallArgs?.[1]).toBe(MIXIN_CLASS);
    expect(mixinCallArgs?.[2]).toBe(MODEL_SPACE);
    expect(mixinCallArgs?.[3]).toBe(TASK_TYPE_MIXIN);
    expect(mixinCallArgs?.[4]).toMatchObject({ projectType: "pt-1" });

    // TaskType doc (call 1): targetClass = new mixin ref (KHÔNG template), statuses copied.
    const ttCall = client.createDoc.mock.calls[1];
    expect(ttCall?.[0]).toBe(TASK_TYPE_CLASS);
    const ttAttrs = ttCall?.[2] as Record<string, unknown>;
    expect(ttAttrs.targetClass).toMatch(/:type:mixin$/); // T-86: new mixin ref
    expect(ttAttrs.targetClass).not.toBe("tracker:class:Issue");
    expect(ttAttrs.statuses).toEqual(["s1", "s2"]); // T-86: copy template

    // ProjectType update: tasks append + statuses append {_id, taskType}.
    const ptUpdate = client.updateDoc.mock.calls[0]?.[3] as {
      tasks?: string[];
      statuses?: Array<{ _id: string; taskType: string }>;
    };
    expect(ptUpdate.tasks?.length).toBe(2); // existing + new
    expect(ptUpdate.statuses?.length).toBe(2); // 2 template statuses appended
    expect(ptUpdate.statuses?.[0]).toMatchObject({ _id: "s1", taskType: expect.any(String) });

    expect(result.details).toMatchObject({ mixinCreated: true, registered: true });
  });

  it("no sibling template → isError (cannot copy required fields)", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "pt-1", tasks: [] }) // projectType no tasks
      .mockResolvedValueOnce(undefined); // idempotent check
    vi.mocked(getClient).mockResolvedValue(client as never);

    const result = await findTool("huly_create_task_type").execute(
      "tc1",
      { name: "Bug", projectType: "pt-1" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(client.createDoc).not.toHaveBeenCalled();
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
