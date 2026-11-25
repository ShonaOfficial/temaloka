import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bookmark,
  BookmarkCheck,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Globe,
  Info,
  Loader2,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Tag,
  Trash2,
  WifiOff,
  XCircle,
} from 'lucide-react';
import {
  buildAffiliateDomainUrl,
  type AffiliateRegistrarRecord,
  type DomainAffiliateConfig,
  type DomainTldCategory,
  type DomainTldPricingRule,
} from '../types/admin';
import type { DomainCheckItemResult, DomainSearchResponse } from '../server/domainLookupService';

interface DomainSearchViewProps {
  domainConfig: DomainAffiliateConfig;
  isOfflineMode: boolean;
  onSwitchToOnline: () => void;
  isAdmin: boolean;
  onOpenAdminDomainSettings?: () => void;
  templateTitle?: string;
  onNotify: (message: string, type?: 'success' | 'error' | 'info') => void;
}

interface SavedDomainPick {
  domain: string;
  tld: string;
  status: DomainCheckItemResult['status'];
  priceLabel: string;
  registrarId: string;
  addedAtMs: number;
}

const SHORTLIST_STORAGE_KEY = 'temaloka_domain_shortlist_v1';
const HISTORY_STORAGE_KEY = 'temaloka_domain_search_history_v1';

const CATEGORY_TABS: Array<{ id: 'all' | DomainTldCategory; label: string }> = [
  { id: 'all', label: 'Semua Ekstensi' },
  { id: 'populer', label: 'Populer' },
  { id: 'indonesia', label: 'Indonesia (.id)' },
  { id: 'tech', label: 'Tech & AI' },
  { id: 'bisnis', label: 'Bisnis & Toko' },
];

function loadSavedShortlist(): SavedDomainPick[] {
  try {
    const raw = localStorage.getItem(SHORTLIST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, 30) : [];
  } catch {
    return [];
  }
}

function loadSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string').slice(0, 8)
      : [];
  } catch {
    return [];
  }
}

function suggestSeedFromTemplate(templateTitle?: string): string {
  const clean = (templateTitle || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 18);
  return clean.length >= 3 ? `${clean}.com` : 'jurnalblog.com';
}

