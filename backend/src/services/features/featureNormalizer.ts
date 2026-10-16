export function booleanToNumber(value: boolean): number {
  return value ? 1 : 0;
}
export function boundedRatio(numerator: number, denominator: number): number {
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator <= 0
  )
    return 0;
  return Math.min(Math.max(numerator / denominator, 0), 1);
}
export function safeLog1p(value: number): number {
  return Number.isFinite(value) && value >= 0
    ? Math.log1p(Math.min(value, Number.MAX_SAFE_INTEGER))
    : 0;
}
export function boundedSimilarity(value: number | null | undefined): number {
  return value !== null && value !== undefined && Number.isFinite(value)
    ? Math.min(Math.max(value, 0), 1)
    : 0;
}
