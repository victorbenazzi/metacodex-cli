/**
 * Provider-specific bits that must not be replayed onto another vendor
 * on fallback/handoff. Keep this list conservative: strip what breaks
 * the destination request, leave the rest.
 */

export interface ContentBlock {
  type: string;
  cache_control?: unknown;
  thinking?: unknown;
  signature?: unknown;
  reasoning?: unknown;
  [key: string]: unknown;
}

export interface RouterMessage {
  role: string;
  content?: string | ContentBlock[];
  reasoning?: unknown;
  provider?: string;
  [key: string]: unknown;
}

const NON_PORTABLE_BLOCK_TYPES = new Set([
  "thinking",
  "reasoning",
  "reasoning_content",
]);

function stripBlock(block: ContentBlock): ContentBlock | null {
  if (NON_PORTABLE_BLOCK_TYPES.has(block.type)) return null;
  const next: ContentBlock = { ...block };
  delete next.cache_control;
  delete next.thinking;
  delete next.signature;
  delete next.reasoning;
  return next;
}

export function stripForProvider(messages: RouterMessage[]): RouterMessage[] {
  return messages.map((message) => {
    const next: RouterMessage = { ...message };
    delete next.reasoning;
    if (Array.isArray(next.content)) {
      next.content = next.content
        .map(stripBlock)
        .filter((block): block is ContentBlock => block !== null);
    }
    return next;
  });
}
