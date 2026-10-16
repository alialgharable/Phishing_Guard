import {
  DomainAgeInfo,
  RegistrationInfo,
  RDAPLookupResult,
  RDAPServiceOptions,
} from "./types";

interface RDAPEntity {
  roles?: unknown;
  vcardArray?: unknown;
  handle?: unknown;
}

interface RDAPPayload {
  events?: unknown;
  entities?: unknown;
  ldhName?: unknown;
  name?: unknown;
  status?: unknown;
  nameservers?: unknown;
  links?: unknown;
}

function eventDate(payload: RDAPPayload, eventAction: string): string | null {
  if (!Array.isArray(payload.events)) return null;
  const event = payload.events.find((item) => {
    const candidate = item as Record<string, unknown>;
    return (
      candidate.eventAction === eventAction &&
      typeof candidate.eventDate === "string"
    );
  }) as Record<string, unknown> | undefined;
  return typeof event?.eventDate === "string" ? event.eventDate : null;
}

function entityName(entity: RDAPEntity): string | null {
  if (
    !Array.isArray(entity.vcardArray) ||
    entity.vcardArray.length < 2 ||
    !Array.isArray(entity.vcardArray[1])
  )
    return null;
  const fields = entity.vcardArray[1] as unknown[];
  const fn = fields.find(
    (field) => Array.isArray(field) && field[0] === "fn",
  ) as unknown[] | undefined;
  return typeof fn?.[3] === "string" ? fn[3] : null;
}

function entityWithRole(payload: RDAPPayload, role: string): RDAPEntity | null {
  if (!Array.isArray(payload.entities)) return null;
  return (
    (payload.entities as RDAPEntity[]).find(
      (entity) => Array.isArray(entity.roles) && entity.roles.includes(role),
    ) ?? null
  );
}

function nameserverNames(payload: RDAPPayload): string[] {
  if (!Array.isArray(payload.nameservers)) return [];
  return payload.nameservers
    .map((item) => (item as Record<string, unknown>).ldhName)
    .filter((name): name is string => typeof name === "string")
    .map((name) => name.toLowerCase());
}

export function calculateDomainAge(
  creationDate: string | null,
  now = new Date(),
): DomainAgeInfo {
  if (!creationDate)
    return {
      creationDate: null,
      domainAgeDays: null,
      domainAgeMonths: null,
      domainAgeYears: null,
    };
  const created = new Date(creationDate);
  if (Number.isNaN(created.getTime()) || created.getTime() > now.getTime()) {
    return {
      creationDate,
      domainAgeDays: null,
      domainAgeMonths: null,
      domainAgeYears: null,
    };
  }
  const domainAgeDays = Math.floor(
    (now.getTime() - created.getTime()) / 86_400_000,
  );
  return {
    creationDate,
    domainAgeDays,
    domainAgeMonths: Math.floor(domainAgeDays / 30.4375),
    domainAgeYears: Math.floor(domainAgeDays / 365.25),
  };
}

export class RDAPService {
  private readonly fetcher: typeof fetch;
  private readonly bootstrapUrl: string;

  constructor(options: RDAPServiceOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.bootstrapUrl = options.bootstrapUrl ?? "https://rdap.org/domain/";
  }

  public async lookup(domain: string): Promise<RDAPLookupResult> {
    const sourceUrl = `${this.bootstrapUrl}${encodeURIComponent(domain)}`;
    const response = await this.fetcher(sourceUrl, {
      headers: { Accept: "application/rdap+json, application/json" },
    });
    if (!response.ok)
      throw new Error(`RDAP request failed with status ${response.status}`);
    const payload = (await response.json()) as RDAPPayload;
    const creationDate = eventDate(payload, "registration");
    const registration: RegistrationInfo = {
      registrar: entityName(entityWithRole(payload, "registrar") ?? {}),
      registry:
        entityName(entityWithRole(payload, "registries") ?? {}) ??
        (typeof payload.name === "string" ? payload.name : null),
      status: Array.isArray(payload.status)
        ? payload.status.filter(
            (value): value is string => typeof value === "string",
          )
        : [],
      creationDate,
      expirationDate: eventDate(payload, "expiration"),
      updatedDate:
        eventDate(payload, "last changed") ?? eventDate(payload, "last update"),
      nameservers: nameserverNames(payload),
      country: null,
    };
    return { registration, age: calculateDomainAge(creationDate), sourceUrl };
  }
}
