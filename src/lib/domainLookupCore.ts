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

export interface RdapProbeResult {
  state: 'registered' | 'available' | 'error';
  registrarHint: string;
  expiresAt: string;
}

export type DnsProbeState = 'exists' | 'nxdomain' | 'error';

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

export function getRdapEndpointForDomain(domain: string, tld: string): string {
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

export function extractRdapMetadata(payload: unknown): { registrarHint: string; expiresAt: string } {
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

export async function checkRdapPresence(domain: string, tld: string): Promise<RdapProbeResult> {
  const endpoint = getRdapEndpointForDomain(domain, tld);
  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/rdap+json, application/json',
      },
      signal: AbortSignal.timeout(3800),
    });

    if (res.status === 200) {
      let registrarHint = '';
      let expiresAt = '';
      try {
        const text = await res.text();
        if (text.trim()) {
          const data = JSON.parse(text) as unknown;
          const meta = extractRdapMetadata(data);
          registrarHint = meta.registrarHint;
          expiresAt = meta.expiresAt;
        }
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

interface DohJsonResponse {
  Status?: number;
  Answer?: Array<{ name?: string; type?: number; data?: string }>;
  Authority?: Array<{ name?: string; type?: number; data?: string }>;
}

async function queryDohEndpoint(url: string, headers: Record<string, string>): Promise<DohJsonResponse | null> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(3200),
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim()) return null;
    return JSON.parse(text) as DohJsonResponse;
  } catch {
    return null;
  }
}

export async function checkDohPresence(domain: string): Promise<DnsProbeState> {
  const encoded = encodeURIComponent(domain);
  const endpoints: Array<{ url: string; headers: Record<string, string> }> = [
    {
      url: `https://cloudflare-dns.com/dns-query?name=${encoded}&type=NS`,
      headers: { Accept: 'application/dns-json' },
    },
    {
      url: `https://dns.google/resolve?name=${encoded}&type=NS`,
      headers: { Accept: 'application/json' },
    },
  ];

  for (const ep of endpoints) {
    const data = await queryDohEndpoint(ep.url, ep.headers);
    if (!data || typeof data.Status !== 'number') continue;
    if (data.Status === 3) return 'nxdomain';
    if (data.Status === 0) {
      if (Array.isArray(data.Answer) && data.Answer.length > 0) {
        return 'exists';
      }
      const cleanDom = domain.toLowerCase().replace(/\.$/, '');
      if (
        Array.isArray(data.Authority) &&
        data.Authority.some((a) => String(a?.name || '').toLowerCase().replace(/\.$/, '') === cleanDom)
      ) {
        return 'exists';
      }
      // Check A record quickly in case apex has A without NS answer
      const aCheck = await queryDohEndpoint(
        ep.url.replace('&type=NS', '&type=A'),
        ep.headers
      );
      if (aCheck?.Status === 0 && Array.isArray(aCheck.Answer) && aCheck.Answer.length > 0) {
        return 'exists';
      }
      return 'error';
    }
  }
  return 'error';
}

export function combineDomainCheckResults(
  sld: string,
  tld: string,
  dnsState: DnsProbeState,
  rdapResult: RdapProbeResult,
  isPrimaryMatch: boolean,
  isSuggestion: boolean
): DomainCheckItemResult {
  const domain = `${sld}${tld}`;
  let status: DomainAvailabilityStatus = 'unknown';
  let source: 'rdap+dns' | 'rdap' | 'dns' = 'rdap+dns';

  if (rdapResult.state === 'registered' || dnsState === 'exists') {
    status = 'registered';
    source =
      rdapResult.state === 'registered' && dnsState === 'exists'
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

export async function mapWithConcurrency<T, R>(
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

export function buildBrandSuggestions(
  sld: string,
  primaryTld: string
): Array<{ sld: string; tld: string }> {
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
    list.push({
      sld: clean,
      tld: primaryTld === '.com' || primaryTld === '.id' ? primaryTld : '.com',
    });
  }
  return list.slice(0, 6);
}

export async function checkDomainAvailabilityWeb(input: {
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
  const checked = await mapWithConcurrency(allTargets, 5, async (item) => {
    const domain = `${item.sld}${item.tld}`;
    const [dnsState, rdapResult] = await Promise.all([
      checkDohPresence(domain),
      checkRdapPresence(domain, item.tld),
    ]);
    return combineDomainCheckResults(
      item.sld,
      item.tld,
      dnsState,
      rdapResult,
      item.isPrimaryMatch,
      item.isSuggestion
    );
  });

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
