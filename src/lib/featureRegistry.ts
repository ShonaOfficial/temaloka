export type FeatureTier = 'free' | 'pro';
export type FeatureOverrideValue = 'allow' | 'deny';

export type FeatureCategory =
  | 'Ruang Kerja'
  | 'Mesin AI'
  | 'Optimasi & XML'
  | 'SEO & Monetisasi'
  | 'Cloud & Utilitas';

export interface FeatureDefinition {
  id: string;
  name: string;
  category: FeatureCategory;
  description: string;
  defaultTier: FeatureTier;
  defaultEnabled: boolean;
}

export type ProPlanBadgeColor = 'amber' | 'blue' | 'emerald' | 'violet' | 'rose';

export interface ProPlanDefinition {
  id: string;
  name: string;
  priceLabel: string;
  billingCycleLabel: string;
  description: string;
  badgeColor: ProPlanBadgeColor;
  enabled: boolean;
  enabledFeatureIds: string[];
}

export interface FeatureAccessRule {
  tier: FeatureTier;
  enabled: boolean;
}

export interface PremiumSettingsConfig {
  enforcementEnabled: boolean;
  upgradeTitle: string;
  upgradeMessage: string;
  upgradeCtaLabel: string;
  upgradeCtaUrl: string;
  rules: Record<string, FeatureAccessRule>;
  proPlans: ProPlanDefinition[];
  defaultProPlanId: string;
  updatedAtMs: number;
  updatedByEmail: string;
}

