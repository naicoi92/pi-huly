import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { addWorkspace, type WorkspaceCreds } from "../credentials.js";
import { bindProject } from "../config.js";
import {
  NeedsDisambiguationError,
  NeedsInitError,
  resolveProject,
  resolveWorkspace,
} from "../resolver.js";

const TEST_DIR = join(tmpdir(), `pi-huly-resolver-test-${process.pid}`);
const CRED_PATH = join(TEST_DIR, "credentials.json");
const CONFIG_PATH = join(TEST_DIR, "config.json");

const tokenWs: WorkspaceCreds = {
  url: "https://huly.example.com",
  workspace: "myteam",
  token: "secret-token",
};
const emailWs: WorkspaceCreds = {
  url: "https://huly.corp.com",
  workspace: "corp",
  email: "u@corp.com",
  password: "pass",
};

async function setupCreds(entries: Record<string, WorkspaceCreds>): Promise<void> {
  await mkdir(dirname(CRED_PATH), { recursive: true });
  for (const [id, ws] of Object.entries(entries)) {
    await addWorkspace(id, ws, CRED_PATH);
  }
}

describe("resolveWorkspace — explicit param", () => {
  beforeEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });
  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("returns id when explicit matches exact id (getWorkspace)", async () => {
    await setupCreds({ myteam: tokenWs });
    const id = await resolveWorkspace("myteam", {
      cwd: "/somewhere",
      credentialsPath: CRED_PATH,
      configPath: CONFIG_PATH,
    });
    expect(id).toBe("myteam");
  });

  it("returns id when explicit matches workspace name uniquely", async () => {
    // id khác workspace name
    await setupCreds({ "my-handle": tokenWs });
    const id = await resolveWorkspace("myteam", {
      cwd: "/somewhere",
      credentialsPath: CRED_PATH,
      configPath: CONFIG_PATH,
    });
    expect(id).toBe("my-handle");
  });

  it("throws NeedsDisambiguationError when same-name diff-URL (multi-result)", async () => {
    const corpProd: WorkspaceCreds = {
      url: "https://huly.prod.com",
      workspace: "corp",
      token: "p",
    };
    const corpStaging: WorkspaceCreds = {
      url: "https://huly.staging.com",
      workspace: "corp",
      token: "s",
    };
    await setupCreds({ "corp-prod": corpProd, "corp-staging": corpStaging });
    await expect(
      resolveWorkspace("corp", {
        cwd: "/somewhere",
        credentialsPath: CRED_PATH,
        configPath: CONFIG_PATH,
      }),
    ).rejects.toBeInstanceOf(NeedsDisambiguationError);
  });

  it("NeedsDisambiguationError carries matches list", async () => {
    const corpProd: WorkspaceCreds = {
      url: "https://huly.prod.com",
      workspace: "corp",
      token: "p",
    };
    const corpStaging: WorkspaceCreds = {
      url: "https://huly.staging.com",
      workspace: "corp",
      token: "s",
    };
    await setupCreds({ "corp-prod": corpProd, "corp-staging": corpStaging });
    try {
      await resolveWorkspace("corp", {
        cwd: "/x",
        credentialsPath: CRED_PATH,
        configPath: CONFIG_PATH,
      });
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(NeedsDisambiguationError);
      const err = e as NeedsDisambiguationError;
      expect(err.matches).toHaveLength(2);
      const ids = err.matches.map((m) => m.id).sort();
      expect(ids).toEqual(["corp-prod", "corp-staging"]);
    }
  });

  it("throws NeedsInitError when explicit non-existent", async () => {
    await setupCreds({ myteam: tokenWs });
    await expect(
      resolveWorkspace("nonexistent", {
        cwd: "/x",
        credentialsPath: CRED_PATH,
        configPath: CONFIG_PATH,
      }),
    ).rejects.toBeInstanceOf(NeedsInitError);
  });
});

describe("resolveWorkspace — cwd-map fallback", () => {
  beforeEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });
  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("returns workspace from cwd-map when explicit absent", async () => {
    await setupCreds({ myteam: tokenWs });
    await bindProject("/a/b", { workspace: "myteam", project: "proj1" }, CONFIG_PATH);
    const id = await resolveWorkspace(undefined, {
      cwd: "/a/b/sub",
      credentialsPath: CRED_PATH,
      configPath: CONFIG_PATH,
    });
    expect(id).toBe("myteam");
  });

  it("uses longest-prefix cwd-map match", async () => {
    await setupCreds({ short: tokenWs, long: emailWs });
    await bindProject("/a", { workspace: "short", project: "p1" }, CONFIG_PATH);
    await bindProject("/a/b", { workspace: "long", project: "p2" }, CONFIG_PATH);
    const id = await resolveWorkspace(undefined, {
      cwd: "/a/b/c",
      credentialsPath: CRED_PATH,
      configPath: CONFIG_PATH,
    });
    expect(id).toBe("long");
  });

  it("throws NeedsInitError when no explicit + no cwd-map", async () => {
    await setupCreds({ myteam: tokenWs });
    await expect(
      resolveWorkspace(undefined, {
        cwd: "/nowhere",
        credentialsPath: CRED_PATH,
        configPath: CONFIG_PATH,
      }),
    ).rejects.toBeInstanceOf(NeedsInitError);
  });
});

describe("resolveProject", () => {
  beforeEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });
  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("returns explicit param as-is", async () => {
    const result = await resolveProject("my-proj", { cwd: "/x", configPath: CONFIG_PATH });
    expect(result).toBe("my-proj");
  });

  it("returns project from cwd-map when explicit absent", async () => {
    await bindProject("/a/b", { workspace: "ws", project: "proj1" }, CONFIG_PATH);
    const result = await resolveProject(undefined, {
      cwd: "/a/b/sub",
      configPath: CONFIG_PATH,
    });
    expect(result).toBe("proj1");
  });

  it("returns undefined when no explicit + no cwd-map (caller prompt)", async () => {
    const result = await resolveProject(undefined, {
      cwd: "/nowhere",
      configPath: CONFIG_PATH,
    });
    expect(result).toBeUndefined();
  });
});

describe("integration: full resolver flow", () => {
  beforeEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });
  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("bind → resolveWorkspace + resolveProject via cwd-map", async () => {
    await setupCreds({ myteam: tokenWs });
    await bindProject(
      "/home/user/myproject",
      {
        workspace: "myteam",
        project: "pi-huly",
      },
      CONFIG_PATH,
    );

    const ctx = {
      cwd: "/home/user/myproject/src/deep",
      credentialsPath: CRED_PATH,
      configPath: CONFIG_PATH,
    };
    const ws = await resolveWorkspace(undefined, ctx);
    const proj = await resolveProject(undefined, ctx);
    expect(ws).toBe("myteam");
    expect(proj).toBe("pi-huly");
  });

  it("explicit overrides cwd-map", async () => {
    await setupCreds({ myteam: tokenWs, other: emailWs });
    await bindProject("/a/b", { workspace: "myteam", project: "p1" }, CONFIG_PATH);
    const ctx = {
      cwd: "/a/b",
      credentialsPath: CRED_PATH,
      configPath: CONFIG_PATH,
    };
    // explicit 'other' overrides cwd-map 'myteam'
    const ws = await resolveWorkspace("other", ctx);
    expect(ws).toBe("other");
  });
});
