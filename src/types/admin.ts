import type { FeatureOverrideValue, PremiumSettingsConfig } from '../lib/featureRegistry.ts';
import type { AdsenseUnitRecord, SiteAdsenseConfig } from './adsense.ts';

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
  siteTitle: 'TemaLoka — Studio XML Blogger & Pencari Nama Domain',
  metaDescription:
    'Studio tema XML Blogger (Blogspot) 100% responsif & offline: Pencari Nama Domain, Tata Letak Visual, Auto-Fix CDATA, inspektor variabel, XML Splitter, SEO & AdSense Studio.',
  metaKeywords:
    'pencari domain, cek domain blogspot, editor xml blogger, template blogspot, tema blogger, seo blogger, adsense blogger',
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

export type DomainTldCategory = 'populer' | 'indonesia' | 'tech' | 'bisnis';

export interface AffiliateRegistrarRecord {
  id: string;
  name: string;
  affiliateUrlTemplate: string;
  websiteUrl: string;
  affiliateId: string;
  commissionNote: string;
  promoCode: string;
  badgeLabel: string;
  supportedTlds: string[];
  isFeatured: boolean;
  enabled: boolean;
}

export interface DomainTldPricingRule {
  tld: string;
  category: DomainTldCategory;
  registerPriceLabel: string;
  renewPriceLabel: string;
  promoTag: string;
  enabled: boolean;
}

export interface DomainAffiliateConfig {
  enabled: boolean;
  headline: string;
  subtitle: string;
  searchPlaceholder: string;
  currencyLabel: 'USD' | 'IDR';
  disclosureText: string;
  defaultTlds: string[];
  registrars: AffiliateRegistrarRecord[];
  tldPricing: DomainTldPricingRule[];
  updatedAtMs: number;
  updatedByEmail: string;
}

export function normalizeTldValue(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const cleaned = raw.trim().toLowerCase().replace(/^\.+/, '');
  if (!/^[a-z0-9]{1,12}(?:\.[a-z0-9]{2,12})?$/.test(cleaned)) return '';
  return `.${cleaned}`;
}

export function buildAffiliateDomainUrl(
  registrar: Pick<AffiliateRegistrarRecord, 'affiliateUrlTemplate' | 'websiteUrl' | 'affiliateId'>,
  domain: string
): string {
  const cleanDomain = domain.trim().toLowerCase().replace(/[^a-z0-9.-]/g, '');
  const parts = cleanDomain.split('.');
  const sld = parts[0] || cleanDomain;
  const tld = parts.length > 1 ? `.${parts.slice(1).join('.')}` : '';
  const affId = registrar.affiliateId.trim();

  const tpl = (registrar.affiliateUrlTemplate || '').trim();
  if (tpl) {
    const replaced = tpl
      .replace(/\{domain\}/gi, encodeURIComponent(cleanDomain))
      .replace(/\{sld\}/gi, encodeURIComponent(sld))
      .replace(/\{tld\}/gi, encodeURIComponent(tld))
      .replace(/\{affId\}/gi, encodeURIComponent(affId))
      .replace(/\{affiliateId\}/gi, encodeURIComponent(affId));
    const safe = sanitizePublicHttpUrl(replaced, 600);
    if (safe) return safe;
  }

  return sanitizePublicHttpUrl(registrar.websiteUrl, 400);
}

export interface RegistrarSignupGuide {
  id: string;
  name: string;
  platform: string;
  commissionSummary: string;
  payoutInfo: string;
  signupUrl: string;
  recommendedTemplate: string;
  steps: string[];
}

