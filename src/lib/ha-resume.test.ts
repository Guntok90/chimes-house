import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideResume } from "./ha-resume.ts";

describe("decideResume (Safari foreground)", () => {
  const base = {
    reconnectAllowed: true,
    hasCreds: true,
    hadLiveSession: true,
    status: "live" as const,
    socketConnected: false,
    bootInFlight: false,
  };

  it("reconnects when creds exist but the socket is closed after background", () => {
    assert.equal(decideResume(base), "reconnect");
    assert.equal(decideResume({ ...base, status: "error" }), "reconnect");
  });

  it("probes when readyState still looks OPEN (zombie after iPad Safari suspend)", () => {
    assert.equal(decideResume({ ...base, socketConnected: true }), "probe");
  });

  it("no-ops during an in-flight connect / boot", () => {
    assert.equal(decideResume({ ...base, status: "connecting" }), "noop");
    assert.equal(decideResume({ ...base, bootInFlight: true }), "noop");
  });

  it("never resumes true Demo (no prior live session / Use demo / no creds)", () => {
    assert.equal(
      decideResume({
        ...base,
        status: "demo",
        hadLiveSession: false,
        socketConnected: false,
      }),
      "noop",
    );
    assert.equal(decideResume({ ...base, hasCreds: false }), "noop");
    assert.equal(decideResume({ ...base, reconnectAllowed: false }), "noop");
  });
});
