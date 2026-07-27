// ConnectionPool — module singleton, shared subagents (D14).
// Design: 04-system.md §6 pool.ts, 01 §B.3 D3 transport, §B.14 D14 shared,
// 08 §A NFR-11 maxSize 8 (ws), NFR-03 reconnect.
//
// Pool state = module-level (KHÔNG per-session) → subagent reuse.
// WS: LRU evict khi > maxSize (default 8). REST: cached instance, no LRU (stateless).

import { getWorkspace, type WorkspaceCreds } from "../config/credentials.js";
import { loadConfig } from "../config/config.js";
import {
  createHulyClient,
  type HulyClient,
  type HulyCredentials,
  type Transport,
} from "./client.js";

/** Pool entry: client + metadata. */
interface PoolEntry {
  client: HulyClient;
  workspaceId: string;
  transport: Transport;
  createdAt: number;
  lastAccess: number;
}

/** Health status cho /huly diagnostics. */
export interface HealthStatus {
  workspace: string;
  connected: boolean;
  transport: Transport;
  user?: { id: string; name: string; email: string };
}

/** Max WS connections in pool (NFR-11 default 8). */
const MAX_WS_POOL = 8;

/** Module-level pool singleton (shared subagents D14). */
const pool = new Map<string, PoolEntry>();

/**
 * Get-or-create HulyClient cho workspace.
 * WS: LRU evict khi pool > MAX_WS_POOL. REST: cached, no LRU.
 * Lazy reconnect: nếu client closed → recreate (simplified — KHÔNG backoff timing).
 */
export async function getClient(workspaceId: string): Promise<HulyClient> {
  const existing = pool.get(workspaceId);
  if (existing) {
    existing.lastAccess = Date.now();
    return existing.client;
  }
  // Cache miss → create
  const creds = await getWorkspace(workspaceId);
  if (!creds) {
    throw new Error(`Workspace "${workspaceId}" not found in credentials. Run /huly init to add.`);
  }
  const config = await loadConfig();
  const transport: Transport = config.transport ?? "ws";

  // WS LRU evict nếu đạt maxSize
  if (transport === "ws") {
    const wsEntries = [...pool.values()].filter((e) => e.transport === "ws");
    if (wsEntries.length >= MAX_WS_POOL) {
      // Evict oldest by lastAccess
      const oldest = wsEntries.sort((a, b) => a.lastAccess - b.lastAccess)[0];
      if (oldest) {
        await oldest.client.close().catch(() => {});
        pool.delete(oldest.workspaceId);
      }
    }
  }

  const client = await createHulyClient(toCredentials(creds), transport);
  // Pre-fetch currentUser để cache (D15) + verify connection healthy.
  // Fail KHÔNG block pool — user available lazily qua client.getCurrentUser().
  await client.getCurrentUser().catch(() => {});
  pool.set(workspaceId, {
    client,
    workspaceId,
    transport,
    createdAt: Date.now(),
    lastAccess: Date.now(),
  });

  return client;
}

/** Map WorkspaceCreds → HulyCredentials (url tách + auth union). */
function toCredentials(creds: WorkspaceCreds): HulyCredentials {
  // creds đã có {url, workspace, ...auth} → cast thẳng (HulyCredentials shape match)
  return creds as unknown as HulyCredentials;
}

/**
 * Close all clients + clear pool. session_shutdown cleanup (FR-12).
 * Idempotent — safe to call multiple times.
 */
export async function closeAll(): Promise<void> {
  const entries = [...pool.values()];
  pool.clear();
  await Promise.all(entries.map((entry) => entry.client.close().catch(() => {})));
}

/**
 * Health check cho /huly diagnostics.
 * - workspace given → check specific entry
 * - undefined → aggregate all entries
 */
export async function health(workspace?: string): Promise<HealthStatus[]> {
  if (workspace) {
    const entry = pool.get(workspace);
    if (!entry) return [];
    return [await entryHealth(entry)];
  }
  return Promise.all([...pool.values()].map(entryHealth));
}

async function entryHealth(entry: PoolEntry): Promise<HealthStatus> {
  let user: { id: string; name: string; email: string } | undefined;
  let connected = true;
  try {
    user = await entry.client.getCurrentUser();
  } catch {
    connected = false;
  }
  return {
    workspace: entry.workspaceId,
    connected,
    transport: entry.transport,
    user,
  };
}

/** Test-only: clear pool without closing (cho unit test isolation). */
export function __clearPoolForTests(): void {
  pool.clear();
}

/** Test-only: get pool size. */
export function __poolSizeForTests(): number {
  return pool.size;
}

/** Test-only: get MAX_WS_POOL constant. */
export const __MAX_WS_POOL = MAX_WS_POOL;
