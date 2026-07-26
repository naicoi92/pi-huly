// pi-huly extension entry — placeholder factory (impl real ở T-33).
// R6 verification: type-only import force load pi types → typecheck catch
// TS 7 incompatibility với pi types sớm (design 03 §8 R6).
import type {} from "@earendil-works/pi-coding-agent";

export const HULY_VERSION = "0.1.0";

export default function setup(_pi: unknown): void {
  // Placeholder — T-33 factory sẽ registerTools (19 domains) +
  // registerCommand /huly (unified) + session_shutdown hook → pool.closeAll().
}
