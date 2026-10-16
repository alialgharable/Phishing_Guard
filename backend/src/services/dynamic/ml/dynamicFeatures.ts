import { registrableOfUrl } from "../util";
import type { DetonationResult, DynamicEvidence } from "../types";

export function dynamicFeatures(
  result: DetonationResult | null,
  evidence: DynamicEvidence[],
  extra: { certAgeDays?: number | null; clusterSize?: number } = {},
): Record<string, number | null> {
  if (!result) return { dyn_available: 0 };
  const page = registrableOfUrl(result.landingUrl);
  const has = (prefix: string) =>
    evidence.some((item) => item.id.startsWith(prefix)) ? 1 : 0;
  const points = (group: DynamicEvidence["group"]) =>
    evidence
      .filter((item) => item.group === group)
      .reduce((total, item) => total + item.score, 0);
  const thirdParty = result.requests.filter(
    (request) => registrableOfUrl(request.url) !== page,
  );
  return {
    dyn_available: 1,
    dyn_redirects: result.redirectChain.length,
    dyn_req_total: result.requests.length,
    dyn_req_third_party: thirdParty.length,
    dyn_post_third_party: thirdParty.filter(
      (request) => request.method === "POST",
    ).length,
    dyn_ungated_permissions: result.apiEvents.filter((event) => !event.gesture)
      .length,
    dyn_has_password_form: result.forms.some((form) => form.hasPassword)
      ? 1
      : 0,
    dyn_downloads: result.downloads.length,
    dyn_clipboard_command: has("beh.clipboard_command"),
    dyn_bitb: result.bitb ? 1 : 0,
    dyn_js_obfuscated: has("js.obfuscated"),
    dyn_known_exfil_endpoint: has("exfil.endpoint"),
    dyn_cluster_size: extra.clusterSize ?? null,
    dyn_cert_age_days: extra.certAgeDays ?? null,
    dyn_points_behavioral: points("behavioral"),
    dyn_points_exfiltration: points("exfiltration"),
    dyn_points_visual: points("visual"),
    dyn_points_infrastructure: points("infrastructure"),
  };
}
