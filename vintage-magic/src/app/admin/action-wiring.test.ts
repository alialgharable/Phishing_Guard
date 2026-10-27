import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A wiring test for the admin panel, because this class of mistake survives `tsc`.
 *
 * A `<form action={…}>` in a server page must receive a *server action reference*: an inline arrow
 * (`action={(formData) => doSomething(...)}`) type-checks and then throws in the browser at render
 * time - "Functions cannot be passed directly to Client Components". So every action used in the
 * admin tree is asserted to be a bare identifier naming an exported server action.
 */

const ROOT = path.join(process.cwd(), "src", "app", "admin");
const ACTIONS_MODULE = path.join(process.cwd(), "src", "app", "admin", "actions.ts");

function sources(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...sources(full));
    // Only pages and panels wire form actions; the actions module itself declares them.
    else if (full.endsWith(".tsx")) found.push(full);
  }
  return found;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

describe("admin form wiring", () => {
  const exported = new Set(
    [...readFileSync(ACTIONS_MODULE, "utf8").matchAll(/^export async function (\w+)/gm)].map((match) => match[1]),
  );

  it("knows the server actions the module exposes", () => {
    expect(exported.size).toBeGreaterThan(6);
    expect(exported.has("deleteProductFormAction")).toBe(true);
  });

  it("passes real server actions, never inline closures, to every admin form", () => {
    const files = sources(ROOT);
    expect(files.length).toBeGreaterThan(4);
    for (const file of files) {
      const source = stripComments(readFileSync(file, "utf8"));
      for (const match of source.matchAll(/action=\{([\s\S]{0,120}?)\}/g)) {
        const expression = match[1]!.trim();
        const label = `${path.relative(process.cwd(), file)}: action={${expression.slice(0, 40)}}`;
        expect(expression, label).toMatch(/^[A-Za-z_$][\w$]*$/);
        expect(exported.has(expression), label).toBe(true);
      }
    }
  });
});
