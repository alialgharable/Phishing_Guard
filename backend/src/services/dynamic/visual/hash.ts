export function hamming64(a: string, b: string): number {
  let value = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;
  while (value) {
    count += Number(value & 1n);
    value >>= 1n;
  }
  return count;
}

export function toHex64(value: bigint): string {
  return value.toString(16).padStart(16, "0");
}