export const REGISTRAR_SIGNUP_GUIDES: Record<string, RegistrarSignupGuide> = {
  namecheap: {
    id: 'namecheap',
    name: 'Namecheap',
    platform: 'Impact.com atau CJ Affiliate',
    commissionSummary: 'Komisi 20% registrasi domain baru (pelanggan baru), hingga 35% hosting & SSL · Cookie 30 hari',
    payoutInfo: 'Pencairan bulanan via PayPal / transfer bank · Minimum WD $10 (Impact) / $50 (CJ)',
    signupUrl: 'https://www.namecheap.com/affiliates/',
    recommendedTemplate: 'https://www.namecheap.com/domains/registration/results/?domain={domain}&aff={affId}',
    steps: [
      'Buka halaman resmi Namecheap Affiliates lalu klik tombol Apply / Join via Impact.com atau CJ Affiliate.',
      'Buat atau login akun Impact.com / CJ Affiliate, isi profil situs Anda (masukkan URL web TemaLoka Anda), lalu kirim pengajuan kemitraan Namecheap.',
      'Setelah disetujui, buka menu Create Link / Deep Link di Impact/CJ, salin link pelacakan atau ID afiliasi Anda.',
      'Tempel link/ID di form Edit Namecheap di Panel Admin ini (gunakan variabel {domain} pada template URL agar langsung mengarah ke nama domain yang dicari pengunjung), lalu klik Simpan.',
    ],
  },
  dynadot: {
    id: 'dynadot',
    name: 'Dynadot',
    platform: 'In-House (Dynadot Ambassador) atau CJ Affiliate',
    commissionSummary: 'Komisi 30% (Ambassador langsung) atau 25% (CJ) untuk registrasi/transfer domain pelanggan baru + 15% lelang domain',
    payoutInfo: 'Pilih salah satu jalur saja (Ambassador atau CJ Affiliate; tidak bisa pindah setelah memilih)',
    signupUrl: 'https://www.dynadot.com/',
    recommendedTemplate: 'https://www.dynadot.com/domain/search?domain={domain}&ref={affId}',
    steps: [
      'Buat akun gratis di Dynadot.com (atau gunakan akun CJ Affiliate jika ingin lewat jaringan CJ).',
      'Jika memilih jalur In-House (30%): login ke Control Panel Dynadot → buka menu Tools → Ambassador Program → aktifkan akun Ambassador Anda.',
      'Salin kode referral / parameter link unik Ambassador Anda dari halaman Tools → Ambassador Program.',
      'Masukkan ID referral ke kolom "ID Afiliasi" dan pastikan Template URL mengandung ?domain={domain}&ref={affId} (atau link deep-link CJ Anda), lalu klik Simpan.',
    ],
  },
  spaceship: {
    id: 'spaceship',
    name: 'Spaceship',
    platform: 'Impact.com',
    commissionSummary: 'Komisi mulai 25% untuk registrasi & transfer domain pelanggan baru (hingga 50% hosting) · Cookie 30 hari',
    payoutInfo: 'Dikelola via Impact.com · Minimum pencairan rendah ($10) per bulan',
    signupUrl: 'https://www.spaceship.com/',
    recommendedTemplate: 'https://www.spaceship.com/domain-search/?query={domain}&tab=domains&aff={affId}',
    steps: [
      'Daftar atau login ke akun publisher di Impact.com (platform yang sama seperti Namecheap).',
      'Cari brand "Spaceship" di Marketplace Impact.com, isi deskripsi situs web Anda, dan ajukan bergabung.',
      'Setelah disetujui, buat Deep Link di Impact dengan target URL https://www.spaceship.com/domain-search/?query={domain}&tab=domains atau salin tracking URL Impact Anda.',
      'Masukkan link pelacakan tersebut ke Template URL Spaceship di Panel Admin ini lalu klik Simpan.',
    ],
  },
  hover: {
    id: 'hover',
    name: 'Hover',
    platform: 'Impact Radius (Impact.com)',
    commissionSummary: 'Komisi 20% per penjualan registrasi domain standar & layanan email · Cookie 30 hari',
    payoutInfo: 'Pencairan bulanan via Impact (sekitar tanggal 15 bulan berikutnya) tanpa syarat minimum penjualan',
    signupUrl: 'https://www.hover.com/',
    recommendedTemplate: 'https://www.hover.com/domains/results?q={domain}&aff={affId}',
    steps: [
      'Kunjungi halaman utama Hover.com dan gulir ke footer bagian Affiliates (atau cari "Hover" langsung di Impact.com).',
      'Ajukan pendaftaran sebagai partner Hover melalui akun Impact Radius Anda.',
      'Setelah aplikasi disetujui, buat Custom Deep Link di Impact menuju halaman pencarian domain Hover.',
      'Tempel link pelacakan atau ID afiliasi Hover ke form Edit di Panel Admin ini dan klik Simpan.',
    ],
  },
  namesilo: {
    id: 'namesilo',
    name: 'NameSilo',
    platform: 'In-House (Dashboard Akun NameSilo)',
    commissionSummary: 'Komisi 10% pada order pertama pelanggan baru (registrasi & transfer) · Masa berlaku cookie 1 tahun',
    payoutInfo: 'Dana ditahan 60 hari untuk verifikasi, lalu dibayarkan setiap tanggal 1 awal bulan (bisa via PayPal / akun kredit)',
    signupUrl: 'https://www.namesilo.com/',
    recommendedTemplate: 'https://www.namesilo.com/domain/search-domains?query={domain}&rid={affId}',
    steps: [
      'Daftar akun gratis di NameSilo.com lalu login ke dashboard akun Anda.',
      'Buka menu "Affiliate Program Manager" di dalam dashboard akun NameSilo untuk menyetujui syarat program.',
      'Salin Referral ID (rid) dan kode kupon khusus afiliasi jika Anda membuatnya di dashboard NameSilo.',
      'Isi "ID Afiliasi" dengan rid NameSilo Anda pada form Edit di Panel Admin (pastikan template link menggunakan ?query={domain}&rid={affId}), lalu klik Simpan.',
    ],
  },
  domainesia: {
    id: 'domainesia',
    name: 'DomaiNesia',
    platform: 'In-House (MyDomaiNesia)',
    commissionSummary: 'Komisi afiliasi lokal hingga 50% (domain .ID/.COM & paket hosting) lewat sistem pelacakan MyDomaiNesia',
    payoutInfo: 'Pembayaran Rupiah langsung ke rekening bank lokal secara berkala saat saldo minimum terpenuhi',
    signupUrl: 'https://my.domainesia.com',
    recommendedTemplate: 'https://www.domainesia.com/domain/?domain={domain}&aff={affId}',
    steps: [
      'Buka https://my.domainesia.com lalu daftar akun pelanggan baru atau login jika sudah punya akun.',
      'Di dalam dashboard MyDomaiNesia, klik menu "Afiliasi" dan aktifkan akun afiliasi Anda (gratis tanpa biaya).',
      'Salin Link Referral atau kode parameter afiliasi unik milik Anda dari halaman dashboard Afiliasi.',
      'Tempel URL/ID referral tersebut ke form Edit DomaiNesia di Panel Admin ini, lalu klik Simpan.',
    ],
  },
  niagahoster: {
    id: 'niagahoster',
    name: 'Niagahoster',
    platform: 'In-House (Member Area Niagahoster)',
    commissionSummary: 'Komisi afiliasi Indonesia hingga 70% (domain & paket hosting sesuai S&K promo aktif)',
    payoutInfo: 'Pencairan Rupiah ke rekening bank lokal Indonesia melalui dashboard afiliasi Member Area',
    signupUrl: 'https://www.niagahoster.co.id/member',
    recommendedTemplate: 'https://www.niagahoster.co.id/domain-murah?domain={domain}&ref={affId}',
    steps: [
      'Login atau buat akun terlebih dahulu melalui Member Area resmi Niagahoster (https://www.niagahoster.co.id/member).',
      'Masuk ke menu "Afiliasi / Affiliate" di dalam dashboard member area lalu aktifkan kepesertaan afiliasi Anda.',
      'Salin tautan referral atau tracking ID afiliasi Anda (perhatikan syarat apakah berlaku untuk domain saja atau bundling hosting).',
      'Masukkan tracking URL / ID tersebut ke form Edit Niagahoster di Panel Admin ini lalu klik Simpan.',
    ],
  },
  rumahweb: {
    id: 'rumahweb',
    name: 'Rumahweb',
    platform: 'In-House (Clientzone Rumahweb)',
    commissionSummary: 'Komisi persentase/referral resmi untuk transaksi domain & hosting Indonesia dari pengguna baru',
    payoutInfo: 'Dikelola langsung melalui portal Clientzone Rumahweb dengan pencairan Rupiah ke rekening bank',
    signupUrl: 'https://clientzone.rumahweb.com',
    recommendedTemplate: 'https://www.rumahweb.com/domain-murah/?domain={domain}&aff={affId}',
    steps: [
      'Masuk atau daftar akun melalui portal resmi Clientzone Rumahweb (https://clientzone.rumahweb.com).',
      'Buka menu Program Afiliasi / Referral di dalam Clientzone untuk mengaktifkan tautan unik akun Anda.',
      'Salin link referral / kode afiliasi yang diberikan oleh sistem Clientzone.',
      'Isi Template URL & ID Afiliasi Rumahweb di Panel Admin ini dan klik Simpan.',
    ],
  },
  idcloudhost: {
    id: 'idcloudhost',
    name: 'IDCloudHost',
    platform: 'In-House (Portal IDCloudHost)',
    commissionSummary: 'Komisi afiliasi domain, cloud hosting, & VPS dengan fitur Custom Link Affiliate per halaman',
    payoutInfo: 'Pencairan Rupiah dengan ambang minimum penarikan rendah langsung dari Client Area IDCloudHost',
    signupUrl: 'https://portal.idcloudhost.com',
    recommendedTemplate: 'https://idcloudhost.com/domain/?domain={domain}&aff={affId}',
    steps: [
      'Daftar atau login ke Portal Client Area IDCloudHost di https://portal.idcloudhost.com.',
      'Pada panel sebelah kiri dashboard, klik menu "Affiliates" lalu tekan tombol aktivasi akun afiliasi.',
      'Gunakan fitur Custom Link Affiliate di dashboard IDCloudHost atau salin parameter ID afiliasi Anda (?aff=...).',
      'Tempel link pelacakan atau ID afiliasi tersebut ke form Edit IDCloudHost di Panel Admin ini lalu klik Simpan.',
    ],
  },
};

