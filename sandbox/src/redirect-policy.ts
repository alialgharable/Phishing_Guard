import { validateDestination, type DestinationValidation, type Resolver } from "./network-policy.js";

export async function validateRedirectTarget(
  currentUrl: string,
  location: string,
  options: { resolver?: Resolver; extraBlockedCidrs?: string[]; allowedProtocols?: Set<string> } = {},
): Promise<DestinationValidation & { targetUrl?: string }> {
  try {
    const target = new URL(location, currentUrl);
    const result = await validateDestination(target, options);
    return { ...result, targetUrl: target.href };
  } catch {
    return { allowed: false, reason: "invalid redirect location", hostname: "", addresses: [] };
  }
}
