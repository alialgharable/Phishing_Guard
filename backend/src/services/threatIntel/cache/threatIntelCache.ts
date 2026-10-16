import { ThreatIntelResult } from "../types";

export interface CachedThreatIntelEntry {
  url: string;
  results: ThreatIntelResult[];
  cachedAt: number;
  expiresAt: number;
}

export class ThreatIntelCache {
  private readonly entries = new Map<string, CachedThreatIntelEntry>();

  get(url: string): ThreatIntelResult[] | null {
    const entry = this.entries.get(url.toLowerCase());
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.entries.delete(url.toLowerCase());
      return null;
    }

    return entry.results;
  }

  set(url: string, results: ThreatIntelResult[], ttlMs = 5 * 60 * 1000): void {
    const now = Date.now();
    this.entries.set(url.toLowerCase(), {
      url: url.toLowerCase(),
      results,
      cachedAt: now,
      expiresAt: now + ttlMs,
    });
  }

  clear(): void {
    this.entries.clear();
  }
}