export function findRegistrarSignupGuide(id: string, name?: string): RegistrarSignupGuide | null {
  const cleanId = id.trim().toLowerCase();
  if (REGISTRAR_SIGNUP_GUIDES[cleanId]) return REGISTRAR_SIGNUP_GUIDES[cleanId];
  const cleanName = (name || '').trim().toLowerCase();
  for (const guide of Object.values(REGISTRAR_SIGNUP_GUIDES)) {
    if (cleanId.includes(guide.id) || (cleanName && cleanName.includes(guide.id))) {
      return guide;
    }
  }
  return null;
}

export const DEFAULT_AFFILIATE_REGISTRARS: AffiliateRegistrarRecord[] = [
  {
    id: 'namecheap',
    name: 'Namecheap',
    affiliateUrlTemplate: 'https://www.namecheap.com/domains/registration/results/?domain={domain}',
    websiteUrl: 'https://www.namecheap.com/',
    affiliateId: '',
    commissionNote: 'Komisi 20% registrasi domain baru (hingga 35% hosting/SSL) via Impact / CJ Affiliate · Cookie 30 hari',
    promoCode: 'NEWCOM598',
    badgeLabel: 'Komisi 20% · Global',
    supportedTlds: [],
    isFeatured: true,
    enabled: true,
  },
  {
    id: 'dynadot',
    name: 'Dynadot',
    affiliateUrlTemplate: 'https://www.dynadot.com/domain/search?domain={domain}',
    websiteUrl: 'https://www.dynadot.com/',
    affiliateId: '',
    commissionNote: 'Komisi 30% (Ambassador langsung) atau 25% (CJ Affiliate) untuk registrasi & transfer domain baru',
    promoCode: '',
    badgeLabel: 'Komisi 25%–30%',
    supportedTlds: [],
    isFeatured: false,
    enabled: true,
  },
  {
    id: 'spaceship',
    name: 'Spaceship',
    affiliateUrlTemplate: 'https://www.spaceship.com/domain-search/?query={domain}&tab=domains',
    websiteUrl: 'https://www.spaceship.com/',
    affiliateId: '',
    commissionNote: 'Komisi mulai 25% untuk registrasi & transfer domain pelanggan baru via Impact · Min WD $10',
    promoCode: '',
    badgeLabel: 'Komisi 25%+',
    supportedTlds: [],
    isFeatured: false,
    enabled: true,
  },
  {
    id: 'hover',
    name: 'Hover',
    affiliateUrlTemplate: 'https://www.hover.com/domains/results?q={domain}',
    websiteUrl: 'https://www.hover.com/',
    affiliateId: '',
    commissionNote: 'Komisi 20% per registrasi domain standar via Impact Radius · Tanpa batas minimum penjualan',
    promoCode: '',
    badgeLabel: 'Komisi 20%',
    supportedTlds: [],
    isFeatured: false,
    enabled: true,
  },
  {
    id: 'namesilo',
    name: 'NameSilo',
    affiliateUrlTemplate: 'https://www.namesilo.com/domain/search-domains?query={domain}',
    websiteUrl: 'https://www.namesilo.com/',
    affiliateId: '',
    commissionNote: 'Komisi 10% order pertama pelanggan baru (program in-house langsung) · Cookie 1 tahun',
    promoCode: '',
    badgeLabel: 'Komisi 10% · 1 Thn Cookie',
    supportedTlds: [],
    isFeatured: false,
    enabled: true,
  },
  {
    id: 'domainesia',
    name: 'DomaiNesia',
    affiliateUrlTemplate: 'https://www.domainesia.com/domain/?domain={domain}',
    websiteUrl: 'https://www.domainesia.com/',
    affiliateId: '',
    commissionNote: 'Komisi afiliasi hingga 50% (MyDomaiNesia) · Mendukung domain .ID & pencairan Rupiah',
    promoCode: '',
    badgeLabel: 'Lokal .ID · Hingga 50%',
    supportedTlds: ['.id', '.my.id', '.co.id', '.web.id', '.biz.id', '.com', '.net', '.xyz'],
    isFeatured: false,
    enabled: true,
  },
  {
    id: 'niagahoster',
    name: 'Niagahoster',
    affiliateUrlTemplate: 'https://www.niagahoster.co.id/domain-murah?domain={domain}',
    websiteUrl: 'https://www.niagahoster.co.id/',
    affiliateId: '',
    commissionNote: 'Komisi afiliasi hingga 70% (Member Area Niagahoster) · Dukungan .ID & bank lokal',
    promoCode: '',
    badgeLabel: 'Lokal .ID · Hingga 70%',
    supportedTlds: ['.id', '.my.id', '.co.id', '.com', '.net', '.org', '.online', '.site'],
    isFeatured: false,
    enabled: true,
  },
  {
    id: 'rumahweb',
    name: 'Rumahweb',
    affiliateUrlTemplate: 'https://www.rumahweb.com/domain-murah/?domain={domain}',
    websiteUrl: 'https://www.rumahweb.com/',
    affiliateId: '',
    commissionNote: 'Program referral & afiliasi resmi Clientzone Rumahweb untuk transaksi domain & hosting Indonesia',
    promoCode: '',
    badgeLabel: 'Lokal .ID · Referral',
    supportedTlds: ['.id', '.my.id', '.co.id', '.web.id', '.com', '.net', '.org'],
    isFeatured: false,
    enabled: true,
  },
  {
    id: 'idcloudhost',
    name: 'IDCloudHost',
    affiliateUrlTemplate: 'https://idcloudhost.com/domain/?domain={domain}',
    websiteUrl: 'https://idcloudhost.com/',
    affiliateId: '',
    commissionNote: 'Program afiliasi in-house Portal IDCloudHost dengan custom link & pencairan WD ringan',
    promoCode: '',
    badgeLabel: 'Lokal .ID · In-House',
    supportedTlds: ['.id', '.my.id', '.co.id', '.com', '.net', '.org', '.xyz'],
    isFeatured: false,
    enabled: true,
  },
];

