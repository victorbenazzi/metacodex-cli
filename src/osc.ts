/** Sequences the metacodex app already parses. Do not invent new ones. */

const BEL = "\u0007";

export function oscTitle(title: string): string {
  return `\u001b]0;${title}${BEL}`;
}

export function oscDone(body = "done"): string {
  return `\u001b]9;${body}${BEL}`;
}

export function oscAttention(title: string, body = ""): string {
  const payload = body ? `2;${title};${body}` : `2;${title}`;
  return `\u001b]99;${payload}${BEL}`;
}

export function sessionTitle(provider: string, model: string): string {
  return `mcx · ${provider}/${model}`;
}
