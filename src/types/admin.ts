import type { FeatureOverrideValue, PremiumSettingsConfig } from '../lib/featureRegistry';
import type { AdsenseUnitRecord, SiteAdsenseConfig } from './adsense';

export type DbStorageMode = 'cloudflare-d1' | 'local-sqlite';
export type UserAccountTier = 'free' | 'pro' | 'admin';
export type FreeLlmRoutingStrategy = 'auto' | 'auto:fastest' | 'auto:smartest' | 'balanced';

export interface SiteSeoConfig {
  seoEnabled: boolean;
  siteTitle: string;
  metaDescription: string;
  metaKeywords: string;
  canonicalOrigin: string;
  ogImageUrl: string;
  defaultBlogUrl: string;
  robotsTxtContent: string;
  sitemapEnabled: boolean;
  googleSiteVerification: string;
  bingSiteVerification: string;
  yandexVerification: string;
  gaMeasurementId: string;
  gtmContainerId: string;
  indexNowKey: string;
  schemaOrgEnabled: boolean;
  schemaOrgName: string;
  customHeadSnippet: string;
  updatedAtMs: number;
  updatedByEmail: string;
}

export const DEFAULT_SITE_SEO_CONFIG: SiteSeoConfig = {
  seoEnabled: true,
  siteTitle: 'TemaLoka — Editor & Pratinjau Template XML Blogger',
  metaDescription:
    'Editor XML tema Blogger (Blogspot) 100% responsif & offline: pratinjau langsung, Auto-Fix CDATA, inspektor variabel, XML Splitter, SEO & AdSense Studio.',
  metaKeywords:
    'editor xml blogger, template blogspot, tema blogger, preview xml blogger, seo blogger, adsense blogger',
  canonicalOrigin: '',
  ogImageUrl: '',
  defaultBlogUrl: '',
  robotsTxtContent: 'User-agent: *\nAllow: /\nDisallow: /?admin\n',
  sitemapEnabled: true,
  googleSiteVerification: '',
  bingSiteVerification: '',
  yandexVerification: '',
  gaMeasurementId: '',
  gtmContainerId: '',
  indexNowKey: '',
  schemaOrgEnabled: true,
  schemaOrgName: 'TemaLoka Studio',
  customHeadSnippet: '',
  updatedAtMs: 0,
  updatedByEmail: '',
};

export interface CloudflareD1AdminConfigView {
  enabled: boolean;
  accountId: string;
  databaseId: string;
  databaseName: string;
  bindingName: string;
  workerProxyUrl: string;
  hasApiToken: boolean;
  apiTokenMasked: string;
  activeMode: DbStorageMode;
  lastTestedAtMs: number;
  lastTestOk: boolean | null;
  lastTestMessage: string;
  updatedAtMs: number;
}

export interface CloudflareD1UpdatePayload {
  enabled: boolean;
  accountId: string;
  databaseId: string;
  databaseName: string;
  bindingName: string;
  workerProxyUrl: string;
  apiToken?: string;
  clearApiToken?: boolean;
}

export interface FreeLlmAdminConfigView {
  enabled: boolean;
  baseUrl: string;
  defaultModel: string;
  routingStrategy: FreeLlmRoutingStrategy;
  timeoutMs: number;
  maxTokens: number;
  temperature: number;
  allowForGuests: boolean;
  hasGatewayToken: boolean;
  gatewayTokenMasked: string;
  hasGroqKey: boolean;
  hasCerebrasKey: boolean;
  hasOpenRouterKey: boolean;
  hasMistralKey: boolean;
  hasNvidiaKey: boolean;
  hasCloudflareAiKey: boolean;
  cloudflareAiAccountId: string;
  hasGeminiCompatKey: boolean;
  updatedAtMs: number;
}

export interface FreeLlmUpdatePayload {
  enabled: boolean;
  baseUrl: string;
  defaultModel: string;
  routingStrategy: FreeLlmRoutingStrategy;
  timeoutMs: number;
  maxTokens: number;
  temperature: number;
  allowForGuests: boolean;
  gatewayToken?: string;
  clearGatewayToken?: boolean;
  groqApiKey?: string;
  cerebrasApiKey?: string;
  openRouterApiKey?: string;
  mistralApiKey?: string;
  nvidiaApiKey?: string;
  cloudflareAiAccountId?: string;
  cloudflareAiToken?: string;
  geminiCompatApiKey?: string;
}