export const FEATURE_REGISTRY: FeatureDefinition[] = [
  // Ruang Kerja
  {
    id: 'workspace_domain',
    name: 'Pencari Nama Domain & Afiliasi Registrar (Gaya Namecheap)',
    category: 'Ruang Kerja',
    description: 'Cek ketersediaan nama domain multi-ekstensi secara real-time dengan link registrasi partner afiliasi.',
    defaultTier: 'free',
    defaultEnabled: true,
  },
  {
    id: 'workspace_layout',
    name: 'Tata Letak Blogger (Drag/Reorder Section & Widget)',
    category: 'Ruang Kerja',
    description: 'Atur section dan widget template Blogger secara visual.',
    defaultTier: 'free',
    defaultEnabled: true,
  },
  {
    id: 'workspace_editor',
    name: 'Editor Kode XML + Syntax & Validasi Offline',
    category: 'Ruang Kerja',
    description: 'Editor kode XML penuh dengan pencarian baris, Auto-Fix, dan diff.',
    defaultTier: 'free',
    defaultEnabled: true,
  },
  {
    id: 'workspace_splitter',
    name: 'XML Splitter & Penggabung XML (1x Upload Bagi Banyak)',
    category: 'Ruang Kerja',
    description: 'Pecah file XML besar berurutan atau berdasarkan struktur Blogger lalu ekspor/gabungkan kembali.',
    defaultTier: 'pro',
    defaultEnabled: true,
  },
  {
    id: 'workspace_inspector',
    name: 'Inspektor Variabel, Aset & Redundansi XML',
    category: 'Ruang Kerja',
    description: 'Inspeksi variabel tema, CSS custom properties, teks halaman, dan skrip internal.',
    defaultTier: 'free',
    defaultEnabled: true,
  },
  {
    id: 'workspace_console',
    name: 'Konsol URL, Query Tester & Pencocokan Blogspot Live',
    category: 'Ruang Kerja',
    description: 'Uji query parameter URL dan bandingkan fingerprint live blog dengan XML aktif.',
    defaultTier: 'pro',
    defaultEnabled: true,
  },
  // Optimasi & XML
  {
    id: 'xml_autofix_worker',
    name: 'Auto-Fix XML Web Worker (Anti-Lag 1MB - 5MB)',
    category: 'Optimasi & XML',
    description: 'Perbaikan otomatis struktur CDATA, entitas XML, dan tag rusak via Web Worker.',
    defaultTier: 'free',
    defaultEnabled: true,
  },
  {
    id: 'xml_dead_cleaner',
    name: 'Pembersih CSS/JS Ganda & Variabel CSS Mati (O(1) Set)',
    category: 'Optimasi & XML',
    description: 'Hapus aturan CSS mati, fungsi JS tak terpakai, dan duplikasi gaya tanpa membekukan browser.',
    defaultTier: 'pro',
    defaultEnabled: true,
  },
  {
    id: 'xml_diff_checker',
    name: 'Template Diff Checker & Riwayat Snapshot Lokal',
    category: 'Optimasi & XML',
    description: 'Bandingkan XML hasil edit dengan preset asli dan kelola riwayat snapshot.',
    defaultTier: 'free',
    defaultEnabled: true,
  },
  {
    id: 'xml_ai_signature',
    name: 'Detektor Forensik AI Signature & Penetralisir',
    category: 'Optimasi & XML',
    description: 'Deteksi jejak generasi AI dan komentar tersembunyi di dalam XML template.',
    defaultTier: 'pro',
    defaultEnabled: true,
  },
  {
    id: 'xml_export_android',
    name: 'Ekspor XML Ramah Android (SAF / Data URI / Share HP)',
    category: 'Optimasi & XML',
    description: 'Simpan template XML agar langsung terdeteksi Blogger Android tanpa edit ulang.',
    defaultTier: 'free',
    defaultEnabled: true,
  },
  // Mesin AI
  {
    id: 'ai_local_offline',
    name: 'AI Lokal Perangkat & Browser (0 Kuota Server)',
    category: 'Mesin AI',
    description: 'Mesin bawaan offline, Ollama, LM Studio, llama.cpp, dan WebLLM.',
    defaultTier: 'free',
    defaultEnabled: true,
  },
  {
    id: 'ai_freellmapi',
    name: 'FreeLLMAPI Internal Web (Auto-Failover Multi-Provider)',
    category: 'Mesin AI',
    description: 'Mesin LLM internal web berkecepatan tinggi dengan routing otomatis dan failover.',
    defaultTier: 'free',
    defaultEnabled: true,
  },
  {
    id: 'ai_gemini_cloud',
    name: 'Gemini Cloud AI (Desainer Tema, Chat & Audit Mendalam)',
    category: 'Mesin AI',
    description: 'Akses model Google Gemini Cloud untuk analisis forensik, CSS, dan chat XML.',
    defaultTier: 'pro',
    defaultEnabled: true,
  },
  // SEO & Monetisasi
  {
    id: 'seo_analyzer_starter',
    name: 'Audit SEO XML, Meta Tag & Product Schema',
    category: 'SEO & Monetisasi',
    description: 'Analisis kelengkapan tag SEO Blogger dan injeksi meta tag/schema 1-klik.',
    defaultTier: 'free',
    defaultEnabled: true,
  },
  {
    id: 'seo_bulk_url_submit',
    name: 'Add URL Massal ke Search Engine, WebSub, Ping & IndexNow',
    category: 'SEO & Monetisasi',
    description: 'Kirim URL blog & artikel ke berbagai layanan indeks eksternal (bukan sumber lokal).',
    defaultTier: 'pro',
    defaultEnabled: true,
  },
  {
    id: 'seo_adsense_studio',
    name: 'Studio Injeksi Kode AdSense Blogger & ads.txt',
    category: 'SEO & Monetisasi',
    description: 'Sisipkan kode AdSense valid XHTML ke XML template dan buat ads.txt.',
    defaultTier: 'free',
    defaultEnabled: true,
  },
  {
    id: 'free_ads',
    name: 'Bebas Iklan (Free Ads / Tanpa Iklan Web)',
    category: 'SEO & Monetisasi',
    description:
      'Menghilangkan semua slot & skrip iklan Google AdSense di aplikasi web TemaLoka bagi akun yang mendapat akses.',
    defaultTier: 'pro',
    defaultEnabled: true,
  },
  // Cloud & Utilitas
  {
    id: 'cloud_notepad',
    name: 'Notepad Akun & Sinkronisasi Cloud',
    category: 'Cloud & Utilitas',
    description: 'Simpan catatan XML/CSS/URL privat per akun agar tersinkron di berbagai perangkat.',
    defaultTier: 'free',
    defaultEnabled: true,
  },
  {
    id: 'template_identity_editor',
    name: 'Editor Identitas Template & Ekstraktor ZIP',
    category: 'Cloud & Utilitas',
    description: 'Ubah metadata pembuat tema Blogger dan muat arsip template .zip.',
    defaultTier: 'free',
    defaultEnabled: true,
  },
];

