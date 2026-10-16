import { FeatureDefinition } from "./types";
import { FEATURE_SCHEMA_VERSION } from "./featureVersion";

const numeric = (
  name: string,
  description: string,
  source: string,
  options: Partial<FeatureDefinition> = {},
): FeatureDefinition => ({
  name,
  type: "numeric",
  description,
  source,
  nullable: false,
  version: FEATURE_SCHEMA_VERSION,
  ...options,
});
const categorical = (
  name: string,
  description: string,
  source: string,
): FeatureDefinition => ({
  name,
  type: "categorical",
  description,
  source,
  nullable: false,
  version: FEATURE_SCHEMA_VERSION,
});
const boolean = (
  name: string,
  description: string,
  source: string,
): FeatureDefinition => ({
  name,
  type: "boolean",
  description,
  source,
  nullable: false,
  version: FEATURE_SCHEMA_VERSION,
  min: 0,
  max: 1,
});

const definitions: FeatureDefinition[] = [
  ...[
    ["url_length", "Normalized URL length"],
    ["hostname_length", "Hostname length"],
    ["path_length", "Path length"],
    ["query_length", "Query length"],
    ["fragment_length", "Fragment length"],
    ["dot_count", "Dot count"],
    ["hyphen_count", "Hyphen count"],
    ["underscore_count", "Underscore count"],
    ["slash_count", "Slash count"],
    ["question_mark_count", "Question mark count"],
    ["ampersand_count", "Ampersand count"],
    ["equals_count", "Equals count"],
    ["percent_count", "Percent count"],
    ["at_symbol_count", "At-symbol count"],
    ["digit_count", "Digit count"],
    ["letter_count", "Letter count"],
    ["special_character_count", "Special-character count"],
    ["subdomain_count", "Subdomain count"],
    ["suspicious_keyword_count", "Suspicious keyword count"],
    ["authentication_keyword_count", "Authentication keyword count"],
    ["financial_keyword_count", "Financial keyword count"],
    ["urgency_keyword_count", "Urgency keyword count"],
    ["url_entropy", "Character entropy of the normalized URL"],
  ].map(([name, description]) => numeric(name, description, "url-analysis")),
  ...[
    ["has_ip_address", "URL uses an IP address"],
    ["has_ipv4", "URL uses IPv4"],
    ["has_ipv6", "URL uses IPv6"],
    ["has_port", "URL has an explicit port"],
    ["has_credentials", "URL contains credentials"],
    ["has_at_symbol", "URL contains an at symbol"],
    ["has_punycode", "Hostname contains punycode"],
    ["protocol_is_https", "Protocol is HTTPS"],
    ["protocol_is_http", "Protocol is HTTP"],
    ["has_fragment", "URL has a fragment"],
    ["has_query", "URL has a query"],
    ["has_path", "URL has a path"],
    ["has_explicit_port", "URL has an explicit port"],
    ["hostname_has_trailing_dot", "Original hostname has a trailing dot"],
    ["contains_unicode", "Hostname contains Unicode"],
    ["contains_mixed_scripts", "Unicode analysis found mixed scripts"],
    [
      "contains_suspicious_unicode",
      "Unicode analysis found suspicious characters",
    ],
    ["contains_homoglyph", "Homoglyph analysis found a possible visual match"],
  ].map(([name, description]) => boolean(name, description, "url-analysis")),
  numeric("punycode_label_count", "Number of punycode labels", "url-analysis"),
  numeric(
    "unicode_label_count",
    "Number of non-ASCII hostname labels",
    "url-analysis",
  ),
  numeric(
    "brand_match_count",
    "Number of Phase 6 brand matches",
    "brand-analysis",
  ),
  numeric(
    "brand_keyword_match_count",
    "Number of brand matches found in keyword or text context",
    "brand-analysis",
  ),
  numeric(
    "max_brand_similarity",
    "Maximum brand similarity",
    "brand-analysis",
    { min: 0, max: 1 },
  ),
  ...[
    "brand_detected",
    "brand_in_hostname",
    "brand_in_path",
    "brand_in_title",
    "brand_in_heading",
    "brand_in_form",
    "brand_domain_mismatch",
  ].map((name) => boolean(name, `Brand feature ${name}`, "brand-analysis")),
  numeric(
    "domain_age_days",
    "Domain age in days when known",
    "domain-intelligence",
  ),
  numeric(
    "domain_age_log",
    "log1p domain age when known",
    "domain-intelligence",
  ),
  ...[
    "domain_age_known",
    "domain_registration_known",
    "domain_expiration_known",
    "nameserver_count",
    "a_record_count",
    "aaaa_record_count",
    "mx_record_count",
    "ns_record_count",
    "txt_record_count",
    "cname_record_count",
    "asn_known",
    "domain_reputation_available",
    "domain_reputation_listed",
    "registrar_present",
    "dns_available",
    "dns_error",
    "privacy_protection_detected",
    "has_private_resolution",
    "has_localhost_resolution",
    "has_suspicious_cname",
  ].map((name) =>
    name.endsWith("_known") ||
    name.startsWith("domain_reputation_") ||
    [
      "asn_known",
      "registrar_present",
      "dns_available",
      "dns_error",
      "privacy_protection_detected",
      "has_private_resolution",
      "has_localhost_resolution",
      "has_suspicious_cname",
    ].includes(name)
      ? boolean(name, `Domain observation ${name}`, "domain-intelligence")
      : numeric(name, `Domain observation ${name}`, "domain-intelligence"),
  ),
  numeric(
    "asn_number",
    "Autonomous system number when known",
    "domain-intelligence",
  ),
  ...[
    "google_webrisk_queried",
    "google_webrisk_listed",
    "phishtank_queried",
    "phishtank_listed",
    "urlhaus_queried",
    "urlhaus_listed",
  ].map((name) =>
    boolean(
      name,
      `Threat-intelligence observation ${name}`,
      "threat-intelligence",
    ),
  ),
  ...[
    "threat_intel_provider_count",
    "threat_intel_queried_count",
    "threat_intel_positive_count",
    "threat_intel_available_count",
  ].map((name) =>
    numeric(name, `Threat-intelligence count ${name}`, "threat-intelligence"),
  ),
  ...[
    "redirect_count",
    "redirect_chain_length",
    "max_redirect_hop_duration_ms",
    "total_redirect_duration_ms",
    "cross_domain_redirect_count",
    "unique_redirect_domain_count",
  ].map((name) =>
    numeric(name, `Redirect observation ${name}`, "redirect-analysis"),
  ),
  ...[
    "redirect_analysis_available",
    "redirect_loop_detected",
    "max_redirects_reached",
    "redirect_error",
    "final_url_changed",
    "final_domain_changed",
    "final_protocol_changed",
    "redirect_http_to_https",
    "redirect_https_to_http",
  ].map((name) =>
    boolean(name, `Redirect observation ${name}`, "redirect-analysis"),
  ),
  ...[
    "content_available",
    "content_type_html",
    "html_parse_success",
    "page_title_present",
    "page_language_present",
    "login_context_detected",
    "credential_collection_context",
    "password_form_detected",
    "external_credential_destination",
    "brand_login_detected",
    "login_brand_domain_mismatch",
    "favicon_present",
    "favicon_external",
    "favicon_domain_matches",
    "favicon_relationship_known",
  ].map((name) =>
    boolean(
      name,
      `Content or brand observation ${name}`,
      name.startsWith("brand") || name.startsWith("login")
        ? "brand-analysis"
        : "content-analysis",
    ),
  ),
  ...[
    "form_count",
    "password_field_count",
    "email_field_count",
    "username_field_count",
    "hidden_field_count",
    "credential_field_count",
    "external_form_count",
    "cross_domain_form_count",
    "http_form_action_count",
    "script_count",
    "inline_script_count",
    "external_script_count",
    "suspicious_script_pattern_count",
    "iframe_count",
    "meta_refresh_count",
    "link_count",
    "external_link_count",
    "resource_count",
    "external_resource_count",
    "unique_external_domain_count",
    "urgency_term_count",
    "authentication_term_count",
    "financial_term_count",
    "credential_recovery_term_count",
  ].map((name) =>
    numeric(
      name,
      `Content or wording observation ${name}`,
      name.includes("term") ? "brand-analysis" : "content-analysis",
    ),
  ),
  ...[
    "external_resource_ratio",
    "external_script_ratio",
    "external_link_ratio",
    "external_form_ratio",
  ].map((name) =>
    numeric(name, `Bounded resource ratio ${name}`, "content-analysis", {
      min: 0,
      max: 1,
    }),
  ),
  ...[
    "urgency_authentication_combination",
    "financial_authentication_combination",
    "credential_recovery_combination",
  ].map((name) =>
    boolean(name, `Contextual wording combination ${name}`, "brand-analysis"),
  ),
  ...[
    "form_same_origin",
    "form_same_registrable_domain",
    "form_official_brand_domain",
    "form_known_third_party",
    "form_external",
    "form_relationship_unknown",
  ].map((name) =>
    numeric(name, `Domain relationship count ${name}`, "brand-analysis"),
  ),
  categorical(
    "page_identity",
    "Categorical page identity detected by Phase 6",
    "brand-analysis",
  ),
];

export const FEATURE_REGISTRY: readonly FeatureDefinition[] =
  Object.freeze(definitions);

export function getFeatureDefinition(
  name: string,
): FeatureDefinition | undefined {
  return FEATURE_REGISTRY.find((definition) => definition.name === name);
}
