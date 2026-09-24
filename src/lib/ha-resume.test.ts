import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decideResume,
  FORCE_RECONNECT_HIDDEN_MS,
  STUCK_CONNECTING_MS,
} from "./ha-resume.ts";

describe("decideResume (Safari foreground)", () => {
  const base = {
    reconnectAllowed: true,
    hasCreds: true,
    hadLiveSession: true,
    status: "live" as const,
    socketConnected: false,
    bootInFlight: false,
    hiddenForMs: 0,
    connectingForMs: 0,
  };

  it("reconnects when creds exist but the socket is closed after background", () => {
    assert.equal(decideResume(base), "reconnect");
    assert.equal(decideResume({ ...base, status: "error" }), "reconnect");
  });

  it("probes when readyState still looks OPEN after a brief blip", () => {
    assert.equal(decideResume({ ...base, socketConnected: true }), "probe");
  });

  it("forces reconnect after real backgrounding even if readyState looks OPEN", () => {
    assert.equal(
      decideResume({
        ...base,
        socketConnected: true,
        hiddenForMs: FORCE_RECONNECT_HIDDEN_MS,
      }),
      "reconnect",
    );
    assert.equal(
      decideResume({
        ...base,
        socketConnected: true,
        hiddenForMs: FORCE_RECONNECT_HIDDEN_MS + 5_000,
      }),
      "reconnect",
    );
  });

  it("no-ops during a fresh in-flight connect / boot", () => {
    assert.equal(decideResume({ ...base, status: "connecting" }), "noop");
    assert.equal(decideResume({ ...base, bootInFlight: true }), "noop");
  });

  it("reconnects when connecting is stuck past the handshake budget", () => {
    assert.equal(
      decideResume({
        ...base,
        status: "connecting",
        connectingForMs: STUCK_CONNECTING_MS,
      }),
      "reconnect",
    );
  });

  it("reboots via bootstrap when localStorage creds are gone but we had Live", () => {
    assert.equal(decideResume({ ...base, hasCreds: false }), "rebootstrap");
    assert.equal(
      decideResume({
        ...base,
        hasCreds: false,
        socketConnected: true,
        hiddenForMs: FORCE_RECONNECT_HIDDEN_MS,
      }),
      "rebootstrap",
    );
  });

  it("never resumes true Demo (no prior live session / Use demo / no creds)", () => {
    assert.equal(
      decideResume({
        ...base,
        status: "demo",
        hadLiveSession: false,
        socketConnected: false,
        hasCreds: false,
      }),
      "noop",
    );
    assert.equal(
      decideResume({
        ...base,
        status: "demo",
        hadLiveSession: false,
        hasCreds: true,
      }),
      "noop",
    );
    assert.equal(decideResume({ ...base, reconnectAllowed: false }), "noop");
  });
});
