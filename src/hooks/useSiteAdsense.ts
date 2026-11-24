import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthAndAi } from '../contexts/AuthAndAiContext';
import {
  DEFAULT_SITE_ADSENSE_CONFIG,
  sanitizePublisherId,
  type AdsenseUnitFormatType,
  type AdsenseUnitPlacementType,
  type AdsenseUnitRecord,
  type SiteAdsenseConfig,
} from '../types/adsense';
import {
  DEFAULT_PAYMENT_SETTINGS,
  DEFAULT_SITE_SEO_CONFIG,
  type AuthUserSession,
  type DbStorageMode,
  type FreeLlmPublicStatus,
  type GoogleCloudPublicStatus,
  type PaymentSettingsConfig,
  type PublicSiteConfigResponse,
  type SiteSeoConfig,
} from '../types/admin';
import {
  DEFAULT_PREMIUM_CONFIG,
  hasFreeAdsPrivilege,
  type PremiumSettingsConfig,
} from '../lib/featureRegistry';

const MANAGED_HEAD_ATTR = 'data-temaloka-managed-adsense';
const MANAGED_SEO_ATTR = 'data-temaloka-managed-seo';

export interface SiteAdsenseController {
  config: SiteAdsenseConfig;
  seoConfig: SiteSeoConfig;
  premiumConfig: PremiumSettingsConfig;
  paymentConfig: PaymentSettingsConfig;
  freellmPublic: FreeLlmPublicStatus;
  gcloudPublic: GoogleCloudPublicStatus;
  dbMode: DbStorageMode;
  configExistsInCloud: boolean;
  loadingConfig: boolean;
  savingConfig: boolean;
  units: AdsenseUnitRecord[];
  loadingUnits: boolean;
  isBootstrappedAdmin: boolean;
  isAdmin: boolean;
  checkingAdmin: boolean;
  shouldRenderLiveAds: boolean;
  refreshPublicConfig: () => Promise<void>;
  saveGlobalConfig: (next: SiteAdsenseConfig) => Promise<void>;
  saveSeoConfig: (next: SiteSeoConfig) => Promise<void>;
  savePremiumConfig: (next: PremiumSettingsConfig) => Promise<void>;
  savePaymentConfig: (next: PaymentSettingsConfig) => Promise<void>;
  createAdUnit: (input: {
    name: string;
    slotId: string;
    format: AdsenseUnitFormatType;
    placement: AdsenseUnitPlacementType;
    enabled: boolean;
    onlyOnPosts: boolean;
    notes: string;
  }) => Promise<void>;
  updateAdUnit: (
    unitId: string,
    patch: {
      name: string;
      slotId: string;
      format: AdsenseUnitFormatType;
      placement: AdsenseUnitPlacementType;
      enabled: boolean;
      onlyOnPosts: boolean;
      notes: string;
    }
  ) => Promise<void>;
  deleteAdUnit: (unitId: string) => Promise<void>;
}

function upsertManagedMeta(
  head: HTMLHeadElement,
  keyAttr: 'name' | 'property',
  keyVal: string,
  content: string,
  tagId: string
) {
  const existing = head.querySelector(`meta[${MANAGED_SEO_ATTR}="${tagId}"]`);
  if (!content.trim()) {
    existing?.remove();
    return;
  }
  if (existing) {
    if (existing.getAttribute('content') !== content.trim()) {
      existing.setAttribute('content', content.trim());
    }
  } else {
    const el = document.createElement('meta');
    el.setAttribute(keyAttr, keyVal);
    el.setAttribute('content', content.trim());
    el.setAttribute(MANAGED_SEO_ATTR, tagId);
    head.appendChild(el);
  }
}