const VALID_FEATURE_IDS = new Set(FEATURE_REGISTRY.map((f) => f.id));

export function sanitizeFeatureOverrides(raw: unknown): Record<string, FeatureOverrideValue> {
  if (!raw || typeof raw !== 'object') return {};
  const result: Record<string, FeatureOverrideValue> = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!VALID_FEATURE_IDS.has(key)) continue;
    if (val === 'allow' || val === 'deny') {
      result[key] = val;
    }
  }
  return result;
}

export function buildDefaultProPlans(): ProPlanDefinition[] {
  const allProDefaults = FEATURE_REGISTRY.filter((f) => f.defaultTier === 'pro').map((f) => f.id);
  return [
    {
      id: 'pro_basic',
      name: 'Pro Hemat',
      priceLabel: 'Rp 49.000',
      billingCycleLabel: 'Bulanan / Manual',
      description: 'Bebas iklan web dan akses alat XML Splitter serta Pembersih CSS/JS.',
      badgeColor: 'emerald',
      enabled: true,
      enabledFeatureIds: ['free_ads', 'workspace_splitter', 'xml_dead_cleaner'],
    },
    {
      id: 'pro_full',
      name: 'Pro Lengkap',
      priceLabel: 'Rp 99.000',
      billingCycleLabel: 'Sekali Bayar / Aktivasi Manual',
      description: 'Akses penuh seluruh fitur Pro termasuk Gemini Cloud, SEO Massal, Detektor AI, dan Bebas Iklan.',
      badgeColor: 'amber',
      enabled: true,
      enabledFeatureIds: allProDefaults,
    },
  ];
}

export function sanitizeProPlanId(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 64);
}

export function sanitizeProPlans(raw: unknown): ProPlanDefinition[] {
  if (!Array.isArray(raw)) {
    return buildDefaultProPlans();
  }
  const seen = new Set<string>();
  const cleaned: ProPlanDefinition[] = [];
  for (let idx = 0; idx < raw.length && idx < 20; idx++) {
    const item = raw[idx];
    if (!item || typeof item !== 'object') continue;
    const obj = item as Partial<ProPlanDefinition>;
    const rawName = typeof obj.name === 'string' ? obj.name.trim().slice(0, 80) : '';
    if (!rawName) continue;
    let id = sanitizeProPlanId(obj.id);
    if (!id || seen.has(id)) {
      id = `pro_${idx + 1}_${rawName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'plan'}`;
    }
    if (seen.has(id)) {
      id = `${id}_${idx + 1}`.slice(0, 64);
    }
    seen.add(id);
    const badgeColor: ProPlanBadgeColor =
      obj.badgeColor === 'blue' ||
      obj.badgeColor === 'emerald' ||
      obj.badgeColor === 'violet' ||
      obj.badgeColor === 'rose'
        ? obj.badgeColor
        : 'amber';
    const rawFeatIds = Array.isArray(obj.enabledFeatureIds) ? obj.enabledFeatureIds : [];
    const enabledFeatureIds = Array.from(
      new Set(
        rawFeatIds
          .filter((fid): fid is string => typeof fid === 'string' && VALID_FEATURE_IDS.has(fid))
      )
    );
    cleaned.push({
      id,
      name: rawName,
      priceLabel:
        typeof obj.priceLabel === 'string' ? obj.priceLabel.trim().slice(0, 60) : '',
      billingCycleLabel:
        typeof obj.billingCycleLabel === 'string'
          ? obj.billingCycleLabel.trim().slice(0, 80)
          : '',
      description:
        typeof obj.description === 'string' ? obj.description.trim().slice(0, 240) : '',
      badgeColor,
      enabled: obj.enabled !== false,
      enabledFeatureIds,
    });
  }
  return cleaned;
}

