import { MCX_BIN } from "./version.js";

/** Pi prints `pi --session <id>` on quit. Sessions live under ~/.mcx. */
export function rewriteResumeHint(text: string): string {
  return text
    .replaceAll(/\bpi --session-dir\b/g, `${MCX_BIN} --session-dir`)
    .replaceAll(/\bpi --session\b/g, `${MCX_BIN} --session`);
}

export function installResumeHintRewrite(
  stream: NodeJS.WriteStream = process.stdout,
): () => void {
  const original = stream.write.bind(stream);
  const write = ((chunk: string | Uint8Array, encoding?: BufferEncoding, cb?: (err?: Error | null) => void) => {
    if (typeof chunk === "string" && chunk.includes("To resume this session:")) {
      chunk = rewriteResumeHint(chunk);
    }
    return original(chunk, encoding as BufferEncoding, cb);
  }) as typeof stream.write;
  stream.write = write;
  return () => {
    stream.write = original;
  };
}