export const DomainSearchView: React.FC<DomainSearchViewProps> = ({
  domainConfig,
  isOfflineMode,
  onSwitchToOnline,
  isAdmin,
  onOpenAdminDomainSettings,
  templateTitle,
  onNotify,
}) => {
  const [queryInput, setQueryInput] = useState<string>(() => suggestSeedFromTemplate(templateTitle));
  const [selectedCategory, setSelectedCategory] = useState<'all' | DomainTldCategory>('all');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<DomainSearchResponse | null>(null);
  const [selectedRegistrarId, setSelectedRegistrarId] = useState<string>('');
  const [shortlist, setShortlist] = useState<SavedDomainPick[]>(() => loadSavedShortlist());
  const [searchHistory, setSearchHistory] = useState<string[]>(() => loadSearchHistory());
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [showBloggerGuide, setShowBloggerGuide] = useState(false);

  const activeRegistrars = useMemo(
    () => domainConfig.registrars.filter((r) => r.enabled),
    [domainConfig.registrars]
  );

  const featuredRegistrar = useMemo(() => {
    return (
      activeRegistrars.find((r) => r.id === selectedRegistrarId) ||
      activeRegistrars.find((r) => r.isFeatured) ||
      activeRegistrars[0] ||
      null
    );
  }, [activeRegistrars, selectedRegistrarId]);

  useEffect(() => {
    if (!selectedRegistrarId && featuredRegistrar) {
      setSelectedRegistrarId(featuredRegistrar.id);
    }
  }, [featuredRegistrar, selectedRegistrarId]);

  useEffect(() => {
    try {
      localStorage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify(shortlist));
    } catch {
      // ignore storage quota errors
    }
  }, [shortlist]);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(searchHistory));
    } catch {
      // ignore storage quota errors
    }
  }, [searchHistory]);

  const pricingMap = useMemo(() => {
    const map = new Map<string, DomainTldPricingRule>();
    for (const rule of domainConfig.tldPricing) {
      if (rule.enabled) map.set(rule.tld, rule);
    }
    return map;
  }, [domainConfig.tldPricing]);

  const activeTldsForCategory = useMemo(() => {
    const enabledPricing = domainConfig.tldPricing.filter((p) => p.enabled);
    if (selectedCategory === 'all') {
      const merged = Array.from(
        new Set([...domainConfig.defaultTlds, ...enabledPricing.map((p) => p.tld)])
      );
      return merged.slice(0, 14);
    }
    const filtered = enabledPricing
      .filter((p) => p.category === selectedCategory)
      .map((p) => p.tld);
    return (filtered.length > 0 ? filtered : domainConfig.defaultTlds).slice(0, 14);
  }, [domainConfig.tldPricing, domainConfig.defaultTlds, selectedCategory]);

  const resolveRegistrarForTld = useCallback(
    (tld: string): AffiliateRegistrarRecord | null => {
      if (
        featuredRegistrar &&
        (featuredRegistrar.supportedTlds.length === 0 ||
          featuredRegistrar.supportedTlds.includes(tld))
      ) {
        return featuredRegistrar;
      }
      const compatible =
        activeRegistrars.find(
          (r) => r.supportedTlds.length === 0 || r.supportedTlds.includes(tld)
        ) || activeRegistrars[0];
      return compatible || null;
    },
    [activeRegistrars, featuredRegistrar]
  );

  const runDomainSearch = useCallback(
    async (rawQuery: string, tldsOverride?: string[]) => {
      const clean = rawQuery.trim();
      if (!clean) {
        setErrorMsg('Masukkan nama domain atau kata kunci terlebih dahulu.');
        return;
      }
      if (isOfflineMode) {
        setErrorMsg('Mode Offline sedang aktif. Aktifkan Mode Online untuk mengecek ketersediaan domain secara real-time.');
        return;
      }

      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetch('/api/domain/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: clean,
            tlds: tldsOverride || activeTldsForCategory,
            includeSuggestions: true,
          }),
        });
        const data = (await res.json()) as DomainSearchResponse & { error?: string };
        if (!res.ok) {
          throw new Error(data.error || 'Gagal memeriksa ketersediaan domain.');
        }
        setSearchResult(data);
        setSearchHistory((prev) => {
          const next = [data.primaryResult?.domain || clean, ...prev.filter((x) => x !== (data.primaryResult?.domain || clean))];
          return next.slice(0, 8);
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Gagal menghubungi server pengecekan domain.';
        setErrorMsg(msg);
      } finally {
        setLoading(false);
      }
    },
    [activeTldsForCategory, isOfflineMode]
  );

  // Initial automatic check on mount when online
  useEffect(() => {
    if (!isOfflineMode && !searchResult && queryInput.trim()) {
      void runDomainSearch(queryInput);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCategoryChange = (cat: 'all' | DomainTldCategory) => {
    setSelectedCategory(cat);
    const enabledPricing = domainConfig.tldPricing.filter((p) => p.enabled);
    const nextTlds =
      cat === 'all'
        ? Array.from(new Set([...domainConfig.defaultTlds, ...enabledPricing.map((p) => p.tld)])).slice(0, 14)
        : enabledPricing.filter((p) => p.category === cat).map((p) => p.tld).slice(0, 14);
    if (!isOfflineMode && queryInput.trim() && nextTlds.length > 0) {
      void runDomainSearch(queryInput, nextTlds);
    }
  };

  const toggleShortlist = (item: DomainCheckItemResult) => {
    const priceRule = pricingMap.get(item.tld);
    const reg = resolveRegistrarForTld(item.tld);
    setShortlist((prev) => {
      const exists = prev.some((s) => s.domain === item.domain);
      if (exists) {
        onNotify(`${item.domain} dihapus dari daftar pilihan.`, 'info');
        return prev.filter((s) => s.domain !== item.domain);
      }
      onNotify(`${item.domain} disimpan ke daftar pilihan.`, 'success');
      return [
        {
          domain: item.domain,
          tld: item.tld,
          status: item.status,
          priceLabel: priceRule?.registerPriceLabel || '-',
          registrarId: reg?.id || '',
          addedAtMs: Date.now(),
        },
        ...prev,
      ].slice(0, 30);
    });
  };

  const handleCopyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCode(text);
      onNotify(`${label} disalin: ${text}`, 'success');
      setTimeout(() => setCopiedCode((prev) => (prev === text ? null : prev)), 2000);
    } catch {
      onNotify('Gagal menyalin ke clipboard.', 'error');
    }
  };

  if (!domainConfig.enabled) {
    return (
      <main className="flex-1 min-w-0 h-full overflow-y-auto bg-[#F8FAFC] p-6 flex items-center justify-center">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 text-center space-y-3">
          <Globe className="w-8 h-8 text-slate-400 mx-auto" />
          <h2 className="text-base font-bold text-slate-900">Pencari Domain Sedang Dinonaktifkan</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            Fitur Pencari Nama Domain sedang dijeda oleh Admin situs.
          </p>
          {isAdmin && onOpenAdminDomainSettings && (
            <button
              type="button"
              onClick={onOpenAdminDomainSettings}
              className="px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg cursor-pointer"
            >
              Aktifkan di Panel Admin
            </button>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 min-w-0 h-full overflow-y-auto bg-[#F8FAFC] p-3 sm:p-5 lg:p-6">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Offline Mode Banner */}
        {isOfflineMode && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <WifiOff className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-950">
                <div className="font-bold">Mode Offline Aktif</div>
                <div className="text-[11px] text-amber-800">
                  Pengecekan ketersediaan domain secara real-time (RDAP &amp; DNS) memerlukan koneksi online.
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onSwitchToOnline}
              className="px-3 py-2 min-h-[36px] text-xs font-semibold bg-amber-900 hover:bg-amber-800 text-white rounded-lg cursor-pointer shrink-0"
            >
              Aktifkan Mode Online
            </button>
          </div>
        )}

        {/* Hero Search Card (Namecheap-Inspired Clean Workspace) */}
        <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1 max-w-3xl">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-blue-700 uppercase tracking-wider">
                <Globe className="w-3.5 h-3.5" />
                <span>Pencari Nama Domain &amp; Afiliasi Registrar</span>
              </div>
              <h1 className="font-display text-lg sm:text-2xl font-bold text-slate-900 tracking-tight">
                {domainConfig.headline}
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                {domainConfig.subtitle}
              </p>
            </div>

            {isAdmin && onOpenAdminDomainSettings && (
              <button
                type="button"
                onClick={onOpenAdminDomainSettings}
                className="flex items-center gap-1.5 px-3 py-2 min-h-[38px] text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 rounded-lg cursor-pointer shrink-0"
              >
                <Settings2 className="w-3.5 h-3.5" />
                <span>Atur Afiliasi &amp; Harga</span>
              </button>
            )}
          </div>

          {/* Main Search Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runDomainSearch(queryInput);
            }}
            className="flex flex-col sm:flex-row items-stretch gap-2.5"
          >
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={queryInput}
                onChange={(e) => {
                  setQueryInput(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder={domainConfig.searchPlaceholder}
                aria-label="Cari nama domain"
                className="w-full pl-10 pr-4 py-3 min-h-[48px] text-sm font-medium bg-slate-50 focus:bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !queryInput.trim()}
              className="px-6 py-3 min-h-[48px] text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl transition-colors flex items-center justify-center gap-2 shrink-0 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Memeriksa...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>Cari Domain</span>
                </>
              )}
            </button>
          </form>

          {/* Preferred Partner & TLD Filter Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {CATEGORY_TABS.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleCategoryChange(cat.id)}
                  className={`px-3 py-1.5 min-h-[34px] text-xs font-semibold rounded-lg border whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    selectedCategory === cat.id
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {activeRegistrars.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <label
                  htmlFor="preferred-registrar-select"
                  className="text-[11px] font-semibold text-slate-600 whitespace-nowrap"
                >
                  Partner Pendaftaran:
                </label>
                <select
                  id="preferred-registrar-select"
                  value={featuredRegistrar?.id || ''}
                  onChange={(e) => setSelectedRegistrarId(e.target.value)}
                  className="px-2.5 py-1.5 min-h-[34px] text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600 cursor-pointer"
                >
                  {activeRegistrars.map((reg) => (
                    <option key={reg.id} value={reg.id}>
                      {reg.name}
                      {reg.badgeLabel ? ` · ${reg.badgeLabel}` : ''}
                    </option>
                  ))}
                </select>
                {featuredRegistrar?.promoCode && (
                  <button
                    type="button"
                    onClick={() =>
                      void handleCopyText(featuredRegistrar.promoCode, `Kode Promo ${featuredRegistrar.name}`)
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[34px] text-[11px] font-mono font-semibold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg cursor-pointer"
                    title="Salin kode promo"
                  >
                    <Tag className="w-3 h-3" />
                    <span>{featuredRegistrar.promoCode}</span>
                    {copiedCode === featuredRegistrar.promoCode ? (
                      <Check className="w-3 h-3 text-emerald-700" />
                    ) : (
                      <Copy className="w-3 h-3 opacity-70" />
                    )}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Recent Search History & Quick Examples */}
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span className="font-semibold text-slate-600">Contoh cepat:</span>
            {['jurnalteknologi.com', 'ruangkreator.id', 'catatandigital.my.id', 'karyaweb.dev'].map(
              (sample) => (
                <button
                  key={sample}
                  type="button"
                  onClick={() => {
                    setQueryInput(sample);
                    void runDomainSearch(sample);
                  }}
                  className="px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-md font-mono cursor-pointer"
                >
                  {sample}
                </button>
              )
            )}
            {searchHistory.length > 0 && (
              <>
                <span className="text-slate-300">|</span>
                <span className="font-semibold text-slate-600">Terakhir:</span>
                {searchHistory.slice(0, 4).map((hist) => (
                  <button
                    key={hist}
                    type="button"
                    onClick={() => {
                      setQueryInput(hist);
                      void runDomainSearch(hist);
                    }}
                    className="px-2 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-md font-mono cursor-pointer"
                  >
                    {hist}
                  </button>
                ))}
              </>
            )}
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2 text-xs text-red-800">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              <span>{errorMsg}</span>
            </div>
          )}
        </section>

        {/* Main Workspace Split: Results (Left 8 cols) + Shortlist & Partners (Right 4 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-8 space-y-5">
            {/* Exact Match Spotlight Card */}
            {searchResult?.primaryResult && (
              <section
                className={`rounded-2xl border p-4 sm:p-5 space-y-3.5 ${
                  searchResult.primaryResult.status === 'available'
                    ? 'bg-emerald-50/60 border-emerald-200'
                    : searchResult.primaryResult.status === 'registered'
                      ? 'bg-white border-slate-200'
                      : 'bg-amber-50/50 border-amber-200'
                }`}
              >
                {(() => {
                  const primary = searchResult.primaryResult;
                  const priceRule = pricingMap.get(primary.tld);
                  const reg = resolveRegistrarForTld(primary.tld);
                  const affUrl = reg ? buildAffiliateDomainUrl(reg, primary.domain) : '';
                  const isSaved = shortlist.some((s) => s.domain === primary.domain);

                  return (
                    <>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {primary.status === 'available' ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                Tersedia untuk Didaftarkan
                              </span>
                            ) : primary.status === 'registered' ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-600">
                                <XCircle className="w-4 h-4 text-slate-400" />
                                Sudah Terdaftar
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-800">
                                <AlertCircle className="w-4 h-4 text-amber-600" />
                                Perlu Verifikasi Registrar
                              </span>
                            )}
                            <span className="text-[11px] font-mono text-slate-500">
                              · Cek via {primary.source.toUpperCase()}
                            </span>
                            {priceRule?.promoTag && (
                              <span className="text-[11px] font-semibold text-blue-700">
                                · {priceRule.promoTag}
                              </span>
                            )}
                          </div>

                          <div className="font-mono text-xl sm:text-2xl font-bold text-slate-900 break-all">
                            {primary.domain}
                          </div>

                          {(primary.registrarHint || primary.expiresAt) && (
                            <div className="text-[11px] text-slate-600 font-mono tabular-nums">
                              {primary.registrarHint ? `Registrar saat ini: ${primary.registrarHint}` : ''}
                              {primary.registrarHint && primary.expiresAt ? ' · ' : ''}
                              {primary.expiresAt ? `Kedaluwarsa: ${primary.expiresAt}` : ''}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col sm:items-end gap-2 shrink-0">
                          <div className="text-left sm:text-right">
                            <div className="font-mono text-lg sm:text-xl font-bold text-slate-900 tabular-nums">
                              {priceRule?.registerPriceLabel || 'Cek Harga'}
                            </div>
                            {priceRule?.renewPriceLabel && (
                              <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                                Perpanjangan {priceRule.renewPriceLabel}
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleShortlist(primary)}
                              className={`px-3 py-2 min-h-[40px] text-xs font-semibold rounded-xl border flex items-center gap-1.5 cursor-pointer ${
                                isSaved
                                  ? 'bg-slate-900 text-white border-slate-900'
                                  : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-300'
                              }`}
                            >
                              {isSaved ? (
                                <BookmarkCheck className="w-3.5 h-3.5" />
                              ) : (
                                <Bookmark className="w-3.5 h-3.5" />
                              )}
                              <span>{isSaved ? 'Tersimpan' : 'Simpan'}</span>
                            </button>

                            {reg && affUrl && (
                              <a
                                href={affUrl}
                                target="_blank"
                                rel="noopener noreferrer sponsored"
                                className={`px-4 py-2 min-h-[40px] text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors ${
                                  primary.status === 'available'
                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                    : 'bg-slate-900 hover:bg-slate-800 text-white'
                                }`}
                              >
                                <span>
                                  {primary.status === 'available'
                                    ? `Daftar di ${reg.name}`
                                    : `Cek Penawaran di ${reg.name}`}
                                </span>
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </section>
            )}

            {/* Multi-TLD Extensions Table */}
            <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Hasil Cek Ekstensi Domain
                    {searchResult ? ` untuk "${searchResult.sld}"` : ''}
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Bandingkan ketersediaan dan estimasi harga registrasi pada ekstensi populer maupun domain .ID.
                  </p>
                </div>
                {searchResult && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void runDomainSearch(queryInput)}
                    className="flex items-center gap-1.5 px-3 py-1.5 min-h-[34px] text-xs font-semibold bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    <span>Cek Ulang</span>
                  </button>
                )}
              </div>

              {loading && !searchResult ? (
                <div className="p-8 text-center space-y-2">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto" />
                  <p className="text-xs text-slate-600">
                    Memeriksa ketersediaan nama domain di server DNS &amp; RDAP...
                  </p>
                </div>
              ) : !searchResult ? (
                <div className="divide-y divide-slate-100">
                  {domainConfig.tldPricing
                    .filter((p) => p.enabled)
                    .slice(0, 10)
                    .map((rule) => (
                      <div
                        key={rule.tld}
                        className="px-4 sm:px-5 py-3 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="font-mono font-bold text-slate-900">{rule.tld}</span>
                          {rule.promoTag && (
                            <span className="text-[11px] text-blue-700 font-medium">
                              · {rule.promoTag}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 shrink-0 font-mono tabular-nums">
                          <span className="font-bold text-slate-900">
                            {rule.registerPriceLabel || '-'}
                          </span>
                          <span className="hidden sm:inline text-[11px] text-slate-500">
                            {rule.renewPriceLabel}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {searchResult.extensionResults.map((item) => {
                    const priceRule = pricingMap.get(item.tld);
                    const reg = resolveRegistrarForTld(item.tld);
                    const affUrl = reg ? buildAffiliateDomainUrl(reg, item.domain) : '';
                    const isSaved = shortlist.some((s) => s.domain === item.domain);

                    return (
                      <div
                        key={item.domain}
                        className="px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-slate-50/70 transition-colors"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-bold text-slate-900 break-all">
                              {item.domain}
                            </span>
                            {item.status === 'available' ? (
                              <span className="text-[11px] font-semibold text-emerald-700">
                                · Tersedia
                              </span>
                            ) : item.status === 'registered' ? (
                              <span className="text-[11px] font-medium text-slate-500">
                                · Terdaftar
                              </span>
                            ) : (
                              <span className="text-[11px] font-medium text-amber-700">
                                · Cek Registrar
                              </span>
                            )}
                            {priceRule?.promoTag && (
                              <span className="text-[11px] text-blue-700 font-medium">
                                · {priceRule.promoTag}
                              </span>
                            )}
                          </div>
                          {item.registrarHint && (
                            <div className="text-[11px] text-slate-500 truncate">
                              Registrar aktif: {item.registrarHint}
                              {item.expiresAt ? ` · Exp ${item.expiresAt}` : ''}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                          <div className="text-left sm:text-right font-mono tabular-nums">
                            <div className="text-xs font-bold text-slate-900">
                              {priceRule?.registerPriceLabel || 'Lihat Harga'}
                            </div>
                            {priceRule?.renewPriceLabel && (
                              <div className="text-[10px] text-slate-500">
                                {priceRule.renewPriceLabel}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => toggleShortlist(item)}
                              title={isSaved ? 'Hapus dari pilihan' : 'Simpan domain'}
                              className={`p-2 min-h-[36px] min-w-[36px] rounded-lg border flex items-center justify-center cursor-pointer ${
                                isSaved
                                  ? 'bg-slate-900 text-white border-slate-900'
                                  : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200'
                              }`}
                            >
                              {isSaved ? (
                                <BookmarkCheck className="w-3.5 h-3.5" />
                              ) : (
                                <Bookmark className="w-3.5 h-3.5" />
                              )}
                            </button>

                            {reg && affUrl && (
                              <a
                                href={affUrl}
                                target="_blank"
                                rel="noopener noreferrer sponsored"
                                className={`px-3 py-1.5 min-h-[36px] text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap ${
                                  item.status === 'available'
                                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                    : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                                }`}
                              >
                                <span>
                                  {item.status === 'available' ? `Daftar (${reg.name})` : 'Lihat'}
                                </span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Brand Name Suggestions (Namecheap Beast-Style Alternatives) */}
            {searchResult && searchResult.suggestions.length > 0 && (
              <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">
                        Alternatif Variasi Nama Domain
                      </h2>
                      <p className="text-[11px] text-slate-500">
                        Ide nama brand cadangan jika ekstensi utama sudah dimiliki orang lain.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:gap-px bg-slate-100">
                  {searchResult.suggestions.map((item) => {
                    const priceRule = pricingMap.get(item.tld);
                    const reg = resolveRegistrarForTld(item.tld);
                    const affUrl = reg ? buildAffiliateDomainUrl(reg, item.domain) : '';
                    return (
                      <div
                        key={item.domain}
                        className="bg-white p-3.5 flex items-center justify-between gap-2.5"
                      >
                        <div className="min-w-0">
                          <div className="font-mono text-xs font-bold text-slate-900 truncate">
                            {item.domain}
                          </div>
                          <div className="text-[11px] flex items-center gap-1.5 mt-0.5">
                            <span
                              className={
                                item.status === 'available'
                                  ? 'text-emerald-700 font-semibold'
                                  : 'text-slate-500'
                              }
                            >
                              {item.status === 'available'
                                ? 'Tersedia'
                                : item.status === 'registered'
                                  ? 'Terdaftar'
                                  : 'Cek'}
                            </span>
                            {priceRule?.registerPriceLabel && (
                              <span className="font-mono text-slate-600 tabular-nums">
                                · {priceRule.registerPriceLabel}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setQueryInput(item.domain);
                              void runDomainSearch(item.domain);
                            }}
                            className="px-2 py-1.5 text-[11px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg cursor-pointer"
                          >
                            Cek
                          </button>
                          {reg && affUrl && item.status === 'available' && (
                            <a
                              href={affUrl}
                              target="_blank"
                              rel="noopener noreferrer sponsored"
                              className="px-2.5 py-1.5 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg inline-flex items-center gap-1"
                            >
                              <span>Daftar</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>

          {/* Right Column: Shortlist Cart + Partner Commission List + Blogger CNAME Tip */}
          <div className="lg:col-span-4 space-y-5">
            {/* Domain Shortlist */}
            <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Bookmark className="w-4 h-4 text-blue-600" />
                  <h2 className="text-sm font-bold text-slate-900">
                    Daftar Pilihan ({shortlist.length})
                  </h2>
                </div>
                {shortlist.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setShortlist([]);
                      onNotify('Daftar pilihan domain dikosongkan.', 'info');
                    }}
                    className="text-[11px] font-semibold text-red-600 hover:text-red-700 cursor-pointer"
                  >
                    Kosongkan
                  </button>
                )}
              </div>

              {shortlist.length === 0 ? (
                <p className="text-xs text-slate-500 leading-relaxed py-2">
                  Klik ikon simpan di samping hasil pencarian untuk mengumpulkan kandidat nama domain terbaik sebelum mendaftarkannya.
                </p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
                  {shortlist.map((pick) => {
                    const reg =
                      activeRegistrars.find((r) => r.id === pick.registrarId) ||
                      resolveRegistrarForTld(pick.tld);
                    const affUrl = reg ? buildAffiliateDomainUrl(reg, pick.domain) : '';
                    return (
                      <div
                        key={pick.domain}
                        className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="font-mono text-xs font-bold text-slate-900 truncate">
                            {pick.domain}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                            {pick.priceLabel}
                            {reg ? ` · ${reg.name}` : ''}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {reg && affUrl && (
                            <a
                              href={affUrl}
                              target="_blank"
                              rel="noopener noreferrer sponsored"
                              className="px-2.5 py-1.5 text-[11px] font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg inline-flex items-center gap-1"
                            >
                              <span>Beli</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                          <button
                            type="button"
                            aria-label={`Hapus ${pick.domain}`}
                            onClick={() =>
                              setShortlist((prev) => prev.filter((s) => s.domain !== pick.domain))
                            }
                            className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {shortlist.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    void handleCopyText(
                      shortlist.map((s) => s.domain).join('\n'),
                      'Daftar domain pilihan'
                    )
                  }
                  className="w-full py-2 px-3 min-h-[38px] text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Salin Semua Domain</span>
                </button>
              )}
            </section>

            {/* Active Affiliate Registrars Showcase */}
            <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
              <div className="pb-2 border-b border-slate-100">
                <h2 className="text-sm font-bold text-slate-900">
                  Partner Registrar Domain ({activeRegistrars.length})
                </h2>
                <p className="text-[11px] text-slate-500">
                  Pilih registrar favorit Anda untuk mendaftarkan domain baru.
                </p>
              </div>

              <div className="space-y-2">
                {activeRegistrars.map((reg) => {
                  const targetDomain =
                    searchResult?.primaryResult?.domain || queryInput.trim() || 'namablog.com';
                  const directUrl = buildAffiliateDomainUrl(reg, targetDomain);
                  const isSelected = featuredRegistrar?.id === reg.id;
                  return (
                    <div
                      key={reg.id}
                      className={`p-3 rounded-xl border transition-colors space-y-1.5 ${
                        isSelected
                          ? 'bg-blue-50/50 border-blue-200'
                          : 'bg-slate-50/60 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <button
                            type="button"
                            onClick={() => setSelectedRegistrarId(reg.id)}
                            className="text-xs font-bold text-slate-900 hover:text-blue-700 truncate cursor-pointer text-left"
                          >
                            {reg.name}
                          </button>
                          {reg.badgeLabel && (
                            <span className="text-[10px] font-semibold text-blue-700 truncate">
                              · {reg.badgeLabel}
                            </span>
                          )}
                        </div>
                        {directUrl && (
                          <a
                            href={directUrl}
                            target="_blank"
                            rel="noopener noreferrer sponsored"
                            className="text-[11px] font-semibold text-blue-700 hover:underline inline-flex items-center gap-1 shrink-0"
                          >
                            <span>Kunjungi</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                      {reg.commissionNote && (
                        <p className="text-[11px] text-slate-600 leading-snug">
                          {reg.commissionNote}
                        </p>
                      )}
                      {reg.promoCode && (
                        <div className="flex items-center justify-between gap-2 pt-0.5">
                          <span className="text-[10px] font-mono text-amber-800">
                            Kode Promo: <strong>{reg.promoCode}</strong>
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleCopyText(reg.promoCode, `Kode ${reg.name}`)}
                            className="text-[10px] font-semibold text-slate-700 hover:text-slate-900 underline cursor-pointer"
                          >
                            Salin
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {domainConfig.disclosureText && (
                <div className="pt-2 border-t border-slate-100 flex items-start gap-2 text-[11px] text-slate-500 leading-relaxed">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
                  <span>{domainConfig.disclosureText}</span>
                </div>
              )}
            </section>

            {/* Quick Blogger Custom Domain DNS Tip */}
            <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
              <button
                type="button"
                onClick={() => setShowBloggerGuide((v) => !v)}
                className="w-full flex items-center justify-between gap-2 text-left cursor-pointer"
              >
                <span className="text-xs font-bold text-slate-900">
                  Panduan Pasang Custom Domain ke Blogger
                </span>
                <span className="text-[11px] font-semibold text-blue-700">
                  {showBloggerGuide ? 'Tutup' : 'Lihat DNS'}
                </span>
              </button>
              {showBloggerGuide && (
                <div className="pt-2 border-t border-slate-100 space-y-2 text-[11px] text-slate-600 leading-relaxed">
                  <p>
                    Setelah membeli domain dari Namecheap, Dynadot, Spaceship, DomaiNesia, atau registrar lain, tambahkan DNS record berikut di panel domain Anda:
                  </p>
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 font-mono text-[10px] space-y-1">
                    <div>CNAME · Host: www &rarr; Target: ghs.google.com</div>
                    <div>CNAME · Host: [kode verifikasi Blogger] &rarr; Target: [gv-*.dv.googlehosted.com]</div>
                    <div>A Record (@) &rarr; 216.239.32.21 / .34.21 / .36.21 / .38.21</div>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
};
