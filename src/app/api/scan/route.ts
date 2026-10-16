import { NextResponse } from "next/server";
import { aggregateEvidence } from "@/lib/analyzers/evidence";
import { assess } from "@/lib/analyzers/assessment";
import { classifyResource, resourceEvidence } from "@/lib/analyzers/resource";
import { configuredSandboxAnalyzer } from "@/lib/analyzers/sandbox";
import { threatProviders } from "@/lib/analyzers/threat-intelligence";
import { normalizeUrl, urlAnalysisEvidence } from "@/lib/url/normalizer";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let input: unknown;
  try { input = (await request.json() as { url?: unknown }).url; } catch { return NextResponse.json({ error: "A valid JSON body is required." }, { status: 400 }); }

  const analysis = normalizeUrl(input);
  if (analysis.status === "rejected") {
    return NextResponse.json({ error: analysis.blockingIssues[0]?.message ?? "Enter a valid absolute URL." }, { status: 400 });
  }

  const url = new URL(analysis.href);
  // Lookups never carry user information: pasted credentials must not reach providers.
  const lookupUrl = analysis.lookupHref === url.href ? url : new URL(analysis.lookupHref);
  const resourceType = classifyResource(url);
  const context = { url: lookupUrl, resourceType };
  const [statuses, sandbox] = await Promise.all([
    Promise.all(threatProviders.map((provider) => provider.check(lookupUrl))),
    configuredSandboxAnalyzer().analyze(context),
  ]);
  const evidence = aggregateEvidence([
    ...urlAnalysisEvidence(analysis),
    ...resourceEvidence(resourceType),
    ...sandbox.behaviorObservations,
  ]);
  const riskAssessment = assess(evidence, statuses, sandbox.status === "available");
  return NextResponse.json({
    requestId: crypto.randomUUID(),
    url: url.href,
    requestedUrl: analysis.input,
    urlNormalization: {
      status: analysis.status,
      canonicalHostname: analysis.canonicalHostname,
      issues: [...analysis.ambiguousIssues, ...analysis.contextIssues],
    },
    resourceType,
    sandbox,
    riskAssessment,
  });
}