export const DEFAULT_DOMAIN_TLD_PRICING: DomainTldPricingRule[] = [
  { tld: '.com', category: 'populer', registerPriceLabel: '$5.98', renewPriceLabel: '$15.88/thn', promoTag: 'Terlaris', enabled: true },
  { tld: '.id', category: 'indonesia', registerPriceLabel: 'Rp 219.000', renewPriceLabel: 'Rp 249.000/thn', promoTag: 'Identitas ID', enabled: true },
  { tld: '.my.id', category: 'indonesia', registerPriceLabel: 'Rp 15.000', renewPriceLabel: 'Rp 25.000/thn', promoTag: 'Hemat Blog', enabled: true },
  { tld: '.co.id', category: 'indonesia', registerPriceLabel: 'Rp 275.000', renewPriceLabel: 'Rp 299.000/thn', promoTag: 'Perusahaan', enabled: true },
  { tld: '.net', category: 'populer', registerPriceLabel: '$10.98', renewPriceLabel: '$14.98/thn', promoTag: '', enabled: true },
  { tld: '.org', category: 'populer', registerPriceLabel: '$7.48', renewPriceLabel: '$14.98/thn', promoTag: 'Komunitas', enabled: true },
  { tld: '.io', category: 'tech', registerPriceLabel: '$32.98', renewPriceLabel: '$48.98/thn', promoTag: 'Startup & Tech', enabled: true },
  { tld: '.dev', category: 'tech', registerPriceLabel: '$12.98', renewPriceLabel: '$16.98/thn', promoTag: 'Developer', enabled: true },
  { tld: '.ai', category: 'tech', registerPriceLabel: '$72.98', renewPriceLabel: '$89.98/thn', promoTag: 'AI & SaaS', enabled: true },
  { tld: '.xyz', category: 'populer', registerPriceLabel: '$1.98', renewPriceLabel: '$13.98/thn', promoTag: 'Promo Tahun 1', enabled: true },
  { tld: '.site', category: 'bisnis', registerPriceLabel: '$1.98', renewPriceLabel: '$29.98/thn', promoTag: 'Promo', enabled: true },
  { tld: '.online', category: 'bisnis', registerPriceLabel: '$1.98', renewPriceLabel: '$34.98/thn', promoTag: 'Promo', enabled: true },
  { tld: '.blog', category: 'populer', registerPriceLabel: '$4.98', renewPriceLabel: '$28.98/thn', promoTag: 'Blogger', enabled: true },
  { tld: '.store', category: 'bisnis', registerPriceLabel: '$2.98', renewPriceLabel: '$44.98/thn', promoTag: 'Toko Online', enabled: true },
];