export interface FreeLlmPublicStatus {
  enabled: boolean;
  defaultModel: string;
  routingStrategy: FreeLlmRoutingStrategy;
  allowForGuests: boolean;
  configuredProviders: string[];
}

export interface AuthUserSession {
  id: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
  tier: UserAccountTier;
  preferredMode: 'local' | 'freellm' | 'gemini';
  preferredGeminiModel: string;
  preferredFreeLlmModel: string;
  proPlanId?: string | null;
  featureOverrides?: Record<string, FeatureOverrideValue>;
}

export interface AdminAuthStatus {
  configured: boolean;
  claimedInDb: boolean;
  hasEnvPassword: boolean;
  adminEmail: string;
  adminDisplayName: string;
  dbMode: DbStorageMode;
}

export interface ManagedUserRow {
  id: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
  tier: UserAccountTier;
  proPlanId?: string | null;
  featureOverrides: Record<string, FeatureOverrideValue>;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface GoogleCloudPublicStatus {
  enabled: boolean;
  projectId: string;
  oauthEnabled: boolean;
  oauthClientId: string;
  hasGeminiApiKey: boolean;
  hasIndexingServiceAccount: boolean;
  serviceAccountEmail: string;
}

export interface GoogleCloudAdminConfigView {
  enabled: boolean;
  projectId: string;
  projectNumber: string;
  region: string;
  oauthEnabled: boolean;
  oauthClientId: string;
  oauthRedirectUri: string;
  hasGeminiApiKey: boolean;
  geminiApiKeyMasked: string;
  hasEnvGeminiApiKey: boolean;
  hasSearchConsoleApiKey: boolean;
  searchConsoleApiKeyMasked: string;
  hasIndexingServiceAccount: boolean;
  serviceAccountEmail: string;
  lastTestedAtMs: number;
  lastTestOk: boolean | null;
  lastTestMessage: string;
  updatedAtMs: number;
}

export interface GoogleCloudUpdatePayload {
  enabled: boolean;
  projectId: string;
  projectNumber: string;
  region: string;
  oauthEnabled: boolean;
  oauthClientId: string;
  oauthRedirectUri: string;
  geminiApiKey?: string;
  clearGeminiApiKey?: boolean;
  searchConsoleApiKey?: string;
  clearSearchConsoleApiKey?: boolean;
  indexingServiceAccountJson?: string;
  clearIndexingServiceAccount?: boolean;
}

export type ManualPaymentMethodType = 'bank' | 'ewallet' | 'qris' | 'paypal' | 'custom';

export interface ManualPaymentMethod {
  id: string;
  type: ManualPaymentMethodType;
  providerName: string;
  accountNumber: string;
  accountHolder: string;
  note: string;
  qrisImageUrl: string;
  enabled: boolean;
}

export interface PaymentSettingsConfig {
  manualPaymentEnabled: boolean;
  proPlanName: string;
  proPriceLabel: string;
  billingCycleLabel: string;
  paymentInstructions: string;
  confirmationButtonLabel: string;
  confirmationUrl: string;
  methods: ManualPaymentMethod[];
  updatedAtMs: number;
  updatedByEmail: string;
}

export function sanitizePublicHttpUrl(raw: unknown, maxLen = 400): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim().slice(0, maxLen);
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return '';
  } catch {
    return '';
  }
}

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettingsConfig = {
  manualPaymentEnabled: true,
  proPlanName: 'TemaLoka Pro',
  proPriceLabel: 'Rp 99.000',
  billingCycleLabel: 'Sekali Bayar / Aktivasi Manual',
  paymentInstructions:
    'Lakukan transfer sesuai nominal ke salah satu kolom pembayaran di bawah, lalu kirim bukti pembayaran beserta email akun TemaLoka Anda ke Admin untuk aktivasi paket Pro & Bebas Iklan.',
  confirmationButtonLabel: 'Konfirmasi Pembayaran',
  confirmationUrl: '',
  methods: [],
  updatedAtMs: 0,
  updatedByEmail: '',
};