export function useSiteAdsense(
  user: AuthUserSession | null,
  authReady: boolean,
  isOfflineMode: boolean
): SiteAdsenseController {
  const { sessionToken, setFreeLlmStatus } = useAuthAndAi();

  const [dbMode, setDbMode] = useState<DbStorageMode>('local-sqlite');
  const [config, setConfig] = useState<SiteAdsenseConfig>(DEFAULT_SITE_ADSENSE_CONFIG);
  const [seoConfig, setSeoConfig] = useState<SiteSeoConfig>(DEFAULT_SITE_SEO_CONFIG);
  const [premiumConfig, setPremiumConfig] = useState<PremiumSettingsConfig>(DEFAULT_PREMIUM_CONFIG);
  const [paymentConfig, setPaymentConfig] = useState<PaymentSettingsConfig>(DEFAULT_PAYMENT_SETTINGS);
  const [freellmPublic, setFreellmPublic] = useState<FreeLlmPublicStatus>({
    enabled: true,
    defaultModel: 'auto',
    routingStrategy: 'auto',
    allowForGuests: true,
    configuredProviders: [],
  });
  const [gcloudPublic, setGcloudPublic] = useState<GoogleCloudPublicStatus>({
    enabled: false,
    projectId: '',
    oauthEnabled: false,
    oauthClientId: '',
    hasGeminiApiKey: false,
    hasIndexingServiceAccount: false,
    serviceAccountEmail: '',
  });
  const [configExistsInCloud, setConfigExistsInCloud] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);

  const [units, setUnits] = useState<AdsenseUnitRecord[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(true);

  const isAdmin = Boolean(user && user.role === 'admin');
  const isBootstrappedAdmin = isAdmin;

  const refreshPublicConfig = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (sessionToken) {
        headers.Authorization = `Bearer ${sessionToken}`;
      }
      const res = await fetch('/api/config/public', { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as PublicSiteConfigResponse;
      setDbMode(data.dbMode || 'local-sqlite');
      if (data.adsense) {
        setConfig(data.adsense);
        setConfigExistsInCloud(Boolean(data.adsense.updatedAtMs || data.adsense.publisherId));
      }
      if (Array.isArray(data.units)) {
        setUnits(data.units);
      }
      if (data.seo) {
        setSeoConfig(data.seo);
      }
      if (data.premium) {
        setPremiumConfig(data.premium);
      }
      if (data.payment) {
        setPaymentConfig(data.payment);
      }
      if (data.freellm) {
        setFreellmPublic(data.freellm);
        setFreeLlmStatus(data.freellm);
      }
      if (data.gcloud) {
        setGcloudPublic(data.gcloud);
      }
    } catch {
      // Keep current state cleanly if offline
    } finally {
      setLoadingConfig(false);
      setLoadingUnits(false);
    }
  }, [sessionToken, setFreeLlmStatus]);

  useEffect(() => {
    if (!authReady) return;
    void refreshPublicConfig();
  }, [authReady, sessionToken, isAdmin, refreshPublicConfig]);

  const shouldRenderLiveAds = useMemo(() => {
    if (!config.adsenseEnabled) return false;
    if (!sanitizePublisherId(config.publisherId)) return false;
    if (config.hideAdsInOfflineMode && isOfflineMode) return false;
    if (config.hideAdsForAdmin && isAdmin) return false;
    if (
      !isAdmin &&
      hasFreeAdsPrivilege(
        premiumConfig,
        user?.tier || 'free',
        false,
        user?.featureOverrides,
        user?.proPlanId
      )
    ) {
      return false;
    }
    return true;
  }, [config, isOfflineMode, isAdmin, premiumConfig, user]);

  // Dynamically manage <meta name="google-adsense-account"> & Auto Ads <script>
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const head = document.head;
    if (!head) return;

    const cleanPub = sanitizePublisherId(config.publisherId);
    const existingMeta = head.querySelector(`meta[${MANAGED_HEAD_ATTR}="meta"]`);
    const existingScript = head.querySelector(`script[${MANAGED_HEAD_ATTR}="script"]`);

    const wantMeta = config.adsenseEnabled && config.headMetaEnabled && Boolean(cleanPub);
    if (wantMeta) {
      if (existingMeta) {
        if (existingMeta.getAttribute('content') !== cleanPub) {
          existingMeta.setAttribute('content', cleanPub);
        }
      } else {
        const meta = document.createElement('meta');
        meta.setAttribute('name', 'google-adsense-account');
        meta.setAttribute('content', cleanPub);
        meta.setAttribute(MANAGED_HEAD_ATTR, 'meta');
        head.appendChild(meta);
      }
    } else if (existingMeta) {
      existingMeta.remove();
    }

    const wantScript =
      shouldRenderLiveAds && config.autoAdsEnabled && Boolean(cleanPub);
    const desiredSrc = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${cleanPub}`;

    if (wantScript) {
      if (existingScript) {
        if (existingScript.getAttribute('src') !== desiredSrc) {
          existingScript.remove();
          const script = document.createElement('script');
          script.async = true;
          script.crossOrigin = 'anonymous';
          script.src = desiredSrc;
          script.setAttribute(MANAGED_HEAD_ATTR, 'script');
          head.appendChild(script);
        }
      } else {
        const script = document.createElement('script');
        script.async = true;
        script.crossOrigin = 'anonymous';
        script.src = desiredSrc;
        script.setAttribute(MANAGED_HEAD_ATTR, 'script');
        head.appendChild(script);
      }
    } else if (existingScript) {
      existingScript.remove();
    }
  }, [config.adsenseEnabled, config.headMetaEnabled, config.autoAdsEnabled, config.publisherId, shouldRenderLiveAds]);

  // Dynamically apply Admin Web SEO config to document.head
  useEffect(() => {
    if (typeof document === 'undefined' || !seoConfig.seoEnabled) return;
    const head = document.head;
    if (!head) return;

    if (seoConfig.siteTitle.trim()) {
      document.title = seoConfig.siteTitle.trim();
      upsertManagedMeta(head, 'property', 'og:title', seoConfig.siteTitle, 'og-title');
    }
    upsertManagedMeta(head, 'name', 'description', seoConfig.metaDescription, 'meta-desc');
    upsertManagedMeta(head, 'property', 'og:description', seoConfig.metaDescription, 'og-desc');
    upsertManagedMeta(head, 'name', 'keywords', seoConfig.metaKeywords, 'meta-keywords');
    upsertManagedMeta(head, 'property', 'og:image', seoConfig.ogImageUrl, 'og-image');
    upsertManagedMeta(head, 'name', 'google-site-verification', seoConfig.googleSiteVerification, 'gsc');
    upsertManagedMeta(head, 'name', 'msvalidate.01', seoConfig.bingSiteVerification, 'bing');
    upsertManagedMeta(head, 'name', 'yandex-verification', seoConfig.yandexVerification, 'yandex');

    const existingCanon = head.querySelector(`link[${MANAGED_SEO_ATTR}="canonical"]`);
    if (seoConfig.canonicalOrigin.trim()) {
      if (existingCanon) {
        existingCanon.setAttribute('href', seoConfig.canonicalOrigin.trim());
      } else {
        const link = document.createElement('link');
        link.rel = 'canonical';
        link.href = seoConfig.canonicalOrigin.trim();
        link.setAttribute(MANAGED_SEO_ATTR, 'canonical');
        head.appendChild(link);
      }
    } else {
      existingCanon?.remove();
    }

    const existingSchema = head.querySelector(`script[${MANAGED_SEO_ATTR}="schema"]`);
    if (seoConfig.schemaOrgEnabled) {
      const schemaPayload = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: seoConfig.schemaOrgName || seoConfig.siteTitle,
        description: seoConfig.metaDescription,
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'All',
        ...(seoConfig.canonicalOrigin ? { url: seoConfig.canonicalOrigin } : {}),
      });
      if (existingSchema) {
        if (existingSchema.textContent !== schemaPayload) {
          existingSchema.textContent = schemaPayload;
        }
      } else {
        const s = document.createElement('script');
        s.type = 'application/ld+json';
        s.setAttribute(MANAGED_SEO_ATTR, 'schema');
        s.textContent = schemaPayload;
        head.appendChild(s);
      }
    } else {
      existingSchema?.remove();
    }

    const existingGa = head.querySelector(`script[${MANAGED_SEO_ATTR}="ga-src"]`);
    const cleanGa = seoConfig.gaMeasurementId.trim();
    if (/^G-[A-Z0-9]{4,20}$/i.test(cleanGa) && !isOfflineMode) {
      const gaSrc = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(cleanGa)}`;
      if (!existingGa || existingGa.getAttribute('src') !== gaSrc) {
        existingGa?.remove();
        const gaScript = document.createElement('script');
        gaScript.async = true;
        gaScript.src = gaSrc;
        gaScript.setAttribute(MANAGED_SEO_ATTR, 'ga-src');
        head.appendChild(gaScript);
      }
    } else {
      existingGa?.remove();
    }
  }, [seoConfig, isOfflineMode]);

  const requireToken = useCallback(() => {
    if (!sessionToken || !isAdmin) {
      throw new Error('Silakan masuk sebagai Admin di Panel Admin terlebih dahulu.');
    }
    return sessionToken;
  }, [sessionToken, isAdmin]);

  const saveGlobalConfig = useCallback(
    async (next: SiteAdsenseConfig) => {
      const token = requireToken();
      setSavingConfig(true);
      try {
        const res = await fetch('/api/admin/adsense/config', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(next),
        });
        const data = (await res.json()) as { config?: SiteAdsenseConfig; error?: string };
        if (!res.ok || !data.config) {
          throw new Error(data.error || 'Gagal menyimpan pengaturan AdSense.');
        }
        setConfig(data.config);
        setConfigExistsInCloud(true);
      } finally {
        setSavingConfig(false);
      }
    },
    [requireToken]
  );

  const saveSeoConfig = useCallback(
    async (next: SiteSeoConfig) => {
      const token = requireToken();
      setSavingConfig(true);
      try {
        const res = await fetch('/api/admin/seo', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(next),
        });
        const data = (await res.json()) as { seo?: SiteSeoConfig; error?: string };
        if (!res.ok || !data.seo) {
          throw new Error(data.error || 'Gagal menyimpan pengaturan SEO.');
        }
        setSeoConfig(data.seo);
      } finally {
        setSavingConfig(false);
      }
    },
    [requireToken]
  );

  const savePremiumConfig = useCallback(
    async (next: PremiumSettingsConfig) => {
      const token = requireToken();
      setSavingConfig(true);
      try {
        const res = await fetch('/api/admin/premium', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(next),
        });
        const data = (await res.json()) as { premium?: PremiumSettingsConfig; error?: string };
        if (!res.ok || !data.premium) {
          throw new Error(data.error || 'Gagal menyimpan pengaturan Fitur Premium.');
        }
        setPremiumConfig(data.premium);
      } finally {
        setSavingConfig(false);
      }
    },
    [requireToken]
  );

  const savePaymentConfig = useCallback(
    async (next: PaymentSettingsConfig) => {
      const token = requireToken();
      setSavingConfig(true);
      try {
        const res = await fetch('/api/admin/payment', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(next),
        });
        const data = (await res.json()) as { payment?: PaymentSettingsConfig; error?: string };
        if (!res.ok || !data.payment) {
          throw new Error(data.error || 'Gagal menyimpan pengaturan Pembayaran Manual.');
        }
        setPaymentConfig(data.payment);
      } finally {
        setSavingConfig(false);
      }
    },
    [requireToken]
  );

  const createAdUnit = useCallback(
    async (input: {
      name: string;
      slotId: string;
      format: AdsenseUnitFormatType;
      placement: AdsenseUnitPlacementType;
      enabled: boolean;
      onlyOnPosts: boolean;
      notes: string;
    }) => {
      const token = requireToken();
      const res = await fetch('/api/admin/adsense/units', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(input),
      });
      const data = (await res.json()) as { units?: AdsenseUnitRecord[]; error?: string };
      if (!res.ok || !data.units) {
        throw new Error(data.error || 'Gagal membuat unit iklan.');
      }
      setUnits(data.units);
    },
    [requireToken]
  );

  const updateAdUnit = useCallback(
    async (
      unitId: string,
      patch: {
        name: string;
        slotId: string;
        format: AdsenseUnitFormatType;
        placement: AdsenseUnitPlacementType;
        enabled: boolean;
        onlyOnPosts: boolean;
        notes: string;
      }
    ) => {
      const token = requireToken();
      const res = await fetch(`/api/admin/adsense/units/${encodeURIComponent(unitId)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as { units?: AdsenseUnitRecord[]; error?: string };
      if (!res.ok || !data.units) {
        throw new Error(data.error || 'Gagal memperbarui unit iklan.');
      }
      setUnits(data.units);
    },
    [requireToken]
  );

  const deleteAdUnit = useCallback(
    async (unitId: string) => {
      const token = requireToken();
      const res = await fetch(`/api/admin/adsense/units/${encodeURIComponent(unitId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { units?: AdsenseUnitRecord[]; error?: string };
      if (!res.ok || !data.units) {
        throw new Error(data.error || 'Gagal menghapus unit iklan.');
      }
      setUnits(data.units);
    },
    [requireToken]
  );

  return {
    config,
    seoConfig,
    premiumConfig,
    paymentConfig,
    freellmPublic,
    gcloudPublic,
    dbMode,
    configExistsInCloud,
    loadingConfig,
    savingConfig,
    units,
    loadingUnits,
    isBootstrappedAdmin,
    isAdmin,
    checkingAdmin: false,
    shouldRenderLiveAds,
    refreshPublicConfig,
    saveGlobalConfig,
    saveSeoConfig,
    savePremiumConfig,
    savePaymentConfig,
    createAdUnit,
    updateAdUnit,
    deleteAdUnit,
  };
}
