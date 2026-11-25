import dns from 'node:dns/promises';
import { normalizeTldValue } from '../types/admin.ts';

export type DomainAvailabilityStatus = 'available' | 'registered' | 'unknown';

export interface DomainCheckItemResult {
  domain: string;
  sld: string;
  tld: string;
  status: DomainAvailabilityStatus;
  source: 'rdap+dns' | 'rdap' | 'dns';
  registrarHint: string;
  expiresAt: string;
  isPrimaryMatch: boolean;
  isSuggestion: boolean;
  checkedAtMs: number;
}

export interface DomainSearchResponse {
  query: string;
  sld: string;
  primaryTld: string;
  primaryResult: DomainCheckItemResult;
  extensionResults: DomainCheckItemResult[];
  suggestions: DomainCheckItemResult[];
  checkedAtMs: number;
}

const SLD_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export const SUPPORTED_CHECK_TLDS = new Set<string>([
  '.com',
  '.id',
  '.my.id',
  '.co.id',
  '.web.id',
  '.biz.id',
  '.net',
  '.org',
  '.io',
  '.dev',
  '.ai',
  '.xyz',
  '.site',
  '.online',
  '.blog',
  '.store',
  '.info',
  '.me',
  '.co',
  '.app',
  '.tech',
]);

function getRdapEndpointForDomain(domain: string, tld: string): string {
  const encoded = encodeURIComponent(domain);
  if (tld === '.com') return `https://rdap.verisign.com/com/v1/domain/${encoded}`;
  if (tld === '.net') return `https://rdap.verisign.com/net/v1/domain/${encoded}`;
  if (tld === '.org') return `https://rdap.publicinterestregistry.org/rdap/domain/${encoded}`;
  if (tld === '.id' || tld.endsWith('.id')) return `https://rdap.pandi.id/rdap/domain/${encoded}`;
  return `https://rdap.org/domain/${encoded}`;
}

export function parseDomainSearchQuery(
  rawQuery: string,
  fallbackTlds: string[] = ['.com', '.id', '.my.id', '.net', '.org']
): { sld: string; primaryTld: string } {
  let clean = String(rawQuery || '').trim().toLowerCase();
  clean = clean.replace(/^https?:\/\//i, '');
  clean = clean.split('/')[0] || '';
  clean = clean.split('?')[0] || '';
  clean = clean.split('#')[0] || '';
  clean = clean.replace(/^www\./i, '');
  clean = clean.replace(/:\d+$/, '');

  // Check if user already typed a TLD like "namablog.my.id" or "namablog.com"
  const parts = clean.split('.').filter(Boolean);
  let rawSld = clean;
  let detectedTld = '';

  if (parts.length >= 3) {
    const multiTld = normalizeTldValue(`${parts[parts.length - 2]}.${parts[parts.length - 1]}`);
    if (multiTld && SUPPORTED_CHECK_TLDS.has(multiTld)) {
      detectedTld = multiTld;
      rawSld = parts[parts.length - 3] || parts[0] || '';
    }
  }
  if (!detectedTld && parts.length >= 2) {
    const singleTld = normalizeTldValue(parts[parts.length - 1]);
    if (singleTld) {
      detectedTld = singleTld;
      rawSld = parts.slice(0, -1).join('-');
    }
  }

  // Turn arbitrary brand phrases ("Blog Teknologi Jaya") into a valid domain SLD ("blogteknologijaya")
  let sld = rawSld
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);

  if (!sld || !SLD_REGEX.test(sld)) {
    sld = sld.replace(/[^a-z0-9]/g, '').slice(0, 63);
  }
  if (!sld) {
    throw new Error('Masukkan nama domain atau kata kunci huruf/angka yang valid (minimal 2 karakter).');
  }
  if (sld.length < 2) {
    throw new Error('Nama domain minimal terdiri dari 2 karakter huruf atau angka.');
  }

  const normalizedFallback = fallbackTlds.map((t) => normalizeTldValue(t)).find(Boolean) || '.com';
  const primaryTld =
    detectedTld && SUPPORTED_CHECK_TLDS.has(detectedTld) ? detectedTld : normalizedFallback;

  return { sld, primaryTld };
}

