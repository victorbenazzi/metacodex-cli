/**
 * Fallback hops and /handoff both call pi.setModel, which emits model_select.
 * /model uses that event to inject a handoff packet. A transport hop must not.
 */

export interface SelectPacketGate {
  suppressSelectPacket: boolean;
}

export function createSelectPacketGate(): SelectPacketGate {
  return { suppressSelectPacket: false };
}

export async function withoutSelectPacket<T>(
  gate: SelectPacketGate | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  if (!gate) return fn();
  gate.suppressSelectPacket = true;
  try {
    return await fn();
  } finally {
    gate.suppressSelectPacket = false;
  }
}
