import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { oscAttention, oscDone } from "../osc.js";

export type OscWrite = (sequence: string) => void;

export type AttentionKind = "auth" | "exhausted";

const ATTENTION_TITLE: Record<AttentionKind, string> = {
  auth: "auth failed",
  exhausted: "fallback exhausted",
};

export function defaultOscWrite(sequence: string): void {
  process.stdout.write(sequence);
}

export function createOscBridge(write: OscWrite = defaultOscWrite) {
  let suppressSettled = false;
  return {
    write,
    done(): void {
      if (suppressSettled) {
        suppressSettled = false;
        return;
      }
      write(oscDone());
    },
    attention(kind: AttentionKind, body = ""): void {
      suppressSettled = true;
      write(oscAttention(ATTENTION_TITLE[kind], body));
    },
    reset(): void {
      suppressSettled = false;
    },
  };
}

export type OscBridge = ReturnType<typeof createOscBridge>;

export function registerOsc(pi: ExtensionAPI, bridge: OscBridge = createOscBridge()): void {
  pi.on("agent_start", () => {
    bridge.reset();
  });
  pi.on("agent_settled", () => {
    bridge.done();
  });
}
