// WorkspaceResolver + ProjectResolver — chain resolution (explicit > cwd-map > init).
// Design: 04-system.md §6, 01-vision.md §B.8 D8 resolution chain.
//
// Resolution chain (no env vars per D8):
//   resolveWorkspace: explicit param > cwd-map (config.resolveByCwd) > NeedsInitError
//   resolveProject:   explicit param > cwd-map > undefined (caller prompt list_projects)
//
// Same-name diff-URL disambiguation: findByName returns multiple → NeedsDisambiguationError.

import { CREDENTIALS_PATH } from "./credentials.js";
import { CONFIG_PATH, resolveByCwd, type ProjectBinding } from "./config.js";
import { findByName, getWorkspace } from "./credentials.js";

/** Context injected vào resolver (testability + tránh hard coupling). */
export type ResolverCtx = {
  /** Current working directory (cwd) cho cwd-map resolution. */
  cwd: string;
  /** Override credentials path (test inject temp). Default: CREDENTIALS_PATH. */
  credentialsPath?: string;
  /** Override config path (test inject temp). Default: CONFIG_PATH. */
  configPath?: string;
};

/**
 * Error: workspace explicit param hoặc cwd-map resolves tới same-name diff-URL.
 * Caller catch → prompt user chọn 1 trong matches.
 */
export class NeedsDisambiguationError extends Error {
  readonly matches: Array<{ id: string; url: string; workspace: string }>;
  constructor(matches: Array<{ id: string; url: string; workspace: string }>) {
    super(
      `Workspace name ambiguous: ${matches.length} workspaces match. ` +
        `Specify one: ${matches.map((m) => `${m.id} (${m.url})`).join(", ")}`,
    );
    this.name = "NeedsDisambiguationError";
    this.matches = matches;
  }
}

/**
 * Error: không resolve được workspace (no explicit, no cwd-map binding).
 * Caller catch → run /huly init flow.
 */
export class NeedsInitError extends Error {
  constructor(message = "No workspace resolved. Run /huly init to bind cwd.") {
    super(message);
    this.name = "NeedsInitError";
  }
}

/**
 * Resolve workspace id-handle cho tool call.
 * Chain:
 *   1. explicit param → lookup credentials (findByName → multi = NeedsDisambiguationError;
 *      single = return id; getWorkspace exact id = return)
 *   2. cwd-map → resolveByCwd(cwd)?.workspace → return binding.workspace
 *   3. KHÔNG có → throw NeedsInitError
 */
export async function resolveWorkspace(
  explicit?: string,
  ctx: ResolverCtx = { cwd: process.cwd() },
): Promise<string> {
  const credPath = ctx.credentialsPath ?? CREDENTIALS_PATH;
  const configPath = ctx.configPath ?? CONFIG_PATH;

  // 1. Explicit param
  if (explicit !== undefined && explicit.length > 0) {
    // Try exact id first
    const byId = await getWorkspace(explicit, credPath);
    if (byId !== undefined) {
      return explicit;
    }
    // Try findByName (multi-result possible)
    const matches = await findByName(explicit, credPath);
    if (matches.length === 1) {
      return matches[0].id;
    }
    if (matches.length > 1) {
      throw new NeedsDisambiguationError(
        matches.map((m) => ({ id: m.id, url: m.url, workspace: m.workspace })),
      );
    }
    throw new NeedsInitError(
      `Workspace "${explicit}" not found in credentials. Run /huly init to add it.`,
    );
  }

  // 2. cwd-map
  const binding = await resolveByCwd(ctx.cwd, configPath);
  if (binding !== undefined) {
    return binding.workspace;
  }

  // 3. No resolution
  throw new NeedsInitError();
}

/**
 * Resolve project id cho tool call.
 * Chain:
 *   1. explicit param → return as-is
 *   2. cwd-map → resolveByCwd(cwd)?.project → return binding.project
 *   3. KHÔNG có → return undefined (caller prompt list_projects)
 */
export async function resolveProject(
  explicit?: string,
  ctx: ResolverCtx = { cwd: process.cwd() },
): Promise<string | undefined> {
  // 1. Explicit param
  if (explicit !== undefined && explicit.length > 0) {
    return explicit;
  }

  // 2. cwd-map
  const configPath = ctx.configPath ?? CONFIG_PATH;
  const binding: ProjectBinding | undefined = await resolveByCwd(ctx.cwd, configPath);
  if (binding !== undefined) {
    return binding.project;
  }

  // 3. No resolution → undefined (caller prompt)
  return undefined;
}