async function checkDnsPresence(domain: string): Promise<'exists' | 'nxdomain' | 'error'> {
  const timeoutPromise = new Promise<'error'>((resolve) => {
    setTimeout(() => resolve('error'), 2600);
  });

  const probe = (async (): Promise<'exists' | 'nxdomain' | 'error'> => {
    const results = await Promise.allSettled([
      dns.resolveNs(domain),
      dns.resolve4(domain),
      dns.resolveMx(domain),
      dns.resolveSoa(domain),
    ]);

    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (Array.isArray(r.value) ? r.value.length > 0 : Boolean(r.value)) {
          return 'exists';
        }
      }
    }

    const codes = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r) => (r.reason && typeof r.reason === 'object' ? String((r.reason as { code?: string }).code || '') : ''));

    if (codes.includes('ENOTFOUND') || codes.includes('NXDOMAIN')) {
      return 'nxdomain';
    }
    if (codes.some((c) => c === 'ENODATA' || c === 'NODATA')) {
      return 'exists';
    }
    return 'error';
  })();

  return Promise.race([probe, timeoutPromise]);
}

interface RdapProbeResult {
  state: 'registered' | 'available' | 'error';
  registrarHint: string;
  expiresAt: string;
}

function extractRdapMetadata(payload: unknown): { registrarHint: string; expiresAt: string } {
  if (!payload || typeof payload !== 'object') {
    return { registrarHint: '', expiresAt: '' };
  }
  const obj = payload as {
    entities?: Array<{
      roles?: string[];
      vcardArray?: [string, Array<[string, Record<string, unknown>, string, unknown]>];
    }>;
    events?: Array<{ eventAction?: string; eventDate?: string }>;
  };

  let registrarHint = '';
  if (Array.isArray(obj.entities)) {
    for (const ent of obj.entities) {
      if (Array.isArray(ent.roles) && ent.roles.includes('registrar')) {
        const vcard = ent.vcardArray?.[1];
        if (Array.isArray(vcard)) {
          const fnEntry = vcard.find((row) => Array.isArray(row) && row[0] === 'fn');
          if (fnEntry && typeof fnEntry[3] === 'string') {
            registrarHint = fnEntry[3].trim().slice(0, 80);
            break;
          }
        }
      }
    }
  }

  let expiresAt = '';
  if (Array.isArray(obj.events)) {
    const exp = obj.events.find((ev) => ev?.eventAction === 'expiration' && typeof ev.eventDate === 'string');
    if (exp?.eventDate) {
      expiresAt = exp.eventDate.slice(0, 10);
    }
  }

  return { registrarHint, expiresAt };
}

async function checkRdapPresence(domain: string, tld: string): Promise<RdapProbeResult> {
  const endpoint = getRdapEndpointForDomain(domain, tld);
  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/rdap+json, application/json',
        'User-Agent': 'TemaLokaDomainChecker/1.0',
      },
      signal: AbortSignal.timeout(3800),
    });

    if (res.status === 200) {
      let registrarHint = '';
      let expiresAt = '';
      try {
        const data = (await res.json()) as unknown;
        const meta = extractRdapMetadata(data);
        registrarHint = meta.registrarHint;
        expiresAt = meta.expiresAt;
      } catch {
        // ignore JSON parse issues on registrar hints
      }
      return { state: 'registered', registrarHint, expiresAt };
    }
    if (res.status === 404) {
      return { state: 'available', registrarHint: '', expiresAt: '' };
    }
    return { state: 'error', registrarHint: '', expiresAt: '' };
  } catch {
    return { state: 'error', registrarHint: '', expiresAt: '' };
  }
}

