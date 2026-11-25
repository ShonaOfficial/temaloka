import dns from 'node:dns/promises';
import { normalizeTldValue } from '../types/admin.ts';
import {
  buildBrandSuggestions,
  checkRdapPresence,
  combineDomainCheckResults,
  mapWithConcurrency,
  parseDomainSearchQuery,
  SUPPORTED_CHECK_TLDS,
  type DnsProbeState,
  type DomainAvailabilityStatus,
  type DomainCheckItemResult,
  type DomainSearchResponse,
} from '../lib/domainLookupCore.ts';

export {
  parseDomainSearchQuery,
  SUPPORTED_CHECK_TLDS,
  type DomainAvailabilityStatus,
  type DomainCheckItemResult,
  type DomainSearchResponse,
};

async function checkDnsPresence(domain: string): Promise<DnsProbeState> {
  const timeoutPromise = new Promise<'error'>((resolve) => {
    setTimeout(() => resolve('error'), 2600);
  });

  const probe = (async (): Promise<DnsProbeState> => {
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
      .map((r) =>
        r.reason && typeof r.reason === 'object'
          ? String((r.reason as { code?: string }).code || '')
          : ''
      );

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

  return combineDomainCheckResults(
    sld,
    tld,
    dnsState,
    rdapResult,
    isPrimaryMatch,
    isSuggestion
  );
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
