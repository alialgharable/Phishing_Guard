import { NextResponse } from "next/server";
import { aggregateEvidence } from "@/lib/analyzers/evidence";
import { assess } from "@/lib/analyzers/assessment";
import { classifyResource, resourceEvidence } from "@/lib/analyzers/resource";
import { UnavailableSandboxAnalyzer } from "@/lib/analyzers/sandbox";
import { threatProviders } from "@/lib/analyzers/threat-intelligence";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let input: unknown;
  try { input = (await request.json() as { url?: unknown }).url; } catch { return NextResponse.json({ error: "A valid JSON body is required." }, { status: 400 }); }
  if (typeof input !== "string" || !input.trim()) return NextResponse.json({ error: "Enter a URL to analyze." }, { status: 400 });
  let url: URL;
  try { url = new URL(input.trim()); } catch { return NextResponse.json({ error: "Enter a valid absolute URL." }, { status: 400 }); }
  if (!["http:", "https:"].includes(url.protocol)) return NextResponse.json({ error: "Only HTTP and HTTPS URLs are accepted." }, { status: 400 });

  const resourceType = classifyResource(url);
  const context = { url, resourceType };
  const [statuses, sandbox] = await Promise.all([
    Promise.all(threatProviders.map((provider) => provider.check(url))),
    new UnavailableSandboxAnalyzer().analyze(context),
  ]);
  const evidence = aggregateEvidence(resourceEvidence(resourceType));
  const riskAssessment = assess(evidence, statuses, sandbox.status === "available");
  return NextResponse.json({ requestId: crypto.randomUUID(), url: url.href, resourceType, sandbox, riskAssessment });
}