export function normalizePaymentSettings(raw: unknown): PaymentSettingsConfig {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_PAYMENT_SETTINGS, methods: [] };
  }
  const obj = raw as Partial<PaymentSettingsConfig>;
  const rawMethods = Array.isArray(obj.methods) ? obj.methods : [];
  const methods: ManualPaymentMethod[] = rawMethods
    .slice(0, 30)
    .map((m, idx): ManualPaymentMethod | null => {
      if (!m || typeof m !== 'object') return null;
      const item = m as Partial<ManualPaymentMethod>;
      const providerName =
        typeof item.providerName === 'string' ? item.providerName.trim().slice(0, 80) : '';
      const accountNumber =
        typeof item.accountNumber === 'string' ? item.accountNumber.trim().slice(0, 120) : '';
      if (!providerName && !accountNumber) return null;
      const type: ManualPaymentMethodType =
        item.type === 'bank' ||
        item.type === 'ewallet' ||
        item.type === 'qris' ||
        item.type === 'paypal'
          ? item.type
          : 'custom';
      const id =
        typeof item.id === 'string' && item.id.trim()
          ? item.id.trim().slice(0, 64)
          : `pay_${idx + 1}`;
      return {
        id,
        type,
        providerName: providerName || 'Metode Pembayaran',
        accountNumber,
        accountHolder:
          typeof item.accountHolder === 'string' ? item.accountHolder.trim().slice(0, 100) : '',
        note: typeof item.note === 'string' ? item.note.trim().slice(0, 260) : '',
        qrisImageUrl: sanitizePublicHttpUrl(item.qrisImageUrl, 400),
        enabled: item.enabled !== false,
      };
    })
    .filter((v): v is ManualPaymentMethod => Boolean(v));

  return {
    manualPaymentEnabled:
      typeof obj.manualPaymentEnabled === 'boolean'
        ? obj.manualPaymentEnabled
        : DEFAULT_PAYMENT_SETTINGS.manualPaymentEnabled,
    proPlanName:
      typeof obj.proPlanName === 'string' && obj.proPlanName.trim()
        ? obj.proPlanName.trim().slice(0, 80)
        : DEFAULT_PAYMENT_SETTINGS.proPlanName,
    proPriceLabel:
      typeof obj.proPriceLabel === 'string' && obj.proPriceLabel.trim()
        ? obj.proPriceLabel.trim().slice(0, 60)
        : DEFAULT_PAYMENT_SETTINGS.proPriceLabel,
    billingCycleLabel:
      typeof obj.billingCycleLabel === 'string'
        ? obj.billingCycleLabel.trim().slice(0, 80)
        : DEFAULT_PAYMENT_SETTINGS.billingCycleLabel,
    paymentInstructions:
      typeof obj.paymentInstructions === 'string' && obj.paymentInstructions.trim()
        ? obj.paymentInstructions.trim().slice(0, 800)
        : DEFAULT_PAYMENT_SETTINGS.paymentInstructions,
    confirmationButtonLabel:
      typeof obj.confirmationButtonLabel === 'string' && obj.confirmationButtonLabel.trim()
        ? obj.confirmationButtonLabel.trim().slice(0, 60)
        : DEFAULT_PAYMENT_SETTINGS.confirmationButtonLabel,
    confirmationUrl: sanitizePublicHttpUrl(obj.confirmationUrl, 400),
    methods,
    updatedAtMs: typeof obj.updatedAtMs === 'number' ? obj.updatedAtMs : 0,
    updatedByEmail: typeof obj.updatedByEmail === 'string' ? obj.updatedByEmail : '',
  };
}

export interface PublicSiteConfigResponse {
  dbMode: DbStorageMode;
  adsense: SiteAdsenseConfig;
  units: AdsenseUnitRecord[];
  seo: SiteSeoConfig;
  premium: PremiumSettingsConfig;
  payment?: PaymentSettingsConfig;
  freellm: FreeLlmPublicStatus;
  gcloud?: GoogleCloudPublicStatus;
}
