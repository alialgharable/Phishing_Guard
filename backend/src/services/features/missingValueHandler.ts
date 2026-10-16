export function markMissing(missing: string[], name: string): void {
  if (!missing.includes(name)) missing.push(name);
}

export function optionalNumber(
  value: number | null | undefined,
  name: string,
  missing: string[],
): number {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    markMissing(missing, name);
    return 0;
  }
  return value;
}

export function optionalBoolean(
  value: boolean | null | undefined,
  name: string,
  missing: string[],
): number {
  if (value === null || value === undefined) {
    markMissing(missing, name);
    return 0;
  }
  return value ? 1 : 0;
}
