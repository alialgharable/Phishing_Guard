import { getDomain } from "tldts";
import { FEATURE_REGISTRY } from "./featureRegistry";
import { FEATURE_SCHEMA_VERSION } from "./featureVersion";
import {
  boundedRatio,
  boundedSimilarity,
  safeLog1p,
} from "./featureNormalizer";
import { markMissing } from "./missingValueHandler";
import { FeatureAnalysisInput, FeatureVector } from "./types";
import { RedirectAnalysisResult } from "../redirects/types";

export function extractFeatures(input: FeatureAnalysisInput): FeatureVector {
  const features: Record<string, number> = {};
  const categorical: Record<string, string> = {};
  const missing: string[] = [];
  const set = (name: string, value: number): void => {
    features[name] = Number.isFinite(value) ? value : 0;
  };
  for (const definition of FEATURE_REGISTRY)
    if (definition.type !== "categorical") set(definition.name, 0);
  const sourceAvailability = {
    url: Boolean(input.urlAnalysis),
    threat_intelligence: Boolean(input.threatIntelligence),
    domain: Boolean(input.domainIntelligence),
    redirects: Boolean(input.redirectAnalysis),
    content: Boolean(input.contentAnalysis?.fetched),
    brand: Boolean(input.brandAnalysis),
  };
  const markSourceMissing = (source: string): void =>
    FEATURE_REGISTRY.filter(
      (definition) =>
        definition.source === source && definition.type !== "categorical",
    ).forEach((definition) => markMissing(missing, definition.name));

  const url = input.urlAnalysis;
  if (url) {
    const n = url.normalized;
    const f = url.features;
    const values: Record<string, number> = {
      url_length: f.urlLength,
      hostname_length: f.hostnameLength,
      path_length: f.pathLength,
      query_length: f.queryLength,
      fragment_length: n.fragment.length,
      dot_count: f.dotCount,
      hyphen_count: f.hyphenCount,
      underscore_count: f.underscoreCount,
      slash_count: f.slashCount,
      question_mark_count: f.questionMarkCount,
      ampersand_count: f.ampersandCount,
      equals_count: f.equalsCount,
      percent_count: f.percentCount,
      at_symbol_count: f.atSymbolCount,
      digit_count: f.digitCount,
      letter_count: f.letterCount,
      special_character_count: f.specialCharacterCount,
      subdomain_count: f.subdomainCount,
      suspicious_keyword_count: f.suspiciousKeywordCount,
      authentication_keyword_count: f.authenticationKeywordCount,
      financial_keyword_count: f.financialKeywordCount,
      urgency_keyword_count: f.urgencyKeywordCount,
      url_entropy: f.entropy,
      has_ip_address: bool(f.hasIpAddress),
      has_ipv4: bool(n.isIPv4),
      has_ipv6: bool(n.isIPv6),
      has_port: bool(f.hasPort),
      has_credentials: bool(f.hasCredentials),
      has_at_symbol: bool(f.hasAtSymbol),
      has_punycode: bool(n.isPunycode),
      protocol_is_https: bool(n.protocol === "https"),
      protocol_is_http: bool(n.protocol === "http"),
      has_fragment: bool(Boolean(n.fragment)),
      has_query: bool(Boolean(n.query)),
      has_path: bool(Boolean(n.pathname && n.pathname !== "/")),
      has_explicit_port: bool(n.port !== null),
      hostname_has_trailing_dot: bool(
        /\.$/.test(n.original.split(/[/?#]/)[2] ?? ""),
      ),
      contains_unicode: bool(url.unicode.containsUnicode),
      contains_mixed_scripts: bool(url.unicode.hasMixedScripts),
      contains_suspicious_unicode: bool(
        url.unicode.suspiciousCharacters.length > 0,
      ),
      contains_homoglyph: bool(url.homoglyph.detected),
      punycode_label_count: countPunycode(n.hostname),
      unicode_label_count: countUnicodeLabels(n.hostname),
    };
    for (const [name, value] of Object.entries(values)) set(name, value);
  } else markSourceMissing("url-analysis");

  const domain = input.domainIntelligence;
  if (domain) {
    const age = domain.age?.domainAgeDays;
    if (age === null || age === undefined || age < 0) {
      markMissing(missing, "domain_age_days");
      markMissing(missing, "domain_age_log");
      markMissing(missing, "domain_age_known");
    } else {
      set("domain_age_days", age);
      set("domain_age_log", safeLog1p(age));
      set("domain_age_known", 1);
    }
    const registration = domain.registration;
    set("domain_registration_known", registration ? 1 : 0);
    set("domain_expiration_known", registration?.expirationDate ? 1 : 0);
    set("registrar_present", registration?.registrar ? 1 : 0);
    const dns = domain.dns;
    const dnsFailed = domain.errors.some((error) => error.service === "dns");
    set("dns_available", bool(!dnsFailed));
    set("dns_error", bool(dnsFailed));
    set("nameserver_count", dns.ns.length);
    set("a_record_count", dns.a.length);
    set("aaaa_record_count", dns.aaaa.length);
    set("mx_record_count", dns.mx.length);
    set("ns_record_count", dns.ns.length);
    set("txt_record_count", dns.txt.length);
    set("cname_record_count", dns.cname ? 1 : 0);
    set(
      "has_private_resolution",
      bool(dns.signals.includes("private-address-resolution")),
    );
    set(
      "has_localhost_resolution",
      bool(dns.signals.includes("localhost-resolution")),
    );
    set("has_suspicious_cname", bool(dns.signals.includes("suspicious-cname")));
    if (domain.asn?.asn === null || domain.asn?.asn === undefined) {
      set("asn_known", 0);
      markMissing(missing, "asn_number");
    } else {
      set("asn_known", 1);
      set("asn_number", domain.asn.asn);
    }
    set("domain_reputation_available", domain.reputation !== null ? 1 : 0);
    if (domain.reputation?.listed === null || domain.reputation === null)
      markMissing(missing, "domain_reputation_listed");
    else set("domain_reputation_listed", domain.reputation.listed ? 1 : 0);
    markMissing(missing, "privacy_protection_detected");
  } else markSourceMissing("domain-intelligence");

  const intel = input.threatIntelligence;
  if (intel) {
    set("threat_intel_provider_count", intel.providerCount);
    set("threat_intel_queried_count", intel.queriedCount);
    set(
      "threat_intel_positive_count",
      intel.results.filter((result) => result.queried && result.listed).length,
    );
    set(
      "threat_intel_available_count",
      intel.results.filter((result) => result.queried).length,
    );
    for (const result of intel.results) {
      const name = providerName(result.provider);
      if (name === "unknown_provider") continue;
      set(`${name}_queried`, bool(result.queried));
      if (result.queried) set(`${name}_listed`, bool(result.listed));
      else markMissing(missing, `${name}_listed`);
    }
  } else markSourceMissing("threat-intelligence");

  const redirects = input.redirectAnalysis;
  if (redirects) {
    set("redirect_count", redirects.redirectCount);
    set("redirect_chain_length", redirects.hops.length);
    set("redirect_analysis_available", 1);
    set("redirect_loop_detected", bool(redirects.loopDetected));
    set("max_redirects_reached", bool(redirects.maxRedirectsReached));
    set("redirect_error", bool(redirects.errors.length > 0));
    set(
      "cross_domain_redirect_count",
      countCrossDomainRedirects(redirects.hops),
    );
    set(
      "unique_redirect_domain_count",
      new Set(redirects.hops.map((hop) => hop.hostname).filter(Boolean)).size,
    );
    set(
      "max_redirect_hop_duration_ms",
      Math.max(0, ...redirects.hops.map((hop) => hop.durationMs ?? 0)),
    );
    set(
      "total_redirect_duration_ms",
      redirects.hops.reduce((sum, hop) => sum + (hop.durationMs ?? 0), 0),
    );
    const first = redirects.originalUrl;
    const final = redirects.finalUrl;
    set("final_url_changed", bool(Boolean(final && final !== first)));
    set(
      "final_domain_changed",
      bool(
        Boolean(
          final &&
          getDomain(new URL(first).hostname) !==
            getDomain(new URL(final).hostname),
        ),
      ),
    );
    set(
      "final_protocol_changed",
      bool(
        Boolean(final && new URL(first).protocol !== new URL(final).protocol),
      ),
    );
    set(
      "redirect_http_to_https",
      bool(
        redirects.hops.some(
          (hop, index) =>
            index > 0 &&
            redirects.hops[index - 1].protocol === "http" &&
            hop.protocol === "https",
        ),
      ),
    );
    set(
      "redirect_https_to_http",
      bool(
        redirects.hops.some(
          (hop, index) =>
            index > 0 &&
            redirects.hops[index - 1].protocol === "https" &&
            hop.protocol === "http",
        ),
      ),
    );
  } else markSourceMissing("redirect-analysis");

  const content = input.contentAnalysis;
  if (content) {
    set("content_available", bool(content.fetched));
    set(
      "content_type_html",
      bool(Boolean(content.contentType && /html/i.test(content.contentType))),
    );
    set(
      "html_parse_success",
      bool(content.fetched && content.errors.length === 0),
    );
    set("page_title_present", bool(Boolean(content.title)));
    set("page_language_present", bool(Boolean(content.language)));
    set("form_count", content.forms.length);
    set(
      "password_field_count",
      content.forms.reduce((sum, form) => sum + form.passwordInputCount, 0),
    );
    set(
      "email_field_count",
      content.forms.reduce((sum, form) => sum + form.emailInputCount, 0),
    );
    set(
      "username_field_count",
      content.forms.filter((form) => form.hasCredentialLikeFields).length,
    );
    set(
      "hidden_field_count",
      content.forms.reduce((sum, form) => sum + form.hiddenInputCount, 0),
    );
    set(
      "credential_field_count",
      content.forms.filter((form) => form.hasCredentialLikeFields).length,
    );
    set(
      "external_form_count",
      content.forms.filter((form) => form.externalAction).length,
    );
    set(
      "cross_domain_form_count",
      content.forms.filter((form) => form.sameOrigin === false).length,
    );
    set(
      "http_form_action_count",
      content.forms.filter((form) =>
        Boolean(form.action?.startsWith("http://")),
      ).length,
    );
    set("script_count", content.scripts.length);
    set(
      "inline_script_count",
      content.scripts.filter((script) => script.inline).length,
    );
    set(
      "external_script_count",
      content.scripts.filter((script) => script.external).length,
    );
    set(
      "suspicious_script_pattern_count",
      content.scripts.reduce(
        (sum, script) => sum + script.suspiciousPatterns.length,
        0,
      ),
    );
    set("iframe_count", content.html.iframeCount);
    set("meta_refresh_count", content.html.metaRefreshDetected ? 1 : 0);
    set("link_count", content.links.length);
    set(
      "external_link_count",
      content.links.filter((link) => link.external).length,
    );
    set("resource_count", content.resources.length);
    set(
      "external_resource_count",
      content.resources.filter((resource) => resource.external).length,
    );
    set(
      "unique_external_domain_count",
      new Set(
        content.resources
          .filter((resource) => resource.external && resource.domain)
          .map((resource) => resource.domain),
      ).size,
    );
    set(
      "external_resource_ratio",
      boundedRatio(
        content.resources.filter((resource) => resource.external).length,
        content.resources.length,
      ),
    );
    set(
      "external_script_ratio",
      boundedRatio(
        content.scripts.filter((script) => script.external).length,
        content.scripts.length,
      ),
    );
    set(
      "external_link_ratio",
      boundedRatio(
        content.links.filter((link) => link.external).length,
        content.links.length,
      ),
    );
    set(
      "external_form_ratio",
      boundedRatio(
        content.forms.filter((form) => form.externalAction).length,
        content.forms.length,
      ),
    );
  } else markSourceMissing("content-analysis");

  const brand = input.brandAnalysis;
  if (brand) {
    const matches = brand.matches;
    set("brand_match_count", matches.length);
    set(
      "brand_keyword_match_count",
      matches.filter((match) => match.matchType === "keyword").length,
    );
    set(
      "max_brand_similarity",
      boundedSimilarity(
        Math.max(0, ...matches.map((match) => match.similarity ?? 0)),
      ),
    );
    set("brand_detected", bool(matches.length > 0));
    set(
      "brand_in_hostname",
      bool(
        matches.some(
          (match) =>
            match.matchedLocations.includes("hostname") ||
            match.matchedLocations.includes("registrable-domain"),
        ),
      ),
    );
    set(
      "brand_in_path",
      bool(matches.some((match) => match.matchedLocations.includes("path"))),
    );
    set(
      "brand_in_title",
      bool(matches.some((match) => match.matchedLocations.includes("title"))),
    );
    set(
      "brand_in_heading",
      bool(matches.some((match) => match.matchedLocations.includes("heading"))),
    );
    set(
      "brand_in_form",
      bool(
        matches.some((match) => match.matchedLocations.includes("form-label")),
      ),
    );
    set(
      "brand_domain_mismatch",
      bool(
        brand.evidence.some(
          (evidence) => evidence.type === "brand-domain-mismatch",
        ),
      ),
    );
    set("login_context_detected", bool(brand.loginContext.loginOriented));
    set(
      "credential_collection_context",
      bool(brand.loginContext.credentialCollection),
    );
    set(
      "password_form_detected",
      bool(brand.loginContext.passwordFieldCount > 0),
    );
    set(
      "external_credential_destination",
      bool(
        brand.loginContext.credentialCollection &&
          brand.loginContext.externalFormCount > 0,
      ),
    );
    set(
      "brand_login_detected",
      bool(matches.length > 0 && brand.loginContext.loginOriented),
    );
    set(
      "login_brand_domain_mismatch",
      bool(
        matches.length > 0 &&
          brand.loginContext.loginOriented &&
          brand.evidence.some(
            (evidence) => evidence.type === "brand-domain-mismatch",
          ),
      ),
    );
    set("favicon_present", bool(brand.faviconAnalysis.url !== null));
    set("favicon_external", bool(brand.faviconAnalysis.external));
    set(
      "favicon_domain_matches",
      bool(brand.faviconAnalysis.sameOrigin === true),
    );
    set(
      "favicon_relationship_known",
      bool(brand.faviconAnalysis.sameOrigin !== null),
    );
    categorical.page_identity = brand.pageIdentity.category;
    const textSignals = new Set(
      brand.contextualSignals.flatMap((signal) => signal.indicators),
    );
    set("urgency_term_count", textSignals.has("urgency wording") ? 1 : 0);
    set(
      "authentication_term_count",
      textSignals.has("authentication wording") ? 1 : 0,
    );
    set("financial_term_count", textSignals.has("financial wording") ? 1 : 0);
    set(
      "credential_recovery_term_count",
      textSignals.has("credential recovery wording") ? 1 : 0,
    );
    set(
      "urgency_authentication_combination",
      bool(
        brand.contextualSignals.some(
          (signal) => signal.type === "urgent-authentication",
        ),
      ),
    );
    set(
      "financial_authentication_combination",
      bool(
        brand.contextualSignals.some(
          (signal) => signal.type === "financial-authentication",
        ),
      ),
    );
    set(
      "credential_recovery_combination",
      bool(
        brand.contextualSignals.some(
          (signal) => signal.type === "credential-recovery",
        ),
      ),
    );
    for (const relationship of brand.domainRelationships) {
      const key =
        relationship.relationship === "same-origin"
          ? "form_same_origin"
          : relationship.relationship === "same-registrable-domain"
            ? "form_same_registrable_domain"
            : relationship.relationship === "official-brand-domain"
              ? "form_official_brand_domain"
              : relationship.relationship === "known-third-party"
                ? "form_known_third_party"
                : relationship.relationship === "external"
                  ? "form_external"
                  : "form_relationship_unknown";
      set(key, features[key] + 1);
    }
  } else {
    markSourceMissing("brand-analysis");
    markMissing(missing, "page_identity");
  }
  return {
    version: FEATURE_SCHEMA_VERSION,
    features: orderedFeatures(features),
    categorical,
    missing: missing.sort(),
    sourceAvailability,
  };
}

function orderedFeatures(
  features: Record<string, number>,
): Record<string, number> {
  return Object.fromEntries(
    FEATURE_REGISTRY.filter(
      (definition) => definition.type !== "categorical",
    ).map((definition) => [definition.name, features[definition.name] ?? 0]),
  );
}
function bool(value: boolean): number {
  return value ? 1 : 0;
}
function countPunycode(hostname: string): number {
  return hostname
    .split(".")
    .filter((label) => label.toLowerCase().startsWith("xn--")).length;
}
function countUnicodeLabels(hostname: string): number {
  return hostname.split(".").filter((label) => /[^\u0000-\u007F]/.test(label))
    .length;
}
function providerName(provider: string): string {
  const value = provider.toLowerCase();
  if (value.includes("google")) return "google_webrisk";
  if (value.includes("phishtank")) return "phishtank";
  if (value.includes("urlhaus")) return "urlhaus";
  return "unknown_provider";
}
function countCrossDomainRedirects(
  hops: RedirectAnalysisResult["hops"],
): number {
  let count = 0;
  for (let index = 1; index < hops.length; index += 1) {
    const previous = hops[index - 1].hostname;
    const current = hops[index].hostname;
    if (previous && current && getDomain(previous) !== getDomain(current))
      count += 1;
  }
  return count;
}