async function checkSingleDomain(
  sld: string,
  tld: string,
  isPrimaryMatch: boolean,
  isSuggestion: boolean
): Promise<DomainCheckItemResult> {
  const domain = `${sld}${tld}`;
  const [dnsState, rdapResult] = await Promise.all([
    checkDnsPresence(domain),
    checkRdapPresence(domain, tld),
  ]);

  let status: DomainAvailabilityStatus = 'unknown';
  let source: 'rdap+dns' | 'rdap' | 'dns' = 'rdap+dns';

  if (rdapResult.state === 'registered' || dnsState === 'exists') {
    status = 'registered';
    source = rdapResult.state === 'registered' && dnsState === 'exists'
      ? 'rdap+dns'
      : rdapResult.state === 'registered'
        ? 'rdap'
        : 'dns';
  } else if (rdapResult.state === 'available' && dnsState === 'nxdomain') {
    status = 'available';
    source = 'rdap+dns';
  } else if (rdapResult.state === 'available') {
    status = 'available';
    source = 'rdap';
  } else if (dnsState === 'nxdomain') {
    status = 'available';
    source = 'dns';
  }

  return {
    domain,
    sld,
    tld,
    status,
    source,
    registrarHint: rdapResult.registrarHint,
    expiresAt: rdapResult.expiresAt,
    isPrimaryMatch,
    isSuggestion,
    checkedAtMs: Date.now(),
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await worker(items[idx]);
    }
  });

  await Promise.all(runners);
  return results;
}

function buildBrandSuggestions(sld: string, primaryTld: string): Array<{ sld: string; tld: string }> {
  const rawCandidates = [
    `${sld}id`,
    `get${sld}`,
    `${sld}hq`,
    `my${sld}`,
    `${sld}hub`,
    `${sld}media`,
  ];

  const seen = new Set<string>([sld]);
  const list: Array<{ sld: string; tld: string }> = [];
  for (const cand of rawCandidates) {
    const clean = cand.slice(0, 63).replace(/^-+|-+$/g, '');
    if (!clean || seen.has(clean) || !SLD_REGEX.test(clean)) continue;
    seen.add(clean);
    list.push({ sld: clean, tld: primaryTld === '.com' || primaryTld === '.id' ? primaryTld : '.com' });
  }
  return list.slice(0, 6);
}

export async function checkDomainAvailabilityBatch(input: {
  query: string;
  tlds?: string[];
  includeSuggestions?: boolean;
}): Promise<DomainSearchResponse> {
  const requestedTldsRaw = Array.isArray(input.tlds) ? input.tlds : [];
  const validTlds = Array.from(
    new Set(
      requestedTldsRaw
        .map((t) => normalizeTldValue(t))
        .filter((t) => Boolean(t) && SUPPORTED_CHECK_TLDS.has(t))
    )
  );

  const { sld, primaryTld } = parseDomainSearchQuery(
    input.query,
    validTlds.length > 0 ? validTlds : ['.com', '.id', '.my.id']
  );

  const tldOrder = Array.from(
    new Set([
      primaryTld,
      ...(validTlds.length > 0
        ? validTlds
        : ['.com', '.id', '.my.id', '.co.id', '.net', '.org', '.io', '.dev', '.xyz', '.blog']),
    ])
  ).slice(0, 14);

  const extTargets = tldOrder.map((tld) => ({
    sld,
    tld,
    isPrimaryMatch: tld === primaryTld,
    isSuggestion: false,
  }));

  const suggestionTargets =
    input.includeSuggestions !== false
      ? buildBrandSuggestions(sld, primaryTld).map((s) => ({
          sld: s.sld,
          tld: s.tld,
          isPrimaryMatch: false,
          isSuggestion: true,
        }))
      : [];

  const allTargets = [...extTargets, ...suggestionTargets];
  const checked = await mapWithConcurrency(allTargets, 5, (item) =>
    checkSingleDomain(item.sld, item.tld, item.isPrimaryMatch, item.isSuggestion)
  );

  const extensionResults = checked.filter((item) => !item.isSuggestion);
  const suggestions = checked.filter((item) => item.isSuggestion);
  const primaryResult =
    extensionResults.find((item) => item.isPrimaryMatch) || extensionResults[0];

  return {
    query: String(input.query || '').trim(),
    sld,
    primaryTld,
    primaryResult,
    extensionResults,
    suggestions,
    checkedAtMs: Date.now(),
  };
}