export const DEFAULT_DOMAIN_AFFILIATE_CONFIG: DomainAffiliateConfig = {
  enabled: true,
  headline: 'Cari & Amankan Nama Domain Blog Anda',
  subtitle:
    'Periksa ketersediaan domain .com, .id, .my.id, .net, dan ekstensi populer secara real-time, bandingkan partner registrar, lalu lanjutkan pendaftaran dengan aman.',
  searchPlaceholder: 'Ketik nama domain atau kata kunci brand (misal: temaloka atau jurnalblog.com)',
  currencyLabel: 'USD',
  disclosureText:
    'Tautan pendaftaran domain menuju partner registrar resmi. Semua partner yang tampil menyediakan program komisi afiliasi yang dikelola Admin TemaLoka tanpa biaya tambahan bagi Anda.',
  defaultTlds: ['.com', '.id', '.my.id', '.net', '.org', '.io', '.dev', '.xyz', '.blog', '.co.id'],
  registrars: DEFAULT_AFFILIATE_REGISTRARS,
  tldPricing: DEFAULT_DOMAIN_TLD_PRICING,
  updatedAtMs: 0,
  updatedByEmail: '',
};

export function normalizeDomainAffiliateConfig(raw: unknown): DomainAffiliateConfig {
  if (!raw || typeof raw !== 'object') {
    return {
      ...DEFAULT_DOMAIN_AFFILIATE_CONFIG,
      defaultTlds: [...DEFAULT_DOMAIN_AFFILIATE_CONFIG.defaultTlds],
      registrars: DEFAULT_AFFILIATE_REGISTRARS.map((r) => ({ ...r, supportedTlds: [...r.supportedTlds] })),
      tldPricing: DEFAULT_DOMAIN_TLD_PRICING.map((p) => ({ ...p })),
    };
  }
  const obj = raw as Partial<DomainAffiliateConfig>;
  const rawRegistrars = Array.isArray(obj.registrars) ? obj.registrars : DEFAULT_AFFILIATE_REGISTRARS;
  const seenReg = new Set<string>();
  const registrars: AffiliateRegistrarRecord[] = rawRegistrars
    .slice(0, 30)
    .map((item, idx): AffiliateRegistrarRecord | null => {
      if (!item || typeof item !== 'object') return null;
      const r = item as Partial<AffiliateRegistrarRecord>;
      const name = typeof r.name === 'string' ? r.name.trim().slice(0, 80) : '';
      if (!name) return null;
      let id =
        typeof r.id === 'string' && r.id.trim()
          ? r.id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 48)
          : `reg_${idx + 1}`;
      // Skip registrars without public commission programs (e.g. Porkbun legacy default)
      if (id === 'porkbun') return null;
      if (!id || seenReg.has(id)) {
        id = `${id || 'reg'}_${idx + 1}`.slice(0, 48);
      }
      seenReg.add(id);

      const rawTpl = typeof r.affiliateUrlTemplate === 'string' ? r.affiliateUrlTemplate.trim().slice(0, 500) : '';
      const safeTpl = rawTpl
        ? sanitizePublicHttpUrl(
            rawTpl
              .replace(/\{domain\}/gi, 'example.com')
              .replace(/\{sld\}/gi, 'example')
              .replace(/\{tld\}/gi, '.com')
              .replace(/\{affId\}/gi, 'ref')
              .replace(/\{affiliateId\}/gi, 'ref'),
            600
          )
          ? rawTpl
          : ''
        : '';

      const rawTlds = Array.isArray(r.supportedTlds) ? r.supportedTlds : [];
      const supportedTlds = Array.from(
        new Set(rawTlds.map((t) => normalizeTldValue(t)).filter(Boolean))
      ).slice(0, 30);

      return {
        id,
        name,
        affiliateUrlTemplate: safeTpl,
        websiteUrl: sanitizePublicHttpUrl(r.websiteUrl, 400),
        affiliateId: typeof r.affiliateId === 'string' ? r.affiliateId.trim().slice(0, 120) : '',
        commissionNote: typeof r.commissionNote === 'string' ? r.commissionNote.trim().slice(0, 220) : '',
        promoCode: typeof r.promoCode === 'string' ? r.promoCode.trim().slice(0, 40) : '',
        badgeLabel: typeof r.badgeLabel === 'string' ? r.badgeLabel.trim().slice(0, 40) : '',
        supportedTlds,
        isFeatured: Boolean(r.isFeatured),
        enabled: r.enabled !== false,
      };
    })
    .filter((v): v is AffiliateRegistrarRecord => Boolean(v));

  // Ensure at most one primary featured registrar if multiple enabled exist
  let foundFeatured = false;
  for (const r of registrars) {
    if (r.isFeatured && r.enabled) {
      if (!foundFeatured) {
        foundFeatured = true;
      } else {
        r.isFeatured = false;
      }
    } else if (r.isFeatured && !r.enabled) {
      r.isFeatured = false;
    }
  }
  if (!foundFeatured) {
    const firstEnabled = registrars.find((r) => r.enabled);
    if (firstEnabled) firstEnabled.isFeatured = true;
  }

  const rawPricing = Array.isArray(obj.tldPricing) ? obj.tldPricing : DEFAULT_DOMAIN_TLD_PRICING;
  const seenTld = new Set<string>();
  const tldPricing: DomainTldPricingRule[] = rawPricing
    .slice(0, 40)
    .map((item): DomainTldPricingRule | null => {
      if (!item || typeof item !== 'object') return null;
      const p = item as Partial<DomainTldPricingRule>;
      const tld = normalizeTldValue(p.tld);
      if (!tld || seenTld.has(tld)) return null;
      seenTld.add(tld);
      const category: DomainTldCategory =
        p.category === 'indonesia' || p.category === 'tech' || p.category === 'bisnis'
          ? p.category
          : 'populer';
      return {
        tld,
        category,
        registerPriceLabel:
          typeof p.registerPriceLabel === 'string' ? p.registerPriceLabel.trim().slice(0, 40) : '',
        renewPriceLabel:
          typeof p.renewPriceLabel === 'string' ? p.renewPriceLabel.trim().slice(0, 40) : '',
        promoTag: typeof p.promoTag === 'string' ? p.promoTag.trim().slice(0, 40) : '',
        enabled: p.enabled !== false,
      };
    })
    .filter((v): v is DomainTldPricingRule => Boolean(v));

  const rawDefaults = Array.isArray(obj.defaultTlds) ? obj.defaultTlds : DEFAULT_DOMAIN_AFFILIATE_CONFIG.defaultTlds;
  const defaultTlds = Array.from(
    new Set(rawDefaults.map((t) => normalizeTldValue(t)).filter(Boolean))
  ).slice(0, 16);

  return {
    enabled: obj.enabled !== false,
    headline:
      typeof obj.headline === 'string' && obj.headline.trim()
        ? obj.headline.trim().slice(0, 140)
        : DEFAULT_DOMAIN_AFFILIATE_CONFIG.headline,
    subtitle:
      typeof obj.subtitle === 'string' && obj.subtitle.trim()
        ? obj.subtitle.trim().slice(0, 360)
        : DEFAULT_DOMAIN_AFFILIATE_CONFIG.subtitle,
    searchPlaceholder:
      typeof obj.searchPlaceholder === 'string' && obj.searchPlaceholder.trim()
        ? obj.searchPlaceholder.trim().slice(0, 140)
        : DEFAULT_DOMAIN_AFFILIATE_CONFIG.searchPlaceholder,
    currencyLabel: obj.currencyLabel === 'IDR' ? 'IDR' : 'USD',
    disclosureText:
      typeof obj.disclosureText === 'string'
        ? obj.disclosureText.trim().slice(0, 400)
        : DEFAULT_DOMAIN_AFFILIATE_CONFIG.disclosureText,
    defaultTlds:
      defaultTlds.length > 0 ? defaultTlds : [...DEFAULT_DOMAIN_AFFILIATE_CONFIG.defaultTlds],
    registrars,
    tldPricing,
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
  domainAffiliate?: DomainAffiliateConfig;
  freellm: FreeLlmPublicStatus;
  gcloud?: GoogleCloudPublicStatus;
}
