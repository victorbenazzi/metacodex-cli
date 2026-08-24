import { describe, expect, it } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { oscAttention, oscDone } from "../osc.js";
import { createOscBridge, registerOsc } from "./osc.js";

type Handler = () => void;

function createHarness(sequences: string[]) {
  const handlers = new Map<string, Handler[]>();
  const bridge = createOscBridge((sequence) => {
    sequences.push(sequence);
  });
  const pi = {
    on(event: string, handler: Handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
  };
  registerOsc(pi as unknown as ExtensionAPI, bridge);
  return {
    bridge,
    emit(type: string) {
      for (const handler of handlers.get(type) ?? []) handler();
    },
  };
}

describe("registerOsc", () => {
  it("emits OSC 9 when a turn settles", () => {
    const sequences: string[] = [];
    const harness = createHarness(sequences);
    harness.emit("agent_start");
    harness.emit("agent_settled");
    expect(sequences).toEqual([oscDone()]);
  });

  it("emits OSC 99 for auth or exhausted chain and skips the following OSC 9", () => {
    const sequences: string[] = [];
    const harness = createHarness(sequences);
    harness.emit("agent_start");
    harness.bridge.attention("auth");
    harness.emit("agent_settled");
    expect(sequences).toEqual([oscAttention("auth failed")]);

    harness.emit("agent_start");
    harness.bridge.attention("exhausted");
    harness.emit("agent_settled");
    expect(sequences).toEqual([oscAttention("auth failed"), oscAttention("fallback exhausted")]);
  });
});
