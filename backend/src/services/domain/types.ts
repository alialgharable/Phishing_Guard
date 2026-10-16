import { Evidence } from "../url/types";

export interface DomainAgeInfo {
  creationDate: string | null;
  domainAgeDays: number | null;
  domainAgeMonths: number | null;
  domainAgeYears: number | null;
}

export interface RegistrationInfo {
  registrar: string | null;
  registry: string | null;
  status: string[];
  creationDate: string | null;
  expirationDate: string | null;
  updatedDate: string | null;
  nameservers: string[];
  country: string | null;
}

export interface DNSAnalysis {
  a: string[];
  aaaa: string[];
  mx: string[];
  ns: string[];
  txt: string[];
  spf: string[];
  cname: string | null;
  hasARecord: boolean;
  hasAAAARecord: boolean;
  hasMXRecord: boolean;
  hasNSRecord: boolean;
  hasTXTRecord: boolean;
  signals: DNSSecuritySignal[];
}

export type DNSSecuritySignal =
  | "no-a-record"
  | "no-aaaa-record"
  | "many-a-records"
  | "many-ns-records"
  | "suspicious-cname"
  | "localhost-resolution"
  | "private-address-resolution";

export interface ASNInfo {
  asn: number | null;
  organization: string | null;
  country: string | null;
  source: string | null;
  ip: string | null;
}

export interface ReputationInfo {
  provider: string;
  listed: boolean | null;
  category: string | null;
  sourceUrl: string | null;
  details: string | null;
}

export interface DomainServiceError {
  service: "rdap" | "dns" | "asn" | "reputation" | "cache" | "validation";
  message: string;
  retryable: boolean;
}

export interface DomainAnalysisResult {
  domain: string;
  valid: boolean;
  age: DomainAgeInfo | null;
  registration: RegistrationInfo | null;
  dns: DNSAnalysis;
  asn: ASNInfo | null;
  reputation: ReputationInfo | null;
  evidence: Evidence[];
  errors: DomainServiceError[];
}

export interface RDAPLookupResult {
  registration: RegistrationInfo | null;
  age: DomainAgeInfo | null;
  sourceUrl: string;
}

export interface RDAPServiceOptions {
  fetcher?: typeof fetch;
  bootstrapUrl?: string;
}

export interface DNSServiceOptions {
  resolver?: {
    resolve4(hostname: string): Promise<string[]>;
    resolve6(hostname: string): Promise<string[]>;
    resolveMx(
      hostname: string,
    ): Promise<Array<{ exchange: string; priority: number }>>;
    resolveNs(hostname: string): Promise<string[]>;
    resolveTxt(hostname: string): Promise<string[][]>;
    resolveCname(hostname: string): Promise<string[]>;
  };
}

export interface ASNServiceOptions {
  fetcher?: typeof fetch;
  endpoint?: string;
}

export interface ReputationServiceOptions {
  fetcher?: typeof fetch;
  endpoint?: string;
  provider?: string;
}
