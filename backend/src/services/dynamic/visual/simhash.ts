import { toHex64 } from "./hash";

function fnv1a64(value: string): bigint {
  let hash = 0xcbf29ce484222325n;
  for (const character of value) {
    hash ^= BigInt(character.charCodeAt(0));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash;
}

export function domSimhash(html: string): string {
  const clean = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "<script></script>")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "<style></style>");
  const tokens = [...clean.matchAll(/<([a-z][a-z0-9-]*)((?:\s[^>]*)?)>/gi)].map(
    (match) => {
      const className = /class\s*=\s*["']([^"']*)/i.exec(match[2] ?? "");
      return (
        match[1].toLowerCase() +
        (className
          ? `.${className[1].trim().split(/\s+/).sort().join(".")}`
          : "")
      );
    },
  );
  const votes = new Array<number>(64).fill(0);
  for (let index = 0; index + 3 <= tokens.length; index += 1) {
    const hash = fnv1a64(tokens.slice(index, index + 3).join(">"));
    for (let bit = 0; bit < 64; bit += 1)
      votes[bit] += (hash >> BigInt(bit)) & 1n ? 1 : -1;
  }
  let result = 0n;
  votes.forEach((vote, bit) => {
    if (vote > 0) result |= 1n << BigInt(bit);
  });
  return toHex64(result);
}
