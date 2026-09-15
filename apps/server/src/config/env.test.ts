import { describe, expect, it } from "vitest";
import {
  PRESENCE_HEARTBEAT_INTERVAL_SECONDS,
  PRESENCE_POLL_INTERVAL_SECONDS,
  PRESENCE_TTL_SECONDS,
} from "./env.js";

/**
 * TS-20 [AC-108] — techspec 7 ties three numbers together: heartbeat "every
 * ~20-30s", TTL "roughly 60s (~2x the heartbeat interval)", poll "every
 * ~15-20s". The relationship between them is the requirement, not any one
 * constant in isolation — a TTL tuned down on its own (e.g. to "fix" a flaky
 * test) would leave every individual number still plausible while breaking
 * the invariant that holds them together.
 *
 * The web half of the relationship (`POLL_INTERVAL_MS` in use-presence.ts)
 * is a module-private constant with no export — per this scenario's note,
 * asserted here only in this description rather than reaching into that
 * module: it is currently 15_000ms, i.e. 15s, matching the server band below.
 */
describe("presence cadence — heartbeat, TTL and poll stay in the ratio techspec 7 specifies [AC-108]", () => {
  it("keeps the heartbeat interval within the specified 20-30s band [AC-108]", () => {
    expect(PRESENCE_HEARTBEAT_INTERVAL_SECONDS).toBeGreaterThanOrEqual(20);
    expect(PRESENCE_HEARTBEAT_INTERVAL_SECONDS).toBeLessThanOrEqual(30);
  });

  it("keeps the poll interval within the specified 15-20s band [AC-108]", () => {
    expect(PRESENCE_POLL_INTERVAL_SECONDS).toBeGreaterThanOrEqual(15);
    expect(PRESENCE_POLL_INTERVAL_SECONDS).toBeLessThanOrEqual(20);
  });

  it("keeps the TTL at roughly 2x the heartbeat interval, not merely a bigger number [AC-108]", () => {
    // "Roughly" is given a concrete tolerance band rather than a bare `>=`, so a
    // TTL that technically exceeds the heartbeat but has drifted far from 2x
    // (e.g. 5x, which would make the chips laggy in the other direction) is
    // still caught.
    const ratio = PRESENCE_TTL_SECONDS / PRESENCE_HEARTBEAT_INTERVAL_SECONDS;
    expect(ratio).toBeGreaterThanOrEqual(1.8);
    expect(ratio).toBeLessThanOrEqual(2.4);
  });

  it("keeps the poll interval shorter than the TTL, so a live collaborator is re-checked before ageing out [AC-108]", () => {
    expect(PRESENCE_POLL_INTERVAL_SECONDS).toBeLessThan(PRESENCE_TTL_SECONDS);
  });
});
