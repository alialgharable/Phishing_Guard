import { registrableOfUrl } from "../util";
import type { CapturedRequest, DynamicEvidence } from "../types";

type EndpointKind = "chat-webhook" | "form-service" | "tunnel" | "mailer";
interface Endpoint {
  name: string;
  kind: EndpointKind;
  score: number;
  test: (url: URL) => boolean;
}
const host = (value: string | RegExp) => (url: URL) =>
  typeof value === "string" ? url.hostname === value : value.test(url.hostname);
const ENDPOINTS: Endpoint[] = [
  {
    name: "Telegram Bot API",
    kind: "chat-webhook",
    score: 40,
    test: (url) =>
      url.hostname === "api.telegram.org" && /^\/bot\d+:/.test(url.pathname),
  },
  {
    name: "Discord webhook",
    kind: "chat-webhook",
    score: 40,
    test: (url) =>
      /(^|\.)discord(app)?\.com$/.test(url.hostname) &&
      url.pathname.includes("/webhooks/"),
  },
  {
    name: "Formspree",
    kind: "form-service",
    score: 25,
    test: host("formspree.io"),
  },
  { name: "EmailJS", kind: "mailer", score: 30, test: host("api.emailjs.com") },
  {
    name: "Request catcher",
    kind: "tunnel",
    score: 30,
    test: host(/(^|\.)webhook\.site$|\.ngrok(-free)?\.(io|app|dev)$/),
  },
];

export interface ExfilResult {
  evidence: DynamicEvidence[];
  knownExfilDomains: Set<string>;
}

export function classifyExfil(
  requests: CapturedRequest[],
  pageDomain: string,
): ExfilResult {
  const evidence: DynamicEvidence[] = [];
  const knownExfilDomains = new Set<string>();
  for (const request of requests) {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      continue;
    }
    const endpoint = ENDPOINTS.find((candidate) => candidate.test(url));
    if (!endpoint || !request.postData) continue;
    const domain = registrableOfUrl(request.url);
    if (!domain || domain === pageDomain) continue;
    knownExfilDomains.add(domain);
    evidence.push({
      id: `exfil.endpoint.${endpoint.kind}`,
      group: "exfiltration",
      score: endpoint.score,
      hard: endpoint.kind === "chat-webhook",
      description: `Page sent data to ${endpoint.name}`,
      data: { host: url.hostname },
    });
  }
  return { evidence, knownExfilDomains };
}
