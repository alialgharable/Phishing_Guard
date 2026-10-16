import { DomainAnalysisResult } from "./types";

export class DomainCache {
  private readonly entries = new Map<
    string,
    { result: DomainAnalysisResult; expiresAt: number }
  >();

  public get(domain: string): DomainAnalysisResult | null {
    const entry = this.entries.get(domain.toLowerCase());
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.entries.delete(domain.toLowerCase());
      return null;
    }
    return entry.result;
  }

  public set(
    domain: string,
    result: DomainAnalysisResult,
    ttlMs = 5 * 60 * 1000,
  ): void {
    this.entries.set(domain.toLowerCase(), {
      result,
      expiresAt: Date.now() + ttlMs,
    });
  }

  public clear(): void {
    this.entries.clear();
  }
}