export function buildDefaultPremiumConfig(overridePreset?: 'default' | 'all-free'): PremiumSettingsConfig {
  const rules: Record<string, FeatureAccessRule> = {};
  for (const feat of FEATURE_REGISTRY) {
    rules[feat.id] = {
      tier: overridePreset === 'all-free' ? 'free' : feat.defaultTier,
      enabled: feat.defaultEnabled,
    };
  }
  const proPlans = buildDefaultProPlans();
  return {
    enforcementEnabled: false,
    upgradeTitle: 'Fitur Khusus Paket Pro',
    upgradeMessage:
      'Fitur ini ditandai sebagai paket Pro oleh Admin TemaLoka. Masuk sebagai akun Pro atau hubungi Admin untuk membuka akses penuh.',
    upgradeCtaLabel: 'Upgrade Paket Pro',
    upgradeCtaUrl: '',
    rules,
    proPlans,
    defaultProPlanId: 'pro_full',
    updatedAtMs: 0,
    updatedByEmail: '',
  };
}

export const DEFAULT_PREMIUM_CONFIG: PremiumSettingsConfig = buildDefaultPremiumConfig('default');

export function normalizePremiumConfig(raw: unknown): PremiumSettingsConfig {
  const base = buildDefaultPremiumConfig('default');
  if (!raw || typeof raw !== 'object') return base;
  const obj = raw as Partial<PremiumSettingsConfig>;
  const rawRules = obj.rules && typeof obj.rules === 'object' ? obj.rules : {};
  const mergedRules: Record<string, FeatureAccessRule> = {};
  for (const feat of FEATURE_REGISTRY) {
    const candidate = (rawRules as Record<string, Partial<FeatureAccessRule>>)[feat.id];
    mergedRules[feat.id] = {
      tier: candidate?.tier === 'pro' || candidate?.tier === 'free' ? candidate.tier : feat.defaultTier,
      enabled: typeof candidate?.enabled === 'boolean' ? candidate.enabled : feat.defaultEnabled,
    };
  }
  const proPlans = Array.isArray(obj.proPlans)
    ? sanitizeProPlans(obj.proPlans)
    : buildDefaultProPlans();
  const requestedDefault = sanitizeProPlanId(obj.defaultProPlanId);
  const validDefaultPlan =
    proPlans.find((p) => p.id === requestedDefault && p.enabled)?.id ||
    proPlans.find((p) => p.id === requestedDefault)?.id ||
    proPlans.find((p) => p.enabled)?.id ||
    proPlans[0]?.id ||
    '';

  return {
    enforcementEnabled: Boolean(obj.enforcementEnabled),
    upgradeTitle:
      typeof obj.upgradeTitle === 'string' && obj.upgradeTitle.trim()
        ? obj.upgradeTitle.slice(0, 120)
        : base.upgradeTitle,
    upgradeMessage:
      typeof obj.upgradeMessage === 'string' && obj.upgradeMessage.trim()
        ? obj.upgradeMessage.slice(0, 500)
        : base.upgradeMessage,
    upgradeCtaLabel:
      typeof obj.upgradeCtaLabel === 'string' && obj.upgradeCtaLabel.trim()
        ? obj.upgradeCtaLabel.slice(0, 80)
        : base.upgradeCtaLabel,
    upgradeCtaUrl:
      typeof obj.upgradeCtaUrl === 'string' ? obj.upgradeCtaUrl.trim().slice(0, 400) : '',
    rules: mergedRules,
    proPlans,
    defaultProPlanId: validDefaultPlan,
    updatedAtMs: typeof obj.updatedAtMs === 'number' ? obj.updatedAtMs : 0,
    updatedByEmail: typeof obj.updatedByEmail === 'string' ? obj.updatedByEmail : '',
  };
}

