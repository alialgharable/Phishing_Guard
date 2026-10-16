import { randomBytes } from "node:crypto";
import type { Canary } from "./types";

export function generateCanary(): Canary {
  const id = randomBytes(6).toString("hex");
  return {
    id,
    email: `pg-${id}@example.test`,
    username: `pg_${id}`,
    password: `Pg!${randomBytes(9).toString("base64url")}`,
  };
}

function variants(s: string): { enc: string; v: string }[] {
  const b64 = Buffer.from(s).toString("base64");
  return [
    { enc: "raw", v: s },
    { enc: "url", v: encodeURIComponent(s) },
    { enc: "double-url", v: encodeURIComponent(encodeURIComponent(s)) },
    { enc: "base64", v: b64 },
    { enc: "base64-nopad", v: b64.replace(/=+$/, "") },
    { enc: "base64url", v: Buffer.from(s).toString("base64url") },
    { enc: "hex", v: Buffer.from(s).toString("hex") },
    { enc: "json", v: JSON.stringify(s).slice(1, -1) },
  ];
}

export interface CanaryHit {
  field: "email" | "username" | "password";
  encoding: string;
}

export function findCanary(text: string, c: Canary): CanaryHit[] {
  if (!text) return [];
  const hits: CanaryHit[] = [];
  for (const field of ["email", "username", "password"] as const) {
    for (const { enc, v } of variants(c[field])) {
      if (v.length >= 6 && text.includes(v)) {
        hits.push({ field, encoding: enc });
        break;
      }
    }
  }
  return hits;
}
