export const HANDOFF_CUSTOM_TYPE = "mcx-handoff";

export interface HandoffPacketInput {
  fromProvider: string;
  fromModel: string;
  toProvider: string;
  toModel: string;
  inProgress: string;
  alreadyDone: string;
  doNotRedo: string;
  userInstruction?: string;
}

export function isCrossProvider(fromProvider: string, toProvider: string): boolean {
  return fromProvider !== toProvider;
}

export function buildHandoffPacket(input: HandoffPacketInput): string {
  const instruction = input.userInstruction?.trim();
  const lines = [
    "This session is a handoff. You are taking over an in-flight coding task. Do not restart from scratch.",
    `Previous model: ${input.fromProvider}/${input.fromModel}`,
    `Your model: ${input.toProvider}/${input.toModel}`,
    "",
    "In progress:",
    input.inProgress.trim() || "(not specified)",
    "",
    "Already done (do not redo):",
    input.alreadyDone.trim() || "(not specified)",
    "",
    "Do not redo:",
    input.doNotRedo.trim() || "(see already done)",
    "",
    "Tool results already in this transcript are ground truth. Continue from them.",
  ];

  if (instruction) {
    lines.push("", "User instruction for this handoff:", instruction);
  }

  return lines.join("\n");
}