export function resolveUserProPlan(
  premium: PremiumSettingsConfig,
  userTier: 'free' | 'pro' | 'admin',
  userProPlanId?: string | null
): ProPlanDefinition | null {
  if (userTier !== 'pro') return null;
  const plans = Array.isArray(premium.proPlans) ? premium.proPlans : [];
  if (plans.length === 0) return null;
  if (userProPlanId) {
    const exact = plans.find((p) => p.id === userProPlanId);
    if (exact) return exact;
  }
  if (premium.defaultProPlanId) {
    const def = plans.find((p) => p.id === premium.defaultProPlanId);
    if (def) return def;
  }
  return plans.find((p) => p.enabled) || plans[0] || null;
}

export function getPlansUnlockingFeature(
  premium: PremiumSettingsConfig,
  featureId: string
): ProPlanDefinition[] {
  const plans = Array.isArray(premium.proPlans) ? premium.proPlans : [];
  return plans.filter((p) => p.enabled && p.enabledFeatureIds.includes(featureId));
}

export function getFeatureAccessStatus(
  featureId: string,
  premium: PremiumSettingsConfig,
  userTier: 'free' | 'pro' | 'admin',
  isAdmin: boolean,
  userFeatureOverrides?: Record<string, FeatureOverrideValue>,
  userProPlanId?: string | null
): {
  feature: FeatureDefinition | undefined;
  rule: FeatureAccessRule;
  allowed: boolean;
  reason: 'ok' | 'disabled' | 'pro_required' | 'override_denied' | 'plan_upgrade_required';
  override?: FeatureOverrideValue;
  activePlan?: ProPlanDefinition | null;
} {
  const feature = FEATURE_REGISTRY.find((f) => f.id === featureId);
  const rule = premium.rules[featureId] || {
    tier: feature?.defaultTier || 'free',
    enabled: feature?.defaultEnabled ?? true,
  };
  const activePlan = resolveUserProPlan(premium, userTier, userProPlanId);

  if (isAdmin || userTier === 'admin') {
    return { feature, rule, allowed: true, reason: 'ok', activePlan: null };
  }
  const override = userFeatureOverrides?.[featureId];
  if (!rule.enabled) {
    return { feature, rule, allowed: false, reason: 'disabled', override, activePlan };
  }
  if (override === 'allow') {
    return { feature, rule, allowed: true, reason: 'ok', override, activePlan };
  }
  if (override === 'deny') {
    return { feature, rule, allowed: false, reason: 'override_denied', override, activePlan };
  }
  if (premium.enforcementEnabled && rule.tier === 'pro') {
    if (userTier !== 'pro') {
      return { feature, rule, allowed: false, reason: 'pro_required', activePlan: null };
    }
    if (activePlan) {
      if (!activePlan.enabled || !activePlan.enabledFeatureIds.includes(featureId)) {
        return {
          feature,
          rule,
          allowed: false,
          reason: 'plan_upgrade_required',
          activePlan,
        };
      }
    }
  }
  return { feature, rule, allowed: true, reason: 'ok', activePlan };
}

export function hasFreeAdsPrivilege(
  premium: PremiumSettingsConfig,
  userTier: 'free' | 'pro' | 'admin',
  isAdmin: boolean,
  userFeatureOverrides?: Record<string, FeatureOverrideValue>,
  userProPlanId?: string | null
): boolean {
  if (isAdmin || userTier === 'admin') return true;
  const rule = premium.rules.free_ads || { tier: 'pro', enabled: true };
  if (!rule.enabled) return false;
  const override = userFeatureOverrides?.free_ads;
  if (override === 'allow') return true;
  if (override === 'deny') return false;
  if (rule.tier === 'free') return true;
  if (userTier !== 'pro') return false;
  const activePlan = resolveUserProPlan(premium, userTier, userProPlanId);
  if (activePlan) {
    return activePlan.enabled && activePlan.enabledFeatureIds.includes('free_ads');
  }
  return true;
}
