import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Ban,
  Building2,
  Check,
  CheckCircle2,
  Cloud,
  Code2,
  Copy,
  CreditCard,
  Crown,
  Database,
  DollarSign,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Globe,
  HardDrive,
  KeyRound,
  Layout,
  Loader2,
  LogIn,
  LogOut,
  Plus,
  PlusCircle,
  QrCode,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Sliders,
  Smartphone,
  Sparkles,
  Trash2,
  Upload,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import { useAuthAndAi } from '../contexts/AuthAndAiContext';
import type { SiteAdsenseController } from '../hooks/useSiteAdsense';
import {
  ADMIN_BOOTSTRAP_EMAIL,
  buildAdsTxtLine,
  sanitizePublisherId,
  sanitizeSlotDigits,
  type AdsenseUnitFormatType,
  type AdsenseUnitPlacementType,
  type AdsenseUnitRecord,
  type FooterSlotFormat,
  type ModalSlotFormat,
  type SidebarSlotFormat,
  type SiteAdsenseConfig,
  type TopBannerFormat,
} from '../types/adsense';
import {
  sanitizePublicHttpUrl,
  type AdminAuthStatus,
  type CloudflareD1AdminConfigView,
  type FreeLlmAdminConfigView,
  type FreeLlmRoutingStrategy,
  type GoogleCloudAdminConfigView,
  type ManagedUserRow,
  type ManualPaymentMethod,
  type ManualPaymentMethodType,
  type PaymentSettingsConfig,
  type SiteSeoConfig,
  type UserAccountTier,
} from '../types/admin';
import {
  buildDefaultPremiumConfig,
  FEATURE_REGISTRY,
  type FeatureCategory,
  type FeatureOverrideValue,
  type PremiumSettingsConfig,
} from '../lib/featureRegistry';
import { FREELLM_MODELS } from '../lib/aiEngineCatalog';
import {
  buildAdsensePreviewSnippet,
  injectAdsenseIntoXml,
} from '../lib/seoAndErrorAnalyzer';
import type { ParsedTemplateInfo } from '../types/blogger';

interface AdminAdsensePanelProps {
  siteAdsense: SiteAdsenseController;
  xml: string;
  parsedInfo: ParsedTemplateInfo;
  onUpdateXml: (nextXml: string, feedbackMessage: string) => void;
  onExitAdmin: () => void;
  onNotify?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

type AdminTab =
  | 'd1'
  | 'gcloud'
  | 'freellm'
  | 'premium'
  | 'payment'
  | 'seo'
  | 'adsense'
  | 'account';

type AdsenseSubTab = 'global' | 'slots' | 'units' | 'adstxt';

const WRANGLER_TOML_SNIPPET = `name = "temaloka-studio"
compatibility_date = "2026-01-01"

[[d1_databases]]
binding = "DB"
database_name = "temaloka_db"
database_id = "<ISI_DATABASE_ID_DARI_CLOUDFLARE>"`;

export const AdminAdsensePanel: React.FC<AdminAdsensePanelProps> = ({
  siteAdsense,
  xml,
  parsedInfo,
  onUpdateXml,
  onExitAdmin,
  onNotify,
}) => {
  const {
    user,
    sessionToken,
    authReady,
    isSigningIn,
    isAdmin,
    lastAuthError,
    clearLastAuthError,
    signInAsAdmin,
    claimAdminAccount,
    updateAdminAccount,
    signOutAccount,
  } = useAuthAndAi();

  const [activeTab, setActiveTab] = useState<AdminTab>('d1');
  const [adsenseSubTab, setAdsenseSubTab] = useState<AdsenseSubTab>('global');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  // Admin auth status & form states
  const [adminStatus, setAdminStatus] = useState<AdminAuthStatus | null>(null);
  const [loadingAdminStatus, setLoadingAdminStatus] = useState(true);
  const [loginEmail, setLoginEmail] = useState<string>(ADMIN_BOOTSTRAP_EMAIL);
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginFormError, setLoginFormError] = useState<string | null>(null);
  const [claimEmail, setClaimEmail] = useState<string>(ADMIN_BOOTSTRAP_EMAIL);
  const [claimName, setClaimName] = useState('Admin TemaLoka');
  const [claimPassword, setClaimPassword] = useState('');
  const [claimConfirm, setClaimConfirm] = useState('');
  const [showClaimPassword, setShowClaimPassword] = useState(false);
  const [showClaimConfirm, setShowClaimConfirm] = useState(false);
  const [claimFormError, setClaimFormError] = useState<string | null>(null);

  // Cloudflare D1 config states
  const [d1View, setD1View] = useState<CloudflareD1AdminConfigView | null>(null);
  const [d1Enabled, setD1Enabled] = useState(false);
  const [d1AccountId, setD1AccountId] = useState('');
  const [d1DatabaseId, setD1DatabaseId] = useState('');
  const [d1DatabaseName, setD1DatabaseName] = useState('temaloka_db');
  const [d1BindingName, setD1BindingName] = useState('DB');
  const [d1WorkerProxyUrl, setD1WorkerProxyUrl] = useState('');
  const [d1ApiTokenInput, setD1ApiTokenInput] = useState('');
  const [d1BusyAction, setD1BusyAction] = useState<string | null>(null);

  // Google Cloud Console config states
  const [gcloudView, setGcloudView] = useState<GoogleCloudAdminConfigView | null>(null);
  const [gcloudEnabled, setGcloudEnabled] = useState(false);
  const [gcloudProjectId, setGcloudProjectId] = useState('');
  const [gcloudProjectNumber, setGcloudProjectNumber] = useState('');
  const [gcloudRegion, setGcloudRegion] = useState('asia-northeast1');
  const [gcloudOauthEnabled, setGcloudOauthEnabled] = useState(false);
  const [gcloudOauthClientId, setGcloudOauthClientId] = useState('');
  const [gcloudOauthRedirectUri, setGcloudOauthRedirectUri] = useState('');
  const [gcloudGeminiKeyInput, setGcloudGeminiKeyInput] = useState('');
  const [showGcloudGeminiKey, setShowGcloudGeminiKey] = useState(false);
  const [gcloudSearchConsoleKeyInput, setGcloudSearchConsoleKeyInput] = useState('');
  const [showGcloudScKey, setShowGcloudScKey] = useState(false);
  const [gcloudServiceAccountJson, setGcloudServiceAccountJson] = useState('');
  const [gcloudBusyAction, setGcloudBusyAction] = useState<string | null>(null);
  const [gcloudTestResult, setGcloudTestResult] = useState<{
    ok: boolean;
    message: string;
    details?: {
      projectConfigured: boolean;
      geminiKeyStatus: string;
      oauthStatus: string;
      serviceAccountStatus: string;
    };
  } | null>(null);

  // FreeLLMAPI config states
  const [freeLlmView, setFreeLlmView] = useState<FreeLlmAdminConfigView | null>(null);
  const [freeEnabled, setFreeEnabled] = useState(true);
  const [freeAllowGuests, setFreeAllowGuests] = useState(true);
  const [freeBaseUrl, setFreeBaseUrl] = useState('');
  const [freeGatewayToken, setFreeGatewayToken] = useState('');
  const [freeDefaultModel, setFreeDefaultModel] = useState('auto');
  const [freeRoutingStrategy, setFreeRoutingStrategy] =
    useState<FreeLlmRoutingStrategy>('auto');
  const [freeMaxTokens, setFreeMaxTokens] = useState(2048);
  const [freeTemperature, setFreeTemperature] = useState(0.5);
  const [freeTimeoutMs, setFreeTimeoutMs] = useState(25000);
  const [freeGroqKey, setFreeGroqKey] = useState('');
  const [freeCerebrasKey, setFreeCerebrasKey] = useState('');
  const [freeOpenRouterKey, setFreeOpenRouterKey] = useState('');
  const [freeMistralKey, setFreeMistralKey] = useState('');
  const [freeNvidiaKey, setFreeNvidiaKey] = useState('');
  const [freeCfAccountId, setFreeCfAccountId] = useState('');
  const [freeCfToken, setFreeCfToken] = useState('');
  const [freeGeminiCompatKey, setFreeGeminiCompatKey] = useState('');
  const [freeBusyAction, setFreeBusyAction] = useState<string | null>(null);
  const [freeTestResult, setFreeTestResult] = useState<{
    ok: boolean;
    provider?: string;
    model?: string;
    reply?: string;
    error?: string;
  } | null>(null);

  // Premium Pro/Free checklist state
  const [premiumDraft, setPremiumDraft] = useState<PremiumSettingsConfig>(
    siteAdsense.premiumConfig
  );
  const [premiumDirty, setPremiumDirty] = useState(false);
  const [featureCatFilter, setFeatureCatFilter] = useState<'all' | FeatureCategory>('all');

  // Web SEO config state
  const [seoDraft, setSeoDraft] = useState<SiteSeoConfig>(siteAdsense.seoConfig);
  const [seoDirty, setSeoDirty] = useState(false);

  // AdSense state
  const [adsDraft, setAdsDraft] = useState<SiteAdsenseConfig>(siteAdsense.config);
  const [adsDirty, setAdsDirty] = useState(false);
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [unitName, setUnitName] = useState('');
  const [unitSlotId, setUnitSlotId] = useState('');
  const [unitFormat, setUnitFormat] = useState<AdsenseUnitFormatType>('responsive');
  const [unitPlacement, setUnitPlacement] =
    useState<AdsenseUnitPlacementType>('bloggerTemplate');
  const [unitEnabled, setUnitEnabled] = useState(true);
  const [unitOnlyOnPosts, setUnitOnlyOnPosts] = useState(false);
  const [unitNotes, setUnitNotes] = useState('');
  const [targetSectionId, setTargetSectionId] = useState<string>(
    () =>
      parsedInfo.sections.find((s) => /sidebar|main|footer|header/i.test(s.id))?.id ||
      parsedInfo.sections[0]?.id ||
      'sidebar'
  );

  // Account & users states
  const [editCurrentPassword, setEditCurrentPassword] = useState('');
  const [editAdminEmail, setEditAdminEmail] = useState<string>(ADMIN_BOOTSTRAP_EMAIL);
  const [editAdminDisplayName, setEditAdminDisplayName] = useState('Admin TemaLoka');
  const [editNewPassword, setEditNewPassword] = useState('');
  const [editNewPasswordConfirm, setEditNewPasswordConfirm] = useState('');
  const [showEditCurrentPw, setShowEditCurrentPw] = useState(false);
  const [showEditNewPw, setShowEditNewPw] = useState(false);
  const [showEditConfirmPw, setShowEditConfirmPw] = useState(false);
  const [accountFormError, setAccountFormError] = useState<string | null>(null);
  const [managedUsers, setManagedUsers] = useState<ManagedUserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userTierFilter, setUserTierFilter] = useState<'all' | 'pro' | 'free'>('all');
  const [editingFeaturesUserId, setEditingFeaturesUserId] = useState<string | null>(null);
  const [userFeatureDraft, setUserFeatureDraft] = useState<Record<string, FeatureOverrideValue>>({});
  const [savingUserFeaturesId, setSavingUserFeaturesId] = useState<string | null>(null);

  // Manual Payment settings & dynamic payment columns states
  const [paymentDraft, setPaymentDraft] = useState<PaymentSettingsConfig>(
    siteAdsense.paymentConfig
  );
  const [paymentDirty, setPaymentDirty] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [payType, setPayType] = useState<ManualPaymentMethodType>('bank');
  const [payProviderName, setPayProviderName] = useState('');
  const [payAccountNumber, setPayAccountNumber] = useState('');
  const [payAccountHolder, setPayAccountHolder] = useState('');
  const [payNote, setPayNote] = useState('');
  const [payQrisUrl, setPayQrisUrl] = useState('');
  const [payEnabled, setPayEnabled] = useState(true);
  const [paymentMethodBusy, setPaymentMethodBusy] = useState(false);

  const loadAdminAuthStatus = useCallback(async () => {
    setLoadingAdminStatus(true);
    try {
      const res = await fetch('/api/admin/auth/status');
      if (res.ok) {
        const data = (await res.json()) as AdminAuthStatus;
        setAdminStatus(data);
        if (data.adminEmail) {
          setLoginEmail(data.adminEmail);
          setClaimEmail(data.adminEmail);
          setEditAdminEmail(data.adminEmail);
        }
        if (data.adminDisplayName) {
          setEditAdminDisplayName(data.adminDisplayName);
        }
      }
    } catch {
      // ignore offline
    } finally {
      setLoadingAdminStatus(false);
    }
  }, []);

  useEffect(() => {
    void loadAdminAuthStatus();
  }, [loadAdminAuthStatus]);

  useEffect(() => {
    if (!adsDirty) setAdsDraft(siteAdsense.config);
  }, [siteAdsense.config, adsDirty]);

  useEffect(() => {
    if (!seoDirty) setSeoDraft(siteAdsense.seoConfig);
  }, [siteAdsense.seoConfig, seoDirty]);

  useEffect(() => {
    if (!premiumDirty) setPremiumDraft(siteAdsense.premiumConfig);
  }, [siteAdsense.premiumConfig, premiumDirty]);

  useEffect(() => {
    if (!paymentDirty) setPaymentDraft(siteAdsense.paymentConfig);
  }, [siteAdsense.paymentConfig, paymentDirty]);

  useEffect(() => {
    if (user?.role === 'admin') {
      setEditAdminEmail(user.email);
      setEditAdminDisplayName(user.displayName);
    }
  }, [user]);

  useEffect(() => {
    if (
      parsedInfo.sections.length > 0 &&
      !parsedInfo.sections.some((s) => s.id === targetSectionId)
    ) {
      setTargetSectionId(
        parsedInfo.sections.find((s) => /sidebar|main|footer|header/i.test(s.id))?.id ||
          parsedInfo.sections[0].id
      );
    }
  }, [parsedInfo.sections, targetSectionId]);

  const loadProtectedAdminData = useCallback(async () => {
    if (!sessionToken || !isAdmin) return;
    const headers = { Authorization: `Bearer ${sessionToken}` };
    try {
      const [d1Res, gcloudRes, freeRes, usersRes] = await Promise.all([
        fetch('/api/admin/d1/config', { headers }),
        fetch('/api/admin/gcloud/config', { headers }),
        fetch('/api/admin/freellm/config', { headers }),
        fetch('/api/admin/users', { headers }),
      ]);

      if (d1Res.ok) {
        const d1Json = (await d1Res.json()) as
          | { config?: CloudflareD1AdminConfigView }
          | CloudflareD1AdminConfigView;
        const d1Cfg = 'config' in d1Json && d1Json.config ? d1Json.config : (d1Json as CloudflareD1AdminConfigView);
        if (d1Cfg && typeof d1Cfg.databaseName === 'string') {
          setD1View(d1Cfg);
          setD1Enabled(d1Cfg.enabled);
          setD1AccountId(d1Cfg.accountId || '');
          setD1DatabaseId(d1Cfg.databaseId || '');
          setD1DatabaseName(d1Cfg.databaseName || 'temaloka_db');
          setD1BindingName(d1Cfg.bindingName || 'DB');
          setD1WorkerProxyUrl(d1Cfg.workerProxyUrl || '');
        }
      }

      if (gcloudRes.ok) {
        const gcJson = (await gcloudRes.json()) as { config?: GoogleCloudAdminConfigView };
        if (gcJson.config) {
          const g = gcJson.config;
          setGcloudView(g);
          setGcloudEnabled(g.enabled);
          setGcloudProjectId(g.projectId || '');
          setGcloudProjectNumber(g.projectNumber || '');
          setGcloudRegion(g.region || 'asia-northeast1');
          setGcloudOauthEnabled(g.oauthEnabled);
          setGcloudOauthClientId(g.oauthClientId || '');
          setGcloudOauthRedirectUri(g.oauthRedirectUri || '');
        }
      }

      if (freeRes.ok) {
        const freeJson = (await freeRes.json()) as
          | { config?: FreeLlmAdminConfigView }
          | FreeLlmAdminConfigView;
        const c =
          'config' in freeJson && freeJson.config
            ? freeJson.config
            : (freeJson as FreeLlmAdminConfigView);
        if (c && typeof c.defaultModel === 'string') {
          setFreeLlmView(c);
          setFreeEnabled(c.enabled);
          setFreeAllowGuests(c.allowForGuests);
          setFreeBaseUrl(c.baseUrl || '');
          setFreeDefaultModel(c.defaultModel || 'auto');
          setFreeRoutingStrategy(c.routingStrategy || 'auto');
          setFreeMaxTokens(c.maxTokens || 2048);
          setFreeTemperature(typeof c.temperature === 'number' ? c.temperature : 0.5);
          setFreeTimeoutMs(c.timeoutMs || 25000);
          setFreeCfAccountId(c.cloudflareAiAccountId || '');
        }
      }

      if (usersRes.ok) {
        const uJson = (await usersRes.json()) as { users: ManagedUserRow[] };
        if (Array.isArray(uJson.users)) {
          setManagedUsers(uJson.users);
        }
      }
    } catch {
      // ignore offline
    }
  }, [sessionToken, isAdmin]);

  useEffect(() => {
    if (isAdmin && sessionToken) {
      void loadProtectedAdminData();
    }
  }, [isAdmin, sessionToken, loadProtectedAdminData]);

  const adminUrlOrigin =
    typeof window !== 'undefined' ? window.location.origin : '';
  const cleanPubPreview = sanitizePublisherId(adsDraft.publisherId);
  const activeSlotCount = [
    adsDraft.topBannerEnabled,
    adsDraft.sidebarSlotEnabled,
    adsDraft.footerSlotEnabled,
    adsDraft.modalSlotEnabled,
  ].filter(Boolean).length;

  const handleCopy = (key: string, value: string, label = 'Teks') => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(value).catch(() => {});
    }
    setCopiedKey(key);
    onNotify?.(`${label} berhasil disalin.`, 'success');
    setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1600);
  };

  // Auth Handlers
  const handleClaimAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setClaimFormError(null);
    clearLastAuthError();
    if (!claimEmail.trim() || !claimEmail.includes('@')) {
      setClaimFormError('Masukkan email Admin yang valid.');
      return;
    }
    if (claimPassword.length < 6) {
      const msg = 'Password Admin minimal 6 karakter.';
      setClaimFormError(msg);
      onNotify?.(msg, 'error');
      return;
    }
    if (claimPassword !== claimConfirm) {
      const msg = 'Konfirmasi password tidak cocok.';
      setClaimFormError(msg);
      onNotify?.(msg, 'error');
      return;
    }
    const ok = await claimAdminAccount({
      email: claimEmail.trim(),
      displayName: claimName.trim(),
      password: claimPassword,
    });
    if (ok) {
      setClaimPassword('');
      setClaimConfirm('');
      await loadAdminAuthStatus();
      await siteAdsense.refreshPublicConfig();
    }
  };

  const handleAdminLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginFormError(null);
    clearLastAuthError();
    if (!loginEmail.trim() || !loginEmail.includes('@')) {
      setLoginFormError('Masukkan email Admin yang valid.');
      return;
    }
    if (!loginPassword) {
      setLoginFormError('Masukkan password Admin.');
      return;
    }
    const ok = await signInAsAdmin(loginEmail.trim(), loginPassword);
    if (ok) {
      setLoginPassword('');
      await siteAdsense.refreshPublicConfig();
    }
  };

  // D1 Handlers
  const handleSaveD1 = async () => {
    if (!sessionToken) return;
    setD1BusyAction('save');
    try {
      const res = await fetch('/api/admin/d1/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          enabled: d1Enabled,
          accountId: d1AccountId.trim(),
          databaseId: d1DatabaseId.trim(),
          databaseName: d1DatabaseName.trim(),
          bindingName: d1BindingName.trim() || 'DB',
          workerProxyUrl: d1WorkerProxyUrl.trim(),
          ...(d1ApiTokenInput.trim() ? { apiToken: d1ApiTokenInput.trim() } : {}),
        }),
      });
      const data = (await res.json()) as {
        config?: CloudflareD1AdminConfigView;
        error?: string;
      };
      if (!res.ok || !data.config) {
        throw new Error(data.error || 'Gagal menyimpan konfigurasi Cloudflare D1.');
      }
      setD1View(data.config);
      setD1ApiTokenInput('');
      await siteAdsense.refreshPublicConfig();
      onNotify?.('Konfigurasi Cloudflare D1 disimpan.', 'success');
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'Gagal menyimpan D1.', 'error');
    } finally {
      setD1BusyAction(null);
    }
  };

  const handleD1Action = async (endpoint: string, actionKey: string) => {
    if (!sessionToken) return;
    setD1BusyAction(actionKey);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
        config?: CloudflareD1AdminConfigView;
        pushedStatements?: number;
      };
      if (data.config) setD1View(data.config);
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || data.message || 'Operasi Cloudflare D1 gagal.');
      }
      await siteAdsense.refreshPublicConfig();
      onNotify?.(
        data.message ||
          (typeof data.pushedStatements === 'number'
            ? `Sinkronisasi selesai (${data.pushedStatements} data dikirim ke D1).`
            : 'Operasi D1 berhasil.'),
        'success'
      );
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'Operasi D1 gagal.', 'error');
    } finally {
      setD1BusyAction(null);
    }
  };

  // FreeLLMAPI Handlers
  const handleSaveFreeLlm = async () => {
    if (!sessionToken) return;
    setFreeBusyAction('save');
    try {
      const res = await fetch('/api/admin/freellm/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          enabled: freeEnabled,
          allowForGuests: freeAllowGuests,
          baseUrl: freeBaseUrl.trim(),
          defaultModel: freeDefaultModel,
          routingStrategy: freeRoutingStrategy,
          maxTokens: freeMaxTokens,
          temperature: freeTemperature,
          timeoutMs: freeTimeoutMs,
          cloudflareAiAccountId: freeCfAccountId.trim(),
          ...(freeGatewayToken.trim() ? { gatewayToken: freeGatewayToken.trim() } : {}),
          ...(freeGroqKey.trim() ? { groqApiKey: freeGroqKey.trim() } : {}),
          ...(freeCerebrasKey.trim() ? { cerebrasApiKey: freeCerebrasKey.trim() } : {}),
          ...(freeOpenRouterKey.trim() ? { openRouterApiKey: freeOpenRouterKey.trim() } : {}),
          ...(freeMistralKey.trim() ? { mistralApiKey: freeMistralKey.trim() } : {}),
          ...(freeNvidiaKey.trim() ? { nvidiaApiKey: freeNvidiaKey.trim() } : {}),
          ...(freeCfToken.trim() ? { cloudflareAiToken: freeCfToken.trim() } : {}),
          ...(freeGeminiCompatKey.trim() ? { geminiCompatApiKey: freeGeminiCompatKey.trim() } : {}),
        }),
      });
      const data = (await res.json()) as {
        config?: FreeLlmAdminConfigView;
        error?: string;
      };
      if (!res.ok || !data.config) {
        throw new Error(data.error || 'Gagal menyimpan pengaturan FreeLLMAPI.');
      }
      setFreeLlmView(data.config);
      setFreeGatewayToken('');
      setFreeGroqKey('');
      setFreeCerebrasKey('');
      setFreeOpenRouterKey('');
      setFreeMistralKey('');
      setFreeNvidiaKey('');
      setFreeCfToken('');
      setFreeGeminiCompatKey('');
      await siteAdsense.refreshPublicConfig();
      onNotify?.('Konfigurasi FreeLLMAPI berhasil disimpan.', 'success');
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'Gagal menyimpan FreeLLMAPI.', 'error');
    } finally {
      setFreeBusyAction(null);
    }
  };

  const handleTestFreeLlm = async () => {
    if (!sessionToken) return;
    setFreeBusyAction('test');
    setFreeTestResult(null);
    try {
      const res = await fetch('/api/admin/freellm/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ model: freeDefaultModel }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        provider?: string;
        model?: string;
        reply?: string;
        error?: string;
      };
      setFreeTestResult(data);
      if (data.ok) {
        onNotify?.(`FreeLLMAPI terhubung lewat ${data.provider}!`, 'success');
      } else {
        onNotify?.(data.error || 'Gateway FreeLLMAPI belum merespons.', 'info');
      }
    } catch (err) {
      setFreeTestResult({
        ok: false,
        error: err instanceof Error ? err.message : 'Gagal menguji FreeLLMAPI.',
      });
    } finally {
      setFreeBusyAction(null);
    }
  };

  // Google Cloud Console Handlers
  const handleSaveGoogleCloud = async (clearOpts?: {
    clearGeminiApiKey?: boolean;
    clearSearchConsoleApiKey?: boolean;
    clearIndexingServiceAccount?: boolean;
  }) => {
    if (!sessionToken) return;
    setGcloudBusyAction('save');
    try {
      const res = await fetch('/api/admin/gcloud/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          enabled: gcloudEnabled,
          projectId: gcloudProjectId.trim(),
          projectNumber: gcloudProjectNumber.trim(),
          region: gcloudRegion.trim() || 'asia-northeast1',
          oauthEnabled: gcloudOauthEnabled,
          oauthClientId: gcloudOauthClientId.trim(),
          oauthRedirectUri: gcloudOauthRedirectUri.trim(),
          ...(gcloudGeminiKeyInput.trim() ? { geminiApiKey: gcloudGeminiKeyInput.trim() } : {}),
          ...(gcloudSearchConsoleKeyInput.trim()
            ? { searchConsoleApiKey: gcloudSearchConsoleKeyInput.trim() }
            : {}),
          ...(gcloudServiceAccountJson.trim()
            ? { indexingServiceAccountJson: gcloudServiceAccountJson.trim() }
            : {}),
          ...(clearOpts || {}),
        }),
      });
      const data = (await res.json()) as {
        config?: GoogleCloudAdminConfigView;
        error?: string;
      };
      if (!res.ok || !data.config) {
        throw new Error(data.error || 'Gagal menyimpan pengaturan Google Cloud Console.');
      }
      setGcloudView(data.config);
      setGcloudProjectId(data.config.projectId || '');
      setGcloudGeminiKeyInput('');
      setGcloudSearchConsoleKeyInput('');
      setGcloudServiceAccountJson('');
      await siteAdsense.refreshPublicConfig();
      onNotify?.('Konfigurasi Google Cloud Console berhasil disimpan & dienkripsi.', 'success');
    } catch (err) {
      onNotify?.(
        err instanceof Error ? err.message : 'Gagal menyimpan konfigurasi Google Cloud.',
        'error'
      );
    } finally {
      setGcloudBusyAction(null);
    }
  };

  const handleTestGoogleCloud = async () => {
    if (!sessionToken) return;
    setGcloudBusyAction('test');
    setGcloudTestResult(null);
    try {
      const res = await fetch('/api/admin/gcloud/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
      });
      const data = (await res.json()) as {
        ok: boolean;
        message: string;
        details?: {
          projectConfigured: boolean;
          geminiKeyStatus: string;
          oauthStatus: string;
          serviceAccountStatus: string;
        };
        config?: GoogleCloudAdminConfigView;
      };
      if (data.config) setGcloudView(data.config);
      setGcloudTestResult({
        ok: Boolean(data.ok),
        message: data.message || 'Pengujian Google Cloud selesai.',
        details: data.details,
      });
      onNotify?.(
        data.ok ? 'Koneksi Google Cloud Console terverifikasi!' : data.message || 'Uji koneksi selesai.',
        data.ok ? 'success' : 'info'
      );
    } catch (err) {
      setGcloudTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Gagal menguji koneksi Google Cloud.',
      });
    } finally {
      setGcloudBusyAction(null);
    }
  };

  const handleServiceAccountFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.json')) {
      onNotify?.('Pilih file kredensial berformat .json dari Google Cloud Console.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setGcloudServiceAccountJson(text);
      try {
        const parsed = JSON.parse(text) as { project_id?: string };
        if (parsed.project_id && !gcloudProjectId.trim()) {
          setGcloudProjectId(parsed.project_id);
        }
      } catch {
        // validation happens on save
      }
      onNotify?.(`File "${file.name}" dimuat. Klik Simpan untuk mengenkripsi ke server.`, 'info');
    };
    reader.readAsText(file);
  };

  // Premium Pro/Free Checklist Handlers
  const updateFeatureRule = (
    featureId: string,
    patch: Partial<{ tier: 'free' | 'pro'; enabled: boolean }>
  ) => {
    setPremiumDraft((prev) => ({
      ...prev,
      rules: {
        ...prev.rules,
        [featureId]: {
          tier: prev.rules[featureId]?.tier || 'free',
          enabled: prev.rules[featureId]?.enabled ?? true,
          ...patch,
        },
      },
    }));
    setPremiumDirty(true);
  };

  const handleSavePremium = async () => {
    try {
      await siteAdsense.savePremiumConfig(premiumDraft);
      setPremiumDirty(false);
      onNotify?.('Daftar Fitur Pro/Free berhasil disimpan ke database.', 'success');
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'Gagal menyimpan Fitur Pro/Free.', 'error');
    }
  };

  // SEO Handlers
  const handleSaveSeo = async () => {
    try {
      await siteAdsense.saveSeoConfig(seoDraft);
      setSeoDirty(false);
      onNotify?.('Pengaturan SEO Web & Blog berhasil disimpan.', 'success');
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'Gagal menyimpan SEO.', 'error');
    }
  };

  // AdSense Handlers
  const updateAdsDraft = (patch: Partial<SiteAdsenseConfig>) => {
    setAdsDraft((prev) => ({ ...prev, ...patch }));
    setAdsDirty(true);
  };

  const handleSaveAdsense = async () => {
    try {
      await siteAdsense.saveGlobalConfig(adsDraft);
      setAdsDirty(false);
      onNotify?.('Pengaturan Google AdSense berhasil disimpan.', 'success');
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'Gagal menyimpan AdSense.', 'error');
    }
  };

  const resetUnitForm = () => {
    setEditingUnitId(null);
    setUnitName('');
    setUnitSlotId('');
    setUnitFormat('responsive');
    setUnitPlacement('bloggerTemplate');
    setUnitEnabled(true);
    setUnitOnlyOnPosts(false);
    setUnitNotes('');
  };

  const startEditUnit = (unit: AdsenseUnitRecord) => {
    setEditingUnitId(unit.id);
    setUnitName(unit.name);
    setUnitSlotId(unit.slotId);
    setUnitFormat(unit.format);
    setUnitPlacement(unit.placement);
    setUnitEnabled(unit.enabled);
    setUnitOnlyOnPosts(unit.onlyOnPosts);
    setUnitNotes(unit.notes);
  };

  const handleSaveUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionBusy(true);
    try {
      if (editingUnitId) {
        await siteAdsense.updateAdUnit(editingUnitId, {
          name: unitName,
          slotId: unitSlotId,
          format: unitFormat,
          placement: unitPlacement,
          enabled: unitEnabled,
          onlyOnPosts: unitOnlyOnPosts,
          notes: unitNotes,
        });
        onNotify?.(`Unit iklan "${unitName}" diperbarui.`, 'success');
      } else {
        await siteAdsense.createAdUnit({
          name: unitName,
          slotId: unitSlotId,
          format: unitFormat,
          placement: unitPlacement,
          enabled: unitEnabled,
          onlyOnPosts: unitOnlyOnPosts,
          notes: unitNotes,
        });
        onNotify?.(`Unit iklan "${unitName}" ditambahkan.`, 'success');
      }
      resetUnitForm();
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'Gagal menyimpan unit iklan.', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const handleDeleteUnit = async (unit: AdsenseUnitRecord) => {
    setActionBusy(true);
    try {
      await siteAdsense.deleteAdUnit(unit.id);
      if (editingUnitId === unit.id) resetUnitForm();
      onNotify?.(`Unit iklan "${unit.name}" dihapus.`, 'info');
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'Gagal menghapus unit iklan.', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  // Account & User Tier Handlers
  const handleUpdateAdminCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccountFormError(null);
    clearLastAuthError();
    if (!editCurrentPassword) {
      setAccountFormError('Masukkan password Admin saat ini untuk konfirmasi.');
      return;
    }
    if (!editAdminEmail.trim() || !editAdminEmail.includes('@')) {
      setAccountFormError('Masukkan email Admin baru yang valid.');
      return;
    }
    if (editNewPassword && editNewPassword.length < 6) {
      const msg = 'Password baru minimal 6 karakter.';
      setAccountFormError(msg);
      onNotify?.(msg, 'error');
      return;
    }
    if (editNewPassword && editNewPassword !== editNewPasswordConfirm) {
      const msg = 'Konfirmasi password baru tidak cocok.';
      setAccountFormError(msg);
      onNotify?.(msg, 'error');
      return;
    }
    const ok = await updateAdminAccount({
      currentPassword: editCurrentPassword,
      newEmail: editAdminEmail.trim(),
      newDisplayName: editAdminDisplayName.trim(),
      ...(editNewPassword ? { newPassword: editNewPassword } : {}),
    });
    if (ok) {
      setEditCurrentPassword('');
      setEditNewPassword('');
      setEditNewPasswordConfirm('');
      await loadAdminAuthStatus();
    }
  };

  const handleToggleUserTier = async (targetUser: ManagedUserRow, nextTier: UserAccountTier) => {
    if (!sessionToken) return;
    setLoadingUsers(true);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(targetUser.id)}/tier`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ tier: nextTier }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error || 'Gagal memperbarui tier pengguna.');
      setManagedUsers((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, tier: nextTier } : u))
      );
      onNotify?.(`Tier ${targetUser.email} diubah ke ${nextTier.toUpperCase()}.`, 'success');
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'Gagal mengubah tier.', 'error');
    } finally {
      setLoadingUsers(false);
    }
  };

  const openUserFeaturesEditor = (u: ManagedUserRow) => {
    if (editingFeaturesUserId === u.id) {
      setEditingFeaturesUserId(null);
      return;
    }
    setEditingFeaturesUserId(u.id);
    setUserFeatureDraft({ ...(u.featureOverrides || {}) });
  };

  const setUserFeatureOverrideChoice = (
    featureId: string,
    choice: 'default' | FeatureOverrideValue
  ) => {
    setUserFeatureDraft((prev) => {
      const next = { ...prev };
      if (choice === 'default') {
        delete next[featureId];
      } else {
        next[featureId] = choice;
      }
      return next;
    });
  };

  const handleSaveUserFeatureOverrides = async (targetUser: ManagedUserRow) => {
    if (!sessionToken) return;
    setSavingUserFeaturesId(targetUser.id);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(targetUser.id)}/features`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ featureOverrides: userFeatureDraft }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        featureOverrides?: Record<string, FeatureOverrideValue>;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan akses fitur khusus pengguna.');
      const savedOverrides = data.featureOverrides || {};
      setManagedUsers((prev) =>
        prev.map((u) =>
          u.id === targetUser.id ? { ...u, featureOverrides: savedOverrides } : u
        )
      );
      setEditingFeaturesUserId(null);
      onNotify?.(`Akses fitur khusus untuk ${targetUser.email} disimpan.`, 'success');
    } catch (err) {
      onNotify?.(
        err instanceof Error ? err.message : 'Gagal menyimpan akses fitur khusus.',
        'error'
      );
    } finally {
      setSavingUserFeaturesId(null);
    }
  };

  // Manual Payment Handlers
  const resetPaymentMethodForm = () => {
    setEditingPaymentId(null);
    setPayType('bank');
    setPayProviderName('');
    setPayAccountNumber('');
    setPayAccountHolder('');
    setPayNote('');
    setPayQrisUrl('');
    setPayEnabled(true);
  };

  const startEditPaymentMethod = (m: ManualPaymentMethod) => {
    setEditingPaymentId(m.id);
    setPayType(m.type);
    setPayProviderName(m.providerName);
    setPayAccountNumber(m.accountNumber);
    setPayAccountHolder(m.accountHolder);
    setPayNote(m.note);
    setPayQrisUrl(m.qrisImageUrl);
    setPayEnabled(m.enabled);
  };

  const handleSavePaymentSettings = async () => {
    try {
      await siteAdsense.savePaymentConfig(paymentDraft);
      setPaymentDirty(false);
      onNotify?.('Pengaturan pembayaran manual berhasil disimpan.', 'success');
    } catch (err) {
      onNotify?.(
        err instanceof Error ? err.message : 'Gagal menyimpan pengaturan pembayaran.',
        'error'
      );
    }
  };

  const handleSavePaymentMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    const provider = payProviderName.trim();
    const account = payAccountNumber.trim();
    if (!provider) {
      onNotify?.('Isi nama bank / e-wallet / alat pembayaran terlebih dahulu.', 'error');
      return;
    }
    if (!account && payType !== 'qris') {
      onNotify?.('Isi nomor rekening / nomor akun / ID tujuan pembayaran.', 'error');
      return;
    }
    const cleanQr = payQrisUrl.trim() ? sanitizePublicHttpUrl(payQrisUrl) : '';
    if (payQrisUrl.trim() && !cleanQr) {
      onNotify?.('URL Gambar QRIS harus diawali http:// atau https:// yang valid.', 'error');
      return;
    }

    setPaymentMethodBusy(true);
    try {
      const nextMethod: ManualPaymentMethod = {
        id:
          editingPaymentId ||
          `pay_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        type: payType,
        providerName: provider,
        accountNumber: account,
        accountHolder: payAccountHolder.trim(),
        note: payNote.trim(),
        qrisImageUrl: cleanQr,
        enabled: payEnabled,
      };

      const nextMethods = editingPaymentId
        ? paymentDraft.methods.map((m) => (m.id === editingPaymentId ? nextMethod : m))
        : [...paymentDraft.methods, nextMethod];

      const nextConfig: PaymentSettingsConfig = {
        ...paymentDraft,
        methods: nextMethods,
      };
      await siteAdsense.savePaymentConfig(nextConfig);
      setPaymentDraft(nextConfig);
      setPaymentDirty(false);
      resetPaymentMethodForm();
      onNotify?.(
        editingPaymentId
          ? `Kolom pembayaran "${provider}" diperbarui.`
          : `Kolom pembayaran "${provider}" ditambahkan.`,
        'success'
      );
    } catch (err) {
      onNotify?.(
        err instanceof Error ? err.message : 'Gagal menyimpan kolom pembayaran.',
        'error'
      );
    } finally {
      setPaymentMethodBusy(false);
    }
  };

  const handleTogglePaymentMethod = async (method: ManualPaymentMethod) => {
    setPaymentMethodBusy(true);
    try {
      const nextMethods = paymentDraft.methods.map((m) =>
        m.id === method.id ? { ...m, enabled: !m.enabled } : m
      );
      const nextConfig: PaymentSettingsConfig = { ...paymentDraft, methods: nextMethods };
      await siteAdsense.savePaymentConfig(nextConfig);
      setPaymentDraft(nextConfig);
      setPaymentDirty(false);
      onNotify?.(
        `Kolom "${method.providerName}" ${!method.enabled ? 'diaktifkan' : 'dinonaktifkan'}.`,
        'success'
      );
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'Gagal mengubah status kolom.', 'error');
    } finally {
      setPaymentMethodBusy(false);
    }
  };

  const handleDeletePaymentMethod = async (method: ManualPaymentMethod) => {
    setPaymentMethodBusy(true);
    try {
      const nextMethods = paymentDraft.methods.filter((m) => m.id !== method.id);
      const nextConfig: PaymentSettingsConfig = { ...paymentDraft, methods: nextMethods };
      await siteAdsense.savePaymentConfig(nextConfig);
      setPaymentDraft(nextConfig);
      setPaymentDirty(false);
      if (editingPaymentId === method.id) resetPaymentMethodForm();
      onNotify?.(`Kolom pembayaran "${method.providerName}" dihapus.`, 'info');
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'Gagal menghapus kolom pembayaran.', 'error');
    } finally {
      setPaymentMethodBusy(false);
    }
  };

  const buildUnitHtmlSnippet = (unit: AdsenseUnitRecord) => {
    const pub = cleanPubPreview || 'ca-pub-0000000000000000';
    const slot = unit.slotId || '1234567890';
    return [
      `<ins class="adsbygoogle"`,
      `     style="display:block"`,
      `     data-ad-client="${pub}"`,
      `     data-ad-slot="${slot}"`,
      `     data-ad-format="${unit.format === 'in-article' ? 'fluid' : unit.format === 'multiplex' ? 'autorelaxed' : 'auto'}"`,
      `     data-full-width-responsive="true"${adsDraft.testMode ? `\n     data-adtest="on"` : ''}></ins>`,
      `<script>(adsbygoogle = window.adsbygoogle || []).push({});</script>`,
    ].join('\n');
  };

  const buildUnitBloggerXmlSnippet = (unit: AdsenseUnitRecord) => {
    const pub = cleanPubPreview || 'ca-pub-0000000000000000';
    return buildAdsensePreviewSnippet({
      publisherId: pub,
      slotId: unit.slotId,
      format: unit.format,
      target: { kind: 'section-html-ins', sectionId: targetSectionId },
      onlyOnPosts: unit.onlyOnPosts,
      widgetTitle: unit.name,
    });
  };

  const proCount = useMemo(
    () =>
      FEATURE_REGISTRY.filter(
        (f) => (premiumDraft.rules[f.id]?.tier || f.defaultTier) === 'pro'
      ).length,
    [premiumDraft.rules]
  );

  const filteredFeatures = useMemo(
    () =>
      featureCatFilter === 'all'
        ? FEATURE_REGISTRY
        : FEATURE_REGISTRY.filter((f) => f.category === featureCatFilter),
    [featureCatFilter]
  );

  return (
    <div className="min-h-[100dvh] bg-[#F8FAFC] text-slate-900 flex flex-col">
      {/* Top Admin Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-3 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onExitAdmin}
            className="flex items-center gap-1.5 px-2.5 py-2 min-h-[38px] text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Kembali ke Studio</span>
            <span className="sm:hidden">Studio</span>
          </button>

          <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                Admin Panel TemaLoka
              </h1>
              <span
                className={`px-2 py-0.5 text-[10px] font-mono font-semibold rounded border ${
                  siteAdsense.dbMode === 'cloudflare-d1'
                    ? 'bg-amber-50 text-amber-900 border-amber-300'
                    : 'bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                {siteAdsense.dbMode === 'cloudflare-d1' ? 'Cloudflare D1 Live' : 'SQLite Fallback'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 truncate hidden sm:block">
              Cloudflare D1, FreeLLMAPI, Fitur Pro/Free, SEO Web, Google AdSense &amp; Akun Admin.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {user && isAdmin && (
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="font-medium text-slate-800 max-w-[140px] sm:max-w-[200px] truncate">
                {user.email}
              </span>
              <button
                type="button"
                onClick={() => void signOutAccount()}
                title="Keluar sesi Admin"
                className="text-slate-400 hover:text-red-600 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-3 sm:p-6 space-y-5">
        {(!authReady || loadingAdminStatus) && (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-2">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto" />
            <p className="text-xs font-medium text-slate-600">
              Memeriksa status autentikasi &amp; basis data Admin...
            </p>
          </div>
        )}

        {/* Gate 1: First-run Admin Setup if password not yet configured */}
        {authReady && !loadingAdminStatus && !isAdmin && adminStatus && !adminStatus.configured && (
          <form
            onSubmit={(e) => void handleClaimAdmin(e)}
            className="max-w-lg mx-auto bg-white border border-slate-200 rounded-2xl p-5 sm:p-7 space-y-4 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center shrink-0">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Aktifkan Password Admin Pertama Kali
                </h2>
                <p className="text-xs text-slate-500">
                  Email Admin bawaan dapat langsung dipakai atau diganti sekarang, lalu buat password Admin Anda.
                </p>
              </div>
            </div>

            {(claimFormError || lastAuthError) && (
              <div
                role="alert"
                className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <span>{claimFormError || lastAuthError}</span>
              </div>
            )}

            <div className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="admin-claim-email" className="block text-xs font-semibold text-slate-800">
                  Email Admin Utama
                </label>
                <input
                  id="admin-claim-email"
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  value={claimEmail}
                  onChange={(e) => {
                    setClaimEmail(e.target.value);
                    setClaimFormError(null);
                    clearLastAuthError();
                  }}
                  className="w-full px-3 py-2.5 min-h-[42px] text-sm sm:text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="admin-claim-name" className="block text-xs font-semibold text-slate-800">
                  Nama Tampilan
                </label>
                <input
                  id="admin-claim-name"
                  type="text"
                  autoComplete="name"
                  value={claimName}
                  onChange={(e) => setClaimName(e.target.value)}
                  className="w-full px-3 py-2.5 min-h-[42px] text-sm sm:text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label htmlFor="admin-claim-pw" className="block text-xs font-semibold text-slate-800">
                    Password Baru (min. 6)
                  </label>
                  <div className="relative">
                    <input
                      id="admin-claim-pw"
                      type={showClaimPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      value={claimPassword}
                      onChange={(e) => {
                        setClaimPassword(e.target.value);
                        setClaimFormError(null);
                        clearLastAuthError();
                      }}
                      placeholder="Minimal 6 karakter"
                      className="w-full pl-3 pr-10 py-2.5 min-h-[42px] text-sm sm:text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowClaimPassword((v) => !v)}
                      aria-label={showClaimPassword ? 'Sembunyikan password' : 'Lihat password'}
                      className="absolute inset-y-0 right-0 px-2.5 flex items-center justify-center text-slate-500 hover:text-slate-800 cursor-pointer"
                    >
                      {showClaimPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  <label htmlFor="admin-claim-confirm" className="block text-xs font-semibold text-slate-800">
                    Konfirmasi Password
                  </label>
                  <div className="relative">
                    <input
                      id="admin-claim-confirm"
                      type={showClaimConfirm ? 'text' : 'password'}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      value={claimConfirm}
                      onChange={(e) => {
                        setClaimConfirm(e.target.value);
                        setClaimFormError(null);
                      }}
                      placeholder="Ulangi password"
                      className="w-full pl-3 pr-10 py-2.5 min-h-[42px] text-sm sm:text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowClaimConfirm((v) => !v)}
                      aria-label={showClaimConfirm ? 'Sembunyikan konfirmasi password' : 'Lihat konfirmasi password'}
                      className="absolute inset-y-0 right-0 px-2.5 flex items-center justify-center text-slate-500 hover:text-slate-800 cursor-pointer"
                    >
                      {showClaimConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="submit"
                disabled={isSigningIn}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl cursor-pointer disabled:opacity-60"
              >
                {isSigningIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                <span>Simpan Password &amp; Masuk Panel Admin</span>
              </button>
              <button
                type="button"
                onClick={onExitAdmin}
                className="px-4 py-2.5 min-h-[44px] text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
              >
                Batal
              </button>
            </div>
          </form>
        )}

        {/* Gate 2: Standard Admin Email + Password Login */}
        {authReady && !loadingAdminStatus && !isAdmin && (!adminStatus || adminStatus.configured) && (
          <form
            onSubmit={(e) => void handleAdminLoginSubmit(e)}
            className="max-w-md mx-auto bg-white border border-slate-200 rounded-2xl p-5 sm:p-7 space-y-4 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-slate-900 text-white flex items-center justify-center shrink-0">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Masuk Panel Admin
                </h2>
                <p className="text-xs text-slate-500">
                  Gunakan email &amp; password Admin untuk mengatur D1, FreeLLMAPI, Pro/Free, SEO, &amp; AdSense.
                </p>
              </div>
            </div>

            {(loginFormError || lastAuthError) && (
              <div
                role="alert"
                className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <span>{loginFormError || lastAuthError}</span>
              </div>
            )}

            <div className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="admin-login-email" className="block text-xs font-semibold text-slate-800">
                  Email Admin
                </label>
                <input
                  id="admin-login-email"
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  value={loginEmail}
                  onChange={(e) => {
                    setLoginEmail(e.target.value);
                    setLoginFormError(null);
                    clearLastAuthError();
                  }}
                  className="w-full px-3 py-2.5 min-h-[42px] text-sm sm:text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="admin-login-pw" className="block text-xs font-semibold text-slate-800">
                  Password Admin
                </label>
                <div className="relative">
                  <input
                    id="admin-login-pw"
                    type={showLoginPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={loginPassword}
                    onChange={(e) => {
                      setLoginPassword(e.target.value);
                      setLoginFormError(null);
                      clearLastAuthError();
                    }}
                    placeholder="Masukkan password admin..."
                    className="w-full pl-3 pr-11 py-2.5 min-h-[42px] text-sm sm:text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword((v) => !v)}
                    aria-label={showLoginPassword ? 'Sembunyikan password' : 'Lihat password'}
                    className="absolute inset-y-0 right-0 px-3 flex items-center justify-center text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="submit"
                disabled={isSigningIn}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl cursor-pointer disabled:opacity-60"
              >
                {isSigningIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                <span>Masuk Admin</span>
              </button>
              <button
                type="button"
                onClick={onExitAdmin}
                className="px-4 py-2.5 min-h-[44px] text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
              >
                Kembali
              </button>
            </div>
          </form>
        )}

        {/* Authenticated Admin Workspace */}
        {authReady && !loadingAdminStatus && isAdmin && (
          <>
            {/* Quick Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1">
                <div className="text-[11px] text-slate-500 font-medium">Basis Data Aktif</div>
                <div className="text-sm font-bold text-slate-900 truncate">
                  {siteAdsense.dbMode === 'cloudflare-d1'
                    ? 'Cloudflare D1'
                    : 'SQLite Lokal'}
                </div>
                <div className="text-[11px] font-mono text-slate-500 truncate">
                  {d1View?.databaseName || 'temaloka_db'}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1">
                <div className="text-[11px] text-slate-500 font-medium">Google Cloud</div>
                <div className="text-sm font-bold text-slate-900 truncate">
                  {gcloudEnabled ? 'Aktif' : 'Nonaktif'}
                </div>
                <div className="text-[11px] font-mono text-slate-500 truncate">
                  {gcloudProjectId || (gcloudView?.hasEnvGeminiApiKey ? 'Env Gemini Siap' : 'Belum Diatur')}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1">
                <div className="text-[11px] text-slate-500 font-medium">Mesin FreeLLMAPI</div>
                <div className="text-sm font-bold text-slate-900">
                  {freeEnabled ? 'Aktif' : 'Nonaktif'} · {freeDefaultModel}
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  {siteAdsense.freellmPublic.configuredProviders.length > 0
                    ? siteAdsense.freellmPublic.configuredProviders.join(', ')
                    : 'Failover Otomatis Siap'}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1">
                <div className="text-[11px] text-slate-500 font-medium">Fitur Pro / Free</div>
                <div className="text-sm font-bold text-slate-900 tabular-nums">
                  {proCount} Pro · {FEATURE_REGISTRY.length - proCount} Free
                </div>
                <div className="text-[11px] text-slate-500">
                  {premiumDraft.enforcementEnabled ? 'Pembatasan Pro Aktif' : 'Semua Terbuka'}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1">
                <div className="text-[11px] text-slate-500 font-medium">SEO &amp; AdSense</div>
                <div className="text-sm font-bold text-slate-900">
                  {adsDraft.adsenseEnabled ? `AdSense (${activeSlotCount}/4)` : 'AdSense Off'}
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  SEO Web: {seoDraft.seoEnabled ? 'Aktif' : 'Mati'}
                </div>
              </div>
            </div>

            {/* Responsive Horizontal Admin Tabs */}
            <div className="bg-white border border-slate-200 rounded-xl p-1.5 flex items-center gap-1 overflow-x-auto no-scrollbar">
              {(
                [
                  ['d1', 'Cloudflare D1', Database],
                  ['gcloud', 'Google Cloud', Cloud],
                  ['freellm', 'FreeLLMAPI & AI', Zap],
                  ['premium', 'Fitur Pro / Free', Crown],
                  ['payment', 'Pembayaran Manual', CreditCard],
                  ['seo', 'SEO Web & Blog', Search],
                  ['adsense', 'Google AdSense', DollarSign],
                  ['account', 'Akun Admin & User', Users],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={`flex items-center gap-1.5 px-3.5 py-2.5 min-h-[42px] text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    activeTab === id
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {/* TAB 1: CLOUDFLARE D1 */}
            {activeTab === 'd1' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">
                        Konfigurasi Cloudflare D1 (Pengganti Firebase)
                      </h2>
                      <p className="text-[11px] text-slate-500">
                        Hubungkan ke Cloudflare D1 HTTP API atau Worker Proxy. Selama belum diisi, SQLite lokal otomatis menjadi cadangan.
                      </p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={d1Enabled}
                        onChange={(e) => setD1Enabled(e.target.checked)}
                        className="w-4 h-4 accent-blue-600 rounded"
                      />
                      <span className="text-xs font-semibold text-slate-900">
                        {d1Enabled ? 'Aktifkan D1 Remote' : 'Pakai SQLite Lokal'}
                      </span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-800">
                        Cloudflare Account ID
                      </label>
                      <input
                        type="text"
                        value={d1AccountId}
                        onChange={(e) => setD1AccountId(e.target.value)}
                        placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        className="w-full px-3 py-2 min-h-[40px] text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-800">
                        D1 Database ID (UUID)
                      </label>
                      <input
                        type="text"
                        value={d1DatabaseId}
                        onChange={(e) => setD1DatabaseId(e.target.value)}
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                        className="w-full px-3 py-2 min-h-[40px] text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-800">
                        Nama Database D1
                      </label>
                      <input
                        type="text"
                        value={d1DatabaseName}
                        onChange={(e) => setD1DatabaseName(e.target.value)}
                        placeholder="temaloka_db"
                        className="w-full px-3 py-2 min-h-[40px] text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-800">
                        Binding Name (wrangler.toml)
                      </label>
                      <input
                        type="text"
                        value={d1BindingName}
                        onChange={(e) => setD1BindingName(e.target.value)}
                        placeholder="DB"
                        className="w-full px-3 py-2 min-h-[40px] text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-800">
                      Cloudflare API Token (D1 Edit Permission){' '}
                      {d1View?.hasApiToken && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 font-mono text-[10px]">
                          Tersimpan ({d1View.apiTokenMasked})
                        </span>
                      )}
                    </label>
                    <input
                      type="password"
                      value={d1ApiTokenInput}
                      onChange={(e) => setD1ApiTokenInput(e.target.value)}
                      placeholder={
                        d1View?.hasApiToken
                          ? 'Kosongkan untuk tetap memakai token tersimpan...'
                          : 'Masukkan Cloudflare API Token...'
                      }
                      className="w-full px-3 py-2 min-h-[40px] text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-800">
                      Worker Proxy URL Opsional (Alternatif selain API Token langsung)
                    </label>
                    <input
                      type="url"
                      value={d1WorkerProxyUrl}
                      onChange={(e) => setD1WorkerProxyUrl(e.target.value)}
                      placeholder="https://temaloka-d1-proxy.username.workers.dev/query"
                      className="w-full px-3 py-2 min-h-[40px] text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                    />
                  </div>

                  {d1View?.lastTestMessage && (
                    <div
                      className={`p-3 rounded-lg border text-xs ${
                        d1View.lastTestOk
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          : 'bg-amber-50 border-amber-200 text-amber-900'
                      }`}
                    >
                      <div className="font-semibold">Status Tes Terakhir</div>
                      <div className="mt-0.5">{d1View.lastTestMessage}</div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      disabled={Boolean(d1BusyAction)}
                      onClick={() => void handleSaveD1()}
                      className="flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[42px] bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl cursor-pointer disabled:opacity-60"
                    >
                      {d1BusyAction === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      <span>Simpan Konfigurasi D1</span>
                    </button>

                    <button
                      type="button"
                      disabled={Boolean(d1BusyAction)}
                      onClick={() => void handleD1Action('/api/admin/d1/test', 'test')}
                      className="flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[42px] bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl cursor-pointer disabled:opacity-60"
                    >
                      {d1BusyAction === 'test' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      <span>Test Koneksi D1</span>
                    </button>

                    <button
                      type="button"
                      disabled={Boolean(d1BusyAction)}
                      onClick={() => void handleD1Action('/api/admin/d1/init-schema', 'schema')}
                      className="flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[42px] bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl cursor-pointer disabled:opacity-60"
                    >
                      {d1BusyAction === 'schema' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                      <span>Buat Tabel Skema D1</span>
                    </button>

                    <button
                      type="button"
                      disabled={Boolean(d1BusyAction)}
                      onClick={() => void handleD1Action('/api/admin/d1/sync-local-to-remote', 'sync')}
                      className="flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[42px] bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-semibold rounded-xl cursor-pointer disabled:opacity-60"
                    >
                      {d1BusyAction === 'sync' ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDrive className="w-4 h-4" />}
                      <span>Sinkronkan Lokal &rarr; D1</span>
                    </button>
                  </div>
                </section>

                <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                      Panduan Cepat <code className="font-mono">wrangler.toml</code> &amp; Tabel D1
                    </h3>
                    <button
                      type="button"
                      onClick={() => handleCopy('wrangler', WRANGLER_TOML_SNIPPET, 'wrangler.toml')}
                      className="px-2.5 py-1 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 rounded cursor-pointer flex items-center gap-1"
                    >
                      {copiedKey === 'wrangler' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>Salin</span>
                    </button>
                  </div>
                  <pre className="p-3 rounded-lg bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto">
                    {WRANGLER_TOML_SNIPPET}
                  </pre>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1.5 leading-relaxed">
                    <div className="font-semibold text-slate-900">8 Tabel Otomatis D1:</div>
                    <p className="font-mono text-[10px]">
                      users, app_config, adsense_units, notes, chat_messages, ai_quota, server_secrets, schema_meta
                    </p>
                    <p>
                      Setelah mengisi Account ID, Database ID, dan API Token lalu menekan <strong>Simpan Konfigurasi D1</strong>, klik <strong>Buat Tabel Skema D1</strong> dan <strong>Sinkronkan Lokal &rarr; D1</strong>.
                    </p>
                  </div>
                </section>
              </div>
            )}

            {/* TAB 2: GOOGLE CLOUD CONSOLE */}
            {activeTab === 'gcloud' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">
                        Integrasi Google Cloud Console
                      </h2>
                      <p className="text-[11px] text-slate-500">
                        Atur Project ID, OAuth 2.0 Client ID, Gemini API Key, dan Service Account Indexing API terenkripsi di server.
                      </p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={gcloudEnabled}
                        onChange={(e) => setGcloudEnabled(e.target.checked)}
                        className="w-4 h-4 accent-blue-600 rounded"
                      />
                      <span className="text-xs font-semibold text-slate-900">
                        {gcloudEnabled ? 'Integrasi Aktif' : 'Nonaktif'}
                      </span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label htmlFor="gcloud-project-id" className="block text-xs font-semibold text-slate-800">
                        Project ID
                      </label>
                      <input
                        id="gcloud-project-id"
                        type="text"
                        value={gcloudProjectId}
                        onChange={(e) => setGcloudProjectId(e.target.value)}
                        placeholder="temaloka-studio-prod"
                        className="w-full px-3 py-2 min-h-[40px] text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                      />
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="gcloud-project-number" className="block text-xs font-semibold text-slate-800">
                        Project Number
                      </label>
                      <input
                        id="gcloud-project-number"
                        type="text"
                        inputMode="numeric"
                        value={gcloudProjectNumber}
                        onChange={(e) => setGcloudProjectNumber(e.target.value)}
                        placeholder="311263886715"
                        className="w-full px-3 py-2 min-h-[40px] text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                      />
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="gcloud-region" className="block text-xs font-semibold text-slate-800">
                        Region Cloud
                      </label>
                      <select
                        id="gcloud-region"
                        value={gcloudRegion}
                        onChange={(e) => setGcloudRegion(e.target.value)}
                        className="w-full px-3 py-2 min-h-[40px] text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                      >
                        <option value="asia-northeast1">asia-northeast1 (Tokyo)</option>
                        <option value="asia-southeast1">asia-southeast1 (Singapura)</option>
                        <option value="asia-southeast2">asia-southeast2 (Jakarta)</option>
                        <option value="us-central1">us-central1 (Iowa)</option>
                        <option value="europe-west1">europe-west1 (Belgia)</option>
                      </select>
                    </div>
                  </div>

                  {/* Gemini API Key (Google AI / Generative Language API) */}
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-900">
                          Gemini API Key (Generative Language API)
                        </span>
                        {gcloudView?.hasGeminiApiKey ? (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 font-mono text-[10px]">
                            Tersimpan ({gcloudView.geminiApiKeyMasked})
                          </span>
                        ) : gcloudView?.hasEnvGeminiApiKey ? (
                          <span className="px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 font-mono text-[10px]">
                            Aktif via Server Env ({gcloudView.geminiApiKeyMasked})
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 font-mono text-[10px]">
                            Belum Diisi
                          </span>
                        )}
                      </div>
                      {gcloudView?.hasGeminiApiKey && (
                        <button
                          type="button"
                          disabled={Boolean(gcloudBusyAction)}
                          onClick={() => void handleSaveGoogleCloud({ clearGeminiApiKey: true })}
                          className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 cursor-pointer"
                        >
                          Hapus Key Tersimpan
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type={showGcloudGeminiKey ? 'text' : 'password'}
                        value={gcloudGeminiKeyInput}
                        onChange={(e) => setGcloudGeminiKeyInput(e.target.value)}
                        placeholder={
                          gcloudView?.hasGeminiApiKey
                            ? 'Kosongkan untuk tetap memakai Gemini API Key tersimpan...'
                            : 'Tempel AIza... dari Google Cloud Console / AI Studio'
                        }
                        className="w-full pl-3 pr-10 py-2 min-h-[40px] text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                      />
                      <button
                        type="button"
                        onClick={() => setShowGcloudGeminiKey((v) => !v)}
                        aria-label={showGcloudGeminiKey ? 'Sembunyikan Gemini API Key' : 'Lihat Gemini API Key'}
                        className="absolute inset-y-0 right-0 px-2.5 flex items-center justify-center text-slate-500 hover:text-slate-800 cursor-pointer"
                      >
                        {showGcloudGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* OAuth 2.0 Client ID */}
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          OAuth 2.0 Web Client ID (Google Identity Services)
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Tambahkan asal domain ini di Authorized JavaScript Origins pada Google Cloud Console.
                        </div>
                      </div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={gcloudOauthEnabled}
                          onChange={(e) => setGcloudOauthEnabled(e.target.checked)}
                          className="w-4 h-4 accent-blue-600 rounded"
                        />
                        <span>Aktifkan</span>
                      </label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <label className="block text-[11px] font-semibold text-slate-700">
                          OAuth 2.0 Client ID
                        </label>
                        <input
                          type="text"
                          value={gcloudOauthClientId}
                          onChange={(e) => setGcloudOauthClientId(e.target.value)}
                          placeholder="1234567890-xxxx.apps.googleusercontent.com"
                          className="w-full px-3 py-2 min-h-[40px] text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <label className="block text-[11px] font-semibold text-slate-700">
                            Authorized Origin / Redirect URI
                          </label>
                          {adminUrlOrigin && (
                            <button
                              type="button"
                              onClick={() => setGcloudOauthRedirectUri(adminUrlOrigin)}
                              className="text-[10px] font-semibold text-blue-600 hover:underline cursor-pointer"
                            >
                              Pakai Origin Ini
                            </button>
                          )}
                        </div>
                        <input
                          type="url"
                          value={gcloudOauthRedirectUri}
                          onChange={(e) => setGcloudOauthRedirectUri(e.target.value)}
                          placeholder={adminUrlOrigin || 'https://app.domainanda.com'}
                          className="w-full px-3 py-2 min-h-[40px] text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Search Console API Key & Service Account JSON */}
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <label className="block text-xs font-semibold text-slate-800">
                            API Key Search / PageSpeed
                          </label>
                          {gcloudView?.hasSearchConsoleApiKey && (
                            <button
                              type="button"
                              onClick={() => void handleSaveGoogleCloud({ clearSearchConsoleApiKey: true })}
                              className="text-[10px] text-rose-600 hover:underline cursor-pointer"
                            >
                              Hapus
                            </button>
                          )}
                        </div>
                        <div className="relative">
                          <input
                            type={showGcloudScKey ? 'text' : 'password'}
                            value={gcloudSearchConsoleKeyInput}
                            onChange={(e) => setGcloudSearchConsoleKeyInput(e.target.value)}
                            placeholder={
                              gcloudView?.hasSearchConsoleApiKey
                                ? `Tersimpan (${gcloudView.searchConsoleApiKeyMasked})`
                                : 'Opsional (AIza...)'
                            }
                            className="w-full pl-3 pr-10 py-2 min-h-[40px] text-xs font-mono bg-white border border-slate-200 rounded-lg"
                          />
                          <button
                            type="button"
                            onClick={() => setShowGcloudScKey((v) => !v)}
                            aria-label={showGcloudScKey ? 'Sembunyikan API Key' : 'Lihat API Key'}
                            className="absolute inset-y-0 right-0 px-2.5 flex items-center justify-center text-slate-500 hover:text-slate-800 cursor-pointer"
                          >
                            {showGcloudScKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <label className="block text-xs font-semibold text-slate-800">
                            Service Account Indexing API (.json)
                          </label>
                          {gcloudView?.hasIndexingServiceAccount && (
                            <button
                              type="button"
                              onClick={() => void handleSaveGoogleCloud({ clearIndexingServiceAccount: true })}
                              className="text-[10px] text-rose-600 hover:underline cursor-pointer"
                            >
                              Hapus JSON
                            </button>
                          )}
                        </div>
                        <label className="w-full px-3 py-2 min-h-[40px] rounded-lg border border-dashed border-slate-300 bg-white hover:bg-slate-100 flex items-center justify-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                          <Upload className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span className="truncate">
                            {gcloudServiceAccountJson
                              ? 'JSON Baru Siap Disimpan'
                              : gcloudView?.hasIndexingServiceAccount
                                ? gcloudView.serviceAccountEmail
                                : 'Pilih File Service Account (.json)'}
                          </span>
                          <input
                            type="file"
                            onChange={handleServiceAccountFilePick}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[11px] font-semibold text-slate-700">
                        Atau Tempel JSON Service Account Google Cloud (Terenkripsi AES-256 di Server)
                      </label>
                      <textarea
                        rows={3}
                        value={gcloudServiceAccountJson}
                        onChange={(e) => setGcloudServiceAccountJson(e.target.value)}
                        placeholder={
                          gcloudView?.hasIndexingServiceAccount
                            ? `Service Account aktif: ${gcloudView.serviceAccountEmail}. Kosongkan jika tidak ingin mengganti.`
                            : '{"type": "service_account", "project_id": "...", "client_email": "..."}'
                        }
                        spellCheck={false}
                        className="w-full p-2.5 text-[11px] font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>

                  {(gcloudTestResult || gcloudView?.lastTestMessage) && (
                    <div
                      className={`p-3 rounded-lg border text-xs space-y-1 ${
                        (gcloudTestResult ? gcloudTestResult.ok : gcloudView?.lastTestOk)
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          : 'bg-amber-50 border-amber-200 text-amber-900'
                      }`}
                    >
                      <div className="font-semibold">Status Uji Koneksi Google Cloud</div>
                      <div>{gcloudTestResult?.message || gcloudView?.lastTestMessage}</div>
                      {gcloudTestResult?.details && (
                        <ul className="text-[11px] list-disc pl-4 space-y-0.5 pt-1">
                          <li>{gcloudTestResult.details.geminiKeyStatus}</li>
                          <li>{gcloudTestResult.details.oauthStatus}</li>
                          <li>{gcloudTestResult.details.serviceAccountStatus}</li>
                        </ul>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      disabled={Boolean(gcloudBusyAction)}
                      onClick={() => void handleSaveGoogleCloud()}
                      className="flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[42px] bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl cursor-pointer disabled:opacity-60"
                    >
                      {gcloudBusyAction === 'save' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      <span>Simpan Konfigurasi Google Cloud</span>
                    </button>

                    <button
                      type="button"
                      disabled={Boolean(gcloudBusyAction)}
                      onClick={() => void handleTestGoogleCloud()}
                      className="flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[42px] bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl cursor-pointer disabled:opacity-60"
                    >
                      {gcloudBusyAction === 'test' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                      <span>Uji Koneksi Google Cloud API</span>
                    </button>
                  </div>
                </section>

                {/* Right Column: Dynamic Google Cloud Console Shortcuts & Checklist */}
                <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3.5">
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                      Pintasan Langsung Google Cloud Console
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {gcloudProjectId.trim()
                        ? `Tautan otomatis diarahkan ke project "${gcloudProjectId.trim()}".`
                        : 'Isi Project ID di kiri agar tautan langsung membuka project Anda.'}
                    </p>
                  </div>

                  <div className="space-y-2">
                    {[
                      {
                        label: 'Dashboard Google Cloud Project',
                        desc: 'Ringkasan kuota, billing, & status project',
                        url: `https://console.cloud.google.com/home/dashboard${gcloudProjectId.trim() ? `?project=${encodeURIComponent(gcloudProjectId.trim())}` : ''}`,
                      },
                      {
                        label: 'APIs & Services — Credentials',
                        desc: 'Buat/salin API Key, OAuth Client ID, & Service Account',
                        url: `https://console.cloud.google.com/apis/credentials${gcloudProjectId.trim() ? `?project=${encodeURIComponent(gcloudProjectId.trim())}` : ''}`,
                      },
                      {
                        label: 'OAuth Consent Screen',
                        desc: 'Daftarkan domain & scope aplikasi web',
                        url: `https://console.cloud.google.com/apis/credentials/consent${gcloudProjectId.trim() ? `?project=${encodeURIComponent(gcloudProjectId.trim())}` : ''}`,
                      },
                      {
                        label: 'Generative Language (Gemini) API',
                        desc: 'Aktifkan API Gemini untuk fitur AI Studio',
                        url: `https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com${gcloudProjectId.trim() ? `?project=${encodeURIComponent(gcloudProjectId.trim())}` : ''}`,
                      },
                      {
                        label: 'Web Search Indexing API',
                        desc: 'Aktifkan API indeks cepat untuk Service Account',
                        url: `https://console.cloud.google.com/apis/library/indexing.googleapis.com${gcloudProjectId.trim() ? `?project=${encodeURIComponent(gcloudProjectId.trim())}` : ''}`,
                      },
                      {
                        label: 'Google Search Console',
                        desc: 'Verifikasi kepemilikan situs & tambah user Service Account',
                        url: 'https://search.google.com/search-console',
                      },
                    ].map((item) => (
                      <a
                        key={item.label}
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-slate-200 bg-slate-50/70 hover:bg-blue-50/60 hover:border-blue-200 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900 truncate">
                            {item.label}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">{item.desc}</div>
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      </a>
                    ))}
                  </div>

                  {adminUrlOrigin && (
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5 text-[11px]">
                      <div className="font-semibold text-slate-800">
                        Origin untuk Google OAuth &amp; HTTP Referrer:
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <code className="font-mono text-[10px] text-slate-700 truncate">
                          {adminUrlOrigin}
                        </code>
                        <button
                          type="button"
                          onClick={() => handleCopy('gcloud-origin', adminUrlOrigin, 'Origin URL')}
                          className="px-2 py-1 text-[10px] font-medium bg-white border border-slate-200 rounded cursor-pointer shrink-0"
                        >
                          {copiedKey === 'gcloud-origin' ? 'Tersalin' : 'Salin'}
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* TAB 3: FREELLMAPI & AI */}
            {activeTab === 'freellm' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">
                        Mesin Internal FreeLLMAPI (OpenAI-Compatible Gateway)
                      </h2>
                      <p className="text-[11px] text-slate-500">
                        Atur gateway FreeLLMAPI lokal/VPS atau API key provider gratis (Groq, Cerebras, OpenRouter, Mistral, NVIDIA, Cloudflare AI) untuk failover otomatis.
                      </p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={freeEnabled}
                        onChange={(e) => setFreeEnabled(e.target.checked)}
                        className="w-4 h-4 accent-emerald-600 rounded"
                      />
                      <span className="text-xs font-semibold text-slate-900">
                        {freeEnabled ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2 space-y-1">
                      <label className="block text-xs font-semibold text-slate-800">
                        FreeLLMAPI Gateway Base URL (Opsional jika pakai Direct Provider Keys)
                      </label>
                      <input
                        type="text"
                        value={freeBaseUrl}
                        onChange={(e) => setFreeBaseUrl(e.target.value)}
                        placeholder="http://127.0.0.1:3001/v1"
                        className="w-full px-3 py-2 min-h-[40px] text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                      />
                      <div className="flex flex-wrap gap-2 text-[11px]">
                        <button
                          type="button"
                          onClick={() => setFreeBaseUrl('http://127.0.0.1:3001/v1')}
                          className="text-blue-700 hover:underline cursor-pointer"
                        >
                          Preset Local Gateway (:3001/v1)
                        </button>
                        <button
                          type="button"
                          onClick={() => setFreeBaseUrl('')}
                          className="text-slate-500 hover:underline cursor-pointer"
                        >
                          Kosongkan (Direct Multi-Provider)
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-800">
                        Gateway Token{' '}
                        {freeLlmView?.hasGatewayToken && (
                          <span className="text-[10px] font-mono text-emerald-700">
                            ({freeLlmView.gatewayTokenMasked})
                          </span>
                        )}
                      </label>
                      <input
                        type="password"
                        value={freeGatewayToken}
                        onChange={(e) => setFreeGatewayToken(e.target.value)}
                        placeholder={freeLlmView?.hasGatewayToken ? 'Tersimpan...' : 'Opsional / free-llm'}
                        className="w-full px-3 py-2 min-h-[40px] text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-800">
                        Model Bawaan FreeLLMAPI
                      </label>
                      <select
                        value={freeDefaultModel}
                        onChange={(e) => setFreeDefaultModel(e.target.value)}
                        className="w-full px-2.5 py-2 min-h-[40px] text-xs bg-slate-50 border border-slate-200 rounded-lg"
                      >
                        {FREELLM_MODELS.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-800">
                        Strategi Routing
                      </label>
                      <select
                        value={freeRoutingStrategy}
                        onChange={(e) =>
                          setFreeRoutingStrategy(e.target.value as FreeLlmRoutingStrategy)
                        }
                        className="w-full px-2.5 py-2 min-h-[40px] text-xs bg-slate-50 border border-slate-200 rounded-lg"
                      >
                        <option value="auto">auto (Seimbang)</option>
                        <option value="auto:fastest">auto:fastest (Tercepat)</option>
                        <option value="auto:smartest">auto:smartest (Terpintar)</option>
                        <option value="balanced">balanced</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-800">
                        Max Tokens / Timeout (ms)
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          min={256}
                          max={16384}
                          value={freeMaxTokens}
                          onChange={(e) => setFreeMaxTokens(Number(e.target.value) || 2048)}
                          className="px-2.5 py-2 min-h-[40px] text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                        />
                        <input
                          type="number"
                          min={3000}
                          max={120000}
                          value={freeTimeoutMs}
                          onChange={(e) => setFreeTimeoutMs(Number(e.target.value) || 25000)}
                          className="px-2.5 py-2 min-h-[40px] text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                        />
                      </div>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={freeAllowGuests}
                      onChange={(e) => setFreeAllowGuests(e.target.checked)}
                      className="w-4 h-4 accent-emerald-600 rounded"
                    />
                    <span>Izinkan pengunjung tamu memakai FreeLLMAPI tanpa wajib login</span>
                  </label>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      disabled={Boolean(freeBusyAction)}
                      onClick={() => void handleSaveFreeLlm()}
                      className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[42px] bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl cursor-pointer disabled:opacity-60"
                    >
                      {freeBusyAction === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      <span>Simpan Pengaturan FreeLLMAPI</span>
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(freeBusyAction)}
                      onClick={() => void handleTestFreeLlm()}
                      className="flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[42px] bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl cursor-pointer disabled:opacity-60"
                    >
                      {freeBusyAction === 'test' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                      <span>Uji Koneksi AI</span>
                    </button>
                  </div>

                  {freeTestResult && (
                    <div
                      className={`p-3 rounded-lg border text-xs ${
                        freeTestResult.ok
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                          : 'bg-amber-50 border-amber-200 text-amber-950'
                      }`}
                    >
                      {freeTestResult.ok ? (
                        <div className="space-y-1">
                          <div className="font-bold">
                            Terhubung via {freeTestResult.provider} ({freeTestResult.model})
                          </div>
                          <div className="font-mono text-[11px]">{freeTestResult.reply}</div>
                        </div>
                      ) : (
                        <div>{freeTestResult.error}</div>
                      )}
                    </div>
                  )}
                </section>

                {/* Upstream Provider API Keys (Encrypted in server_secrets) */}
                <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                    Kunci Provider Auto-Failover (Terenkripsi)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Isi satu atau lebih kunci gratis untuk mengaktifkan failover otomatis di mesin internal. Kosongkan jika ingin memakai nilai yang sudah tersimpan.
                  </p>

                  {[
                    ['Groq API Key', freeGroqKey, setFreeGroqKey, freeLlmView?.hasGroqKey, 'gsk_...'],
                    ['Cerebras API Key', freeCerebrasKey, setFreeCerebrasKey, freeLlmView?.hasCerebrasKey, 'csk-...'],
                    ['OpenRouter API Key', freeOpenRouterKey, setFreeOpenRouterKey, freeLlmView?.hasOpenRouterKey, 'sk-or-...'],
                    ['Mistral API Key', freeMistralKey, setFreeMistralKey, freeLlmView?.hasMistralKey, '...'],
                    ['NVIDIA NIM API Key', freeNvidiaKey, setFreeNvidiaKey, freeLlmView?.hasNvidiaKey, 'nvapi-...'],
                    ['Gemini OpenAI-Compat Key', freeGeminiCompatKey, setFreeGeminiCompatKey, freeLlmView?.hasGeminiCompatKey, 'AIza...'],
                  ].map(([label, val, setter, isSet, placeholder]) => (
                    <div key={label as string} className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-slate-700">{label as string}</span>
                        {Boolean(isSet) && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono text-[10px]">
                            Tersimpan
                          </span>
                        )}
                      </div>
                      <input
                        type="password"
                        value={val as string}
                        onChange={(e) => (setter as (v: string) => void)(e.target.value)}
                        placeholder={isSet ? 'Tersimpan (isi untuk mengganti)' : (placeholder as string)}
                        className="w-full px-2.5 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                      />
                    </div>
                  ))}

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="space-y-1">
                      <label className="block text-[11px] font-semibold text-slate-700">
                        CF Workers Account ID
                      </label>
                      <input
                        type="text"
                        value={freeCfAccountId}
                        onChange={(e) => setFreeCfAccountId(e.target.value)}
                        placeholder="Account ID"
                        className="w-full px-2.5 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[11px] font-semibold text-slate-700">
                        CF AI Token {freeLlmView?.hasCloudflareAiKey ? '✓' : ''}
                      </label>
                      <input
                        type="password"
                        value={freeCfToken}
                        onChange={(e) => setFreeCfToken(e.target.value)}
                        placeholder="API Token"
                        className="w-full px-2.5 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                      />
                    </div>
                  </div>
                </section>
              </div>
            )}

            {/* TAB 3: FITUR PRO / FREE CHECKLIST */}
            {activeTab === 'premium' && (
              <div className="space-y-4">
                <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">
                        Pengaturan Fitur Premium (Ceklis Pro vs Free Semua Fitur)
                      </h2>
                      <p className="text-[11px] text-slate-500">
                        Seluruh {FEATURE_REGISTRY.length} fitur TemaLoka tercatat di bawah ini. Centang <strong>PRO</strong> untuk membatasi hanya ke akun Pro/Admin, atau <strong>FREE</strong> agar terbuka gratis.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={siteAdsense.savingConfig}
                      onClick={() => void handleSavePremium()}
                      className={`flex items-center gap-1.5 px-4 py-2.5 min-h-[40px] text-xs font-semibold rounded-xl cursor-pointer ${
                        premiumDirty
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                          : 'bg-slate-900 hover:bg-slate-800 text-white'
                      }`}
                    >
                      {siteAdsense.savingConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      <span>Simpan Daftar Pro/Free</span>
                    </button>
                  </div>

                  <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="space-y-0.5 text-xs">
                      <div className="font-bold text-amber-950 flex items-center gap-1.5">
                        <Ban className="w-4 h-4 text-amber-700 shrink-0" />
                        <span>
                          Bebas Iklan (Free Ads) saat ini berstatus:{' '}
                          {(premiumDraft.rules.free_ads?.tier || 'pro').toUpperCase()}
                        </span>
                      </div>
                      <p className="text-[11px] text-amber-900 leading-relaxed">
                        Saat bertanda <strong>PRO</strong>, iklan Google AdSense otomatis hilang untuk akun Pro &amp; akun yang diberi izin khusus <em>Bebas Iklan</em> di Manajemen User.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setActiveTab('payment')}
                        className="px-3 py-2 min-h-[36px] text-xs font-semibold bg-white border border-amber-300 text-amber-950 hover:bg-amber-100 rounded-lg cursor-pointer"
                      >
                        Atur Pembayaran Manual
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('account')}
                        className="px-3 py-2 min-h-[36px] text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 rounded-lg cursor-pointer"
                      >
                        Kelola User &amp; Akses
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={premiumDraft.enforcementEnabled}
                        onChange={(e) => {
                          setPremiumDraft((p) => ({ ...p, enforcementEnabled: e.target.checked }));
                          setPremiumDirty(true);
                        }}
                        className="mt-0.5 w-4 h-4 accent-amber-600 rounded"
                      />
                      <div className="text-xs">
                        <div className="font-bold text-slate-900">
                          Aktifkan Pembatasan Fitur PRO untuk Pengunjung &amp; Akun Free
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Jika dicentang, pengguna tanpa status Pro akan melihat layar kunci upgrade saat membuka fitur bertanda PRO (Admin selalu bebas akses).
                        </div>
                      </div>
                    </label>

                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const def = buildDefaultPremiumConfig('default');
                          setPremiumDraft((p) => ({ ...p, rules: def.rules }));
                          setPremiumDirty(true);
                        }}
                        className="px-3 py-2 min-h-[38px] text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-100 rounded-lg cursor-pointer"
                      >
                        Preset Standar ({proCount} Pro)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const freeAll = buildDefaultPremiumConfig('all-free');
                          setPremiumDraft((p) => ({ ...p, rules: freeAll.rules }));
                          setPremiumDirty(true);
                        }}
                        className="px-3 py-2 min-h-[38px] text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-100 rounded-lg cursor-pointer"
                      >
                        Jadikan Semua FREE
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="space-y-1">
                      <label className="block text-[11px] font-semibold text-slate-700">
                        Judul Kunci Pro
                      </label>
                      <input
                        type="text"
                        value={premiumDraft.upgradeTitle}
                        onChange={(e) => {
                          setPremiumDraft((p) => ({ ...p, upgradeTitle: e.target.value }));
                          setPremiumDirty(true);
                        }}
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[11px] font-semibold text-slate-700">
                        Label Tombol Upgrade
                      </label>
                      <input
                        type="text"
                        value={premiumDraft.upgradeCtaLabel}
                        onChange={(e) => {
                          setPremiumDraft((p) => ({ ...p, upgradeCtaLabel: e.target.value }));
                          setPremiumDirty(true);
                        }}
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[11px] font-semibold text-slate-700">
                        URL Upgrade / Kontak WA / Checkout
                      </label>
                      <input
                        type="url"
                        value={premiumDraft.upgradeCtaUrl}
                        onChange={(e) => {
                          setPremiumDraft((p) => ({ ...p, upgradeCtaUrl: e.target.value }));
                          setPremiumDirty(true);
                        }}
                        placeholder="https://wa.me/62..."
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-700">
                      Pesan Keterangan Upgrade Pro
                    </label>
                    <textarea
                      rows={2}
                      value={premiumDraft.upgradeMessage}
                      onChange={(e) => {
                        setPremiumDraft((p) => ({ ...p, upgradeMessage: e.target.value }));
                        setPremiumDirty(true);
                      }}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                    />
                  </div>

                  {/* Category Filter Pills */}
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                    {(
                      [
                        'all',
                        'Ruang Kerja',
                        'Mesin AI',
                        'Optimasi & XML',
                        'SEO & Monetisasi',
                        'Cloud & Utilitas',
                      ] as const
                    ).map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setFeatureCatFilter(cat)}
                        className={`px-3 py-1.5 min-h-[34px] rounded-lg border text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                          featureCatFilter === cat
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {cat === 'all' ? `Semua (${FEATURE_REGISTRY.length})` : cat}
                      </button>
                    ))}
                  </div>

                  {/* Checklist Cards / Grid */}
                  <div className="space-y-2">
                    {filteredFeatures.map((feat) => {
                      const rule = premiumDraft.rules[feat.id] || {
                        tier: feat.defaultTier,
                        enabled: feat.defaultEnabled,
                      };
                      const isPro = rule.tier === 'pro';
                      return (
                        <div
                          key={feat.id}
                          className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-slate-900">
                                {feat.name}
                              </span>
                              <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-white border border-slate-200 text-slate-600">
                                {feat.category}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                                  isPro
                                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                }`}
                              >
                                {isPro ? 'PRO' : 'FREE'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600 leading-relaxed">
                              {feat.description}
                            </p>
                          </div>

                          <div className="flex items-center gap-3 shrink-0 pt-1 sm:pt-0">
                            <label className="flex items-center gap-1.5 px-2.5 py-1.5 min-h-[38px] rounded-lg border border-slate-200 bg-white text-xs font-semibold cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={isPro}
                                onChange={(e) =>
                                  updateFeatureRule(feat.id, {
                                    tier: e.target.checked ? 'pro' : 'free',
                                  })
                                }
                                className="w-4 h-4 accent-amber-600 rounded"
                              />
                              <span className={isPro ? 'text-amber-800' : 'text-slate-600'}>
                                Tandai PRO
                              </span>
                            </label>

                            <label className="flex items-center gap-1.5 px-2.5 py-1.5 min-h-[38px] rounded-lg border border-slate-200 bg-white text-xs font-medium cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={rule.enabled}
                                onChange={(e) =>
                                  updateFeatureRule(feat.id, { enabled: e.target.checked })
                                }
                                className="w-4 h-4 accent-emerald-600 rounded"
                              />
                              <span className={rule.enabled ? 'text-emerald-800' : 'text-rose-700'}>
                                {rule.enabled ? 'Aktif' : 'Nonaktif'}
                              </span>
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            )}

            {/* TAB 4: SEO WEB & BLOG */}
            {activeTab === 'seo' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">
                        Pengaturan SEO Global Web &amp; Integrasi Search Console
                      </h2>
                      <p className="text-[11px] text-slate-500">
                        Disuntikkan otomatis ke <code className="font-mono">&lt;head&gt;</code> aplikasi dan melayani <code className="font-mono">/robots.txt</code> + <code className="font-mono">/sitemap.xml</code>.
                      </p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={seoDraft.seoEnabled}
                        onChange={(e) => {
                          setSeoDraft((p) => ({ ...p, seoEnabled: e.target.checked }));
                          setSeoDirty(true);
                        }}
                        className="w-4 h-4 accent-blue-600 rounded"
                      />
                      <span className="text-xs font-semibold text-slate-900">
                        {seoDraft.seoEnabled ? 'SEO Aktif' : 'Nonaktif'}
                      </span>
                    </label>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-800">
                        Judul Situs (&lt;title&gt; &amp; og:title)
                      </label>
                      <input
                        type="text"
                        value={seoDraft.siteTitle}
                        onChange={(e) => {
                          setSeoDraft((p) => ({ ...p, siteTitle: e.target.value }));
                          setSeoDirty(true);
                        }}
                        className="w-full px-3 py-2 min-h-[40px] text-xs bg-slate-50 border border-slate-200 rounded-lg"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-800">
                        Meta Description
                      </label>
                      <textarea
                        rows={2}
                        value={seoDraft.metaDescription}
                        onChange={(e) => {
                          setSeoDraft((p) => ({ ...p, metaDescription: e.target.value }));
                          setSeoDirty(true);
                        }}
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-800">
                        Meta Keywords
                      </label>
                      <input
                        type="text"
                        value={seoDraft.metaKeywords}
                        onChange={(e) => {
                          setSeoDraft((p) => ({ ...p, metaKeywords: e.target.value }));
                          setSeoDirty(true);
                        }}
                        className="w-full px-3 py-2 min-h-[40px] text-xs bg-slate-50 border border-slate-200 rounded-lg"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-800">
                          Canonical Origin Web
                        </label>
                        <input
                          type="url"
                          value={seoDraft.canonicalOrigin}
                          onChange={(e) => {
                            setSeoDraft((p) => ({ ...p, canonicalOrigin: e.target.value }));
                            setSeoDirty(true);
                          }}
                          placeholder="https://temaloka.domainanda.com"
                          className="w-full px-3 py-2 min-h-[40px] text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-800">
                          Default URL Blog Pengguna (Menu SEO)
                        </label>
                        <input
                          type="url"
                          value={seoDraft.defaultBlogUrl}
                          onChange={(e) => {
                            setSeoDraft((p) => ({ ...p, defaultBlogUrl: e.target.value }));
                            setSeoDirty(true);
                          }}
                          placeholder="https://bloganda.blogspot.com"
                          className="w-full px-3 py-2 min-h-[40px] text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-800">
                          Google Search Console Verification
                        </label>
                        <input
                          type="text"
                          value={seoDraft.googleSiteVerification}
                          onChange={(e) => {
                            setSeoDraft((p) => ({ ...p, googleSiteVerification: e.target.value }));
                            setSeoDirty(true);
                          }}
                          placeholder="Kode google-site-verification"
                          className="w-full px-3 py-2 min-h-[40px] text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-800">
                          Bing Verification (msvalidate.01)
                        </label>
                        <input
                          type="text"
                          value={seoDraft.bingSiteVerification}
                          onChange={(e) => {
                            setSeoDraft((p) => ({ ...p, bingSiteVerification: e.target.value }));
                            setSeoDirty(true);
                          }}
                          placeholder="Kode Bing Webmaster"
                          className="w-full px-3 py-2 min-h-[40px] text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-800">
                          Google Analytics GA4 (G-...)
                        </label>
                        <input
                          type="text"
                          value={seoDraft.gaMeasurementId}
                          onChange={(e) => {
                            setSeoDraft((p) => ({ ...p, gaMeasurementId: e.target.value }));
                            setSeoDirty(true);
                          }}
                          placeholder="G-XXXXXXXXXX"
                          className="w-full px-3 py-2 min-h-[40px] text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-800">
                          IndexNow Key Global
                        </label>
                        <input
                          type="text"
                          value={seoDraft.indexNowKey}
                          onChange={(e) => {
                            setSeoDraft((p) => ({ ...p, indexNowKey: e.target.value }));
                            setSeoDirty(true);
                          }}
                          placeholder="Kunci API IndexNow"
                          className="w-full px-3 py-2 min-h-[40px] text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      <label className="p-3 rounded-lg border border-slate-200 bg-slate-50/70 flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={seoDraft.schemaOrgEnabled}
                          onChange={(e) => {
                            setSeoDraft((p) => ({ ...p, schemaOrgEnabled: e.target.checked }));
                            setSeoDirty(true);
                          }}
                          className="accent-blue-600 rounded"
                        />
                        <span className="font-semibold text-slate-900">Aktifkan Schema.org JSON-LD</span>
                      </label>
                      <label className="p-3 rounded-lg border border-slate-200 bg-slate-50/70 flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={seoDraft.sitemapEnabled}
                          onChange={(e) => {
                            setSeoDraft((p) => ({ ...p, sitemapEnabled: e.target.checked }));
                            setSeoDirty(true);
                          }}
                          className="accent-blue-600 rounded"
                        />
                        <span className="font-semibold text-slate-900">Aktifkan /sitemap.xml</span>
                      </label>
                    </div>
                  </div>
                </section>

                <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                      Pengelola <code className="font-mono">/robots.txt</code> &amp; Sitemap
                    </h3>
                    <div className="flex items-center gap-2">
                      <a
                        href="/robots.txt"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 rounded flex items-center gap-1"
                      >
                        <span>robots.txt</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <a
                        href="/sitemap.xml"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 rounded flex items-center gap-1"
                      >
                        <span>sitemap.xml</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>

                  <textarea
                    rows={6}
                    value={seoDraft.robotsTxtContent}
                    onChange={(e) => {
                      setSeoDraft((p) => ({ ...p, robotsTxtContent: e.target.value }));
                      setSeoDirty(true);
                    }}
                    spellCheck={false}
                    className="w-full p-3 text-xs font-mono bg-slate-900 text-slate-100 border border-slate-800 rounded-xl"
                  />

                  <button
                    type="button"
                    disabled={siteAdsense.savingConfig}
                    onClick={() => void handleSaveSeo()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 min-h-[42px] bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl cursor-pointer"
                  >
                    {siteAdsense.savingConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    <span>{seoDirty ? 'Simpan Pengaturan SEO ke D1' : 'Simpan Ulang SEO'}</span>
                  </button>
                </section>
              </div>
            )}

            {/* TAB 5: GOOGLE ADSENSE */}
            {activeTab === 'adsense' && (
              <div className="space-y-4">
                <div className="bg-white border border-slate-200 rounded-xl p-1.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1">
                    {(
                      [
                        ['global', 'Global & Auto Ads', Settings2],
                        ['slots', '4 Zona Iklan', Layout],
                        ['units', `Unit Iklan (${siteAdsense.units.length})`, Code2],
                        ['adstxt', 'Pengelola /ads.txt', FileText],
                      ] as const
                    ).map(([id, label, Icon]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setAdsenseSubTab(id)}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg cursor-pointer ${
                          adsenseSubTab === id
                            ? 'bg-emerald-600 text-white'
                            : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    disabled={siteAdsense.savingConfig || !adsDirty}
                    onClick={() => void handleSaveAdsense()}
                    className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg cursor-pointer ${
                      adsDirty
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'bg-slate-100 text-slate-400 border border-slate-200'
                    }`}
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{adsDirty ? 'Simpan AdSense' : 'Tersinkron'}</span>
                  </button>
                </div>

                {adsenseSubTab === 'global' && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                    <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
                      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
                        <div>
                          <h2 className="text-sm font-bold text-slate-900">
                            Konfigurasi Utama Google AdSense
                          </h2>
                          <p className="text-[11px] text-slate-500">
                            Mengatur AdSense di web TemaLoka dan default Studio XML.
                          </p>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={adsDraft.adsenseEnabled}
                            onChange={(e) => updateAdsDraft({ adsenseEnabled: e.target.checked })}
                            className="w-4 h-4 accent-emerald-600 rounded"
                          />
                          <span className="text-xs font-semibold text-slate-900">
                            {adsDraft.adsenseEnabled ? 'Aktif' : 'Nonaktif'}
                          </span>
                        </label>
                      </div>

                      <div className="space-y-3">
                        <div className="space-y-1">
                          <label className="block text-xs font-semibold text-slate-800">
                            Publisher ID Global
                          </label>
                          <div className="flex flex-wrap gap-2">
                            <input
                              type="text"
                              value={adsDraft.publisherId}
                              onChange={(e) => updateAdsDraft({ publisherId: e.target.value })}
                              placeholder="ca-pub-1234567890123456"
                              className="flex-1 min-w-[200px] px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const clean = sanitizePublisherId(adsDraft.publisherId);
                                if (!clean) {
                                  onNotify?.('Masukkan ca-pub yang valid dulu.', 'info');
                                  return;
                                }
                                updateAdsDraft({
                                  publisherId: clean,
                                  defaultTemplatePubId: clean,
                                  adsTxtContent: buildAdsTxtLine(clean),
                                });
                                onNotify?.('Publisher ID disinkronkan ke Studio & ads.txt.', 'success');
                              }}
                              className="px-3 py-2 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg cursor-pointer"
                            >
                              Sinkron ke ads.txt
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <label className="p-3 rounded-lg border border-slate-200 bg-slate-50/70 flex items-start gap-2 cursor-pointer text-xs">
                            <input
                              type="checkbox"
                              checked={adsDraft.autoAdsEnabled}
                              onChange={(e) => updateAdsDraft({ autoAdsEnabled: e.target.checked })}
                              className="mt-0.5 accent-emerald-600 rounded"
                            />
                            <div>
                              <div className="font-semibold text-slate-900">Skrip Auto Ads &lt;head&gt;</div>
                              <div className="text-[11px] text-slate-500">Muat adsbygoogle.js otomatis</div>
                            </div>
                          </label>
                          <label className="p-3 rounded-lg border border-slate-200 bg-slate-50/70 flex items-start gap-2 cursor-pointer text-xs">
                            <input
                              type="checkbox"
                              checked={adsDraft.headMetaEnabled}
                              onChange={(e) => updateAdsDraft({ headMetaEnabled: e.target.checked })}
                              className="mt-0.5 accent-emerald-600 rounded"
                            />
                            <div>
                              <div className="font-semibold text-slate-900">Meta Verifikasi Akun</div>
                              <div className="text-[11px] text-slate-500">Tag google-adsense-account</div>
                            </div>
                          </label>
                          <label className="p-3 rounded-lg border border-slate-200 bg-slate-50/70 flex items-start gap-2 cursor-pointer text-xs">
                            <input
                              type="checkbox"
                              checked={adsDraft.hideAdsForAdmin}
                              onChange={(e) => updateAdsDraft({ hideAdsForAdmin: e.target.checked })}
                              className="mt-0.5 accent-emerald-600 rounded"
                            />
                            <div>
                              <div className="font-semibold text-slate-900">Proteksi Admin</div>
                              <div className="text-[11px] text-slate-500">Cegah invalid click Admin</div>
                            </div>
                          </label>
                          <label className="p-3 rounded-lg border border-slate-200 bg-slate-50/70 flex items-start gap-2 cursor-pointer text-xs">
                            <input
                              type="checkbox"
                              checked={adsDraft.testMode}
                              onChange={(e) => updateAdsDraft({ testMode: e.target.checked })}
                              className="mt-0.5 accent-amber-600 rounded"
                            />
                            <div>
                              <div className="font-semibold text-slate-900">Mode Uji Coba</div>
                              <div className="text-[11px] text-slate-500">Tambahkan data-adtest=&quot;on&quot;</div>
                            </div>
                          </label>
                        </div>
                      </div>
                    </section>

                    <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-emerald-600" />
                        <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                          Pratinjau Tag AdSense &lt;head&gt;
                        </h3>
                      </div>
                      <pre className="p-3 rounded-lg bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap break-all">
                        {!adsDraft.adsenseEnabled || !cleanPubPreview
                          ? '<!-- Google AdSense nonaktif atau ca-pub belum diisi -->'
                          : [
                              adsDraft.headMetaEnabled
                                ? `<meta name="google-adsense-account" content="${cleanPubPreview}" />`
                                : '',
                              adsDraft.autoAdsEnabled
                                ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${cleanPubPreview}" crossorigin="anonymous"></script>`
                                : '',
                            ]
                              .filter(Boolean)
                              .join('\n')}
                      </pre>
                      <button
                        type="button"
                        onClick={() => void handleSaveAdsense()}
                        disabled={siteAdsense.savingConfig}
                        className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>Simpan Konfigurasi AdSense</span>
                      </button>
                    </section>
                  </div>
                )}

                {adsenseSubTab === 'slots' && (
                  <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        ['1. Top Banner Workspace', adsDraft.topBannerEnabled, (v: boolean) => updateAdsDraft({ topBannerEnabled: v }), adsDraft.topBannerSlot, (v: string) => updateAdsDraft({ topBannerSlot: sanitizeSlotDigits(v) }), adsDraft.topBannerFormat, (v: string) => updateAdsDraft({ topBannerFormat: v as TopBannerFormat }), ['horizontal', 'auto', 'rectangle']],
                        ['2. Sidebar Panel Kiri', adsDraft.sidebarSlotEnabled, (v: boolean) => updateAdsDraft({ sidebarSlotEnabled: v }), adsDraft.sidebarSlotId, (v: string) => updateAdsDraft({ sidebarSlotId: sanitizeSlotDigits(v) }), adsDraft.sidebarSlotFormat, (v: string) => updateAdsDraft({ sidebarSlotFormat: v as SidebarSlotFormat }), ['rectangle', 'vertical', 'auto']],
                        ['3. Footer Halaman SEO/Splitter', adsDraft.footerSlotEnabled, (v: boolean) => updateAdsDraft({ footerSlotEnabled: v }), adsDraft.footerSlotId, (v: string) => updateAdsDraft({ footerSlotId: sanitizeSlotDigits(v) }), adsDraft.footerSlotFormat, (v: string) => updateAdsDraft({ footerSlotFormat: v as FooterSlotFormat }), ['auto', 'horizontal', 'rectangle']],
                        ['4. Modal Ekspor Tema XML', adsDraft.modalSlotEnabled, (v: boolean) => updateAdsDraft({ modalSlotEnabled: v }), adsDraft.modalSlotId, (v: string) => updateAdsDraft({ modalSlotId: sanitizeSlotDigits(v) }), adsDraft.modalSlotFormat, (v: string) => updateAdsDraft({ modalSlotFormat: v as ModalSlotFormat }), ['rectangle', 'auto']],
                      ].map(([title, enabled, setEnabled, slotId, setSlotId, format, setFormat, options]) => (
                        <div key={title as string} className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-900">{title as string}</span>
                            <input
                              type="checkbox"
                              checked={enabled as boolean}
                              onChange={(e) => (setEnabled as (v: boolean) => void)(e.target.checked)}
                              className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={slotId as string}
                              onChange={(e) => (setSlotId as (v: string) => void)(e.target.value)}
                              placeholder="Slot ID"
                              className="px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-lg"
                            />
                            <select
                              value={format as string}
                              onChange={(e) => (setFormat as (v: string) => void)(e.target.value)}
                              className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                            >
                              {(options as string[]).map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {adsenseSubTab === 'units' && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                    <form
                      onSubmit={(e) => void handleSaveUnit(e)}
                      className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-slate-900">
                          {editingUnitId ? 'Edit Unit Iklan' : 'Tambah Unit Iklan'}
                        </h3>
                        {editingUnitId && (
                          <button type="button" onClick={resetUnitForm} className="text-xs text-slate-500 cursor-pointer">
                            Batal
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        required
                        value={unitName}
                        onChange={(e) => setUnitName(e.target.value)}
                        placeholder="Nama Unit Iklan"
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={unitSlotId}
                          onChange={(e) => setUnitSlotId(sanitizeSlotDigits(e.target.value))}
                          placeholder="Slot ID"
                          className="px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                        />
                        <select
                          value={unitFormat}
                          onChange={(e) => setUnitFormat(e.target.value as AdsenseUnitFormatType)}
                          className="px-2.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                        >
                          <option value="responsive">Auto Responsive</option>
                          <option value="leaderboard">Leaderboard</option>
                          <option value="sidebar">Sidebar 300x250</option>
                          <option value="in-article">In-Article</option>
                          <option value="multiplex">Multiplex</option>
                        </select>
                      </div>
                      <select
                        value={unitPlacement}
                        onChange={(e) => setUnitPlacement(e.target.value as AdsenseUnitPlacementType)}
                        className="w-full px-2.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                      >
                        <option value="bloggerTemplate">Sisipan Template XML Blogger</option>
                        <option value="topBanner">Top Banner</option>
                        <option value="sidebarSlot">Sidebar</option>
                        <option value="footerSlot">Footer</option>
                        <option value="modalSlot">Modal Ekspor</option>
                      </select>
                      <button
                        type="submit"
                        disabled={actionBusy}
                        className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{editingUnitId ? 'Perbarui Unit' : 'Simpan Unit Iklan'}</span>
                      </button>
                    </form>

                    <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                        <h3 className="text-sm font-bold text-slate-900">
                          Daftar Unit ({siteAdsense.units.length})
                        </h3>
                        <select
                          value={targetSectionId}
                          onChange={(e) => setTargetSectionId(e.target.value)}
                          className="px-2.5 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                        >
                          {parsedInfo.sections.length === 0 ? (
                            <option value="sidebar">#sidebar</option>
                          ) : (
                            parsedInfo.sections.map((s) => (
                              <option key={s.id} value={s.id}>
                                #{s.id}
                              </option>
                            ))
                          )}
                        </select>
                      </div>

                      {siteAdsense.units.map((u) => (
                        <div key={u.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-900">{u.name}</span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => startEditUnit(u)}
                                className="px-2 py-1 text-[11px] bg-white border border-slate-200 rounded cursor-pointer"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteUnit(u)}
                                className="p-1.5 text-slate-400 hover:text-red-600 bg-white border border-slate-200 rounded cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleCopy(`html-${u.id}`, buildUnitHtmlSnippet(u), 'HTML')}
                              className="px-2.5 py-1 text-[11px] bg-white border border-slate-200 rounded-lg cursor-pointer"
                            >
                              Salin HTML
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopy(`xml-${u.id}`, buildUnitBloggerXmlSnippet(u), 'XML')}
                              className="px-2.5 py-1 text-[11px] bg-white border border-slate-200 rounded-lg cursor-pointer"
                            >
                              Salin XML
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (!cleanPubPreview) {
                                  onNotify?.('Isi ca-pub di tab Global dulu.', 'info');
                                  return;
                                }
                                const res = injectAdsenseIntoXml(xml, {
                                  publisherId: cleanPubPreview,
                                  slotId: u.slotId,
                                  format: u.format,
                                  target: { kind: 'section-html-ins', sectionId: targetSectionId },
                                  onlyOnPosts: u.onlyOnPosts,
                                  widgetTitle: u.name,
                                });
                                if (res.changed) onUpdateXml(res.nextXml, res.summary);
                                else onNotify?.(res.summary, 'info');
                              }}
                              className="px-2.5 py-1 text-[11px] font-semibold text-white bg-emerald-600 rounded-lg flex items-center gap-1 cursor-pointer"
                            >
                              <PlusCircle className="w-3 h-3" />
                              <span>Pasang ke #{targetSectionId}</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </section>
                  </div>
                )}

                {adsenseSubTab === 'adstxt' && (
                  <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-slate-900">/ads.txt</h3>
                      <a
                        href="/ads.txt"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 text-xs bg-slate-100 rounded-lg flex items-center gap-1"
                      >
                        <span>Buka /ads.txt</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <textarea
                      rows={5}
                      value={adsDraft.adsTxtContent}
                      onChange={(e) => updateAdsDraft({ adsTxtContent: e.target.value })}
                      className="w-full p-3 text-xs font-mono bg-slate-900 text-emerald-300 rounded-xl"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const content = adsDraft.adsTxtContent.trim() || buildAdsTxtLine(adsDraft.publisherId);
                          if (!content) return;
                          const blob = new Blob([content + '\n'], { type: 'text/plain;charset=utf-8' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = 'ads.txt';
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="px-3 py-2 text-xs bg-slate-100 rounded-lg flex items-center gap-1 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Unduh ads.txt</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSaveAdsense()}
                        className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg flex items-center gap-1.5 cursor-pointer"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>Simpan &amp; Terbitkan</span>
                      </button>
                    </div>
                  </section>
                )}
              </div>
            )}

            {/* TAB: PENGATURAN ALAT PEMBAYARAN MANUAL */}
            {activeTab === 'payment' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* Left: Global Manual Payment Plan & Instructions */}
                <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">
                        Pengaturan Paket &amp; Pembayaran Manual
                      </h2>
                      <p className="text-[11px] text-slate-500">
                        Tampil saat pengguna Free mengklik tombol Upgrade Paket Pro atau Bebas Iklan.
                      </p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={paymentDraft.manualPaymentEnabled}
                        onChange={(e) => {
                          setPaymentDraft((p) => ({
                            ...p,
                            manualPaymentEnabled: e.target.checked,
                          }));
                          setPaymentDirty(true);
                        }}
                        className="w-4 h-4 accent-emerald-600 rounded"
                      />
                      <span className="text-xs font-semibold text-slate-900">
                        {paymentDraft.manualPaymentEnabled ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </label>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-800">
                        Nama Paket Pro
                      </label>
                      <input
                        type="text"
                        value={paymentDraft.proPlanName}
                        onChange={(e) => {
                          setPaymentDraft((p) => ({ ...p, proPlanName: e.target.value }));
                          setPaymentDirty(true);
                        }}
                        placeholder="TemaLoka Pro"
                        className="w-full px-3 py-2 min-h-[40px] text-xs bg-slate-50 border border-slate-200 rounded-lg"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-800">
                          Harga / Nominal Tampil
                        </label>
                        <input
                          type="text"
                          value={paymentDraft.proPriceLabel}
                          onChange={(e) => {
                            setPaymentDraft((p) => ({ ...p, proPriceLabel: e.target.value }));
                            setPaymentDirty(true);
                          }}
                          placeholder="Rp 99.000"
                          className="w-full px-3 py-2 min-h-[40px] text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-800">
                          Durasi / Keterangan Paket
                        </label>
                        <input
                          type="text"
                          value={paymentDraft.billingCycleLabel}
                          onChange={(e) => {
                            setPaymentDraft((p) => ({
                              ...p,
                              billingCycleLabel: e.target.value,
                            }));
                            setPaymentDirty(true);
                          }}
                          placeholder="Sekali Bayar / Aktivasi Manual"
                          className="w-full px-3 py-2 min-h-[40px] text-xs bg-slate-50 border border-slate-200 rounded-lg"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-800">
                        Petunjuk Transfer &amp; Aktivasi
                      </label>
                      <textarea
                        rows={3}
                        value={paymentDraft.paymentInstructions}
                        onChange={(e) => {
                          setPaymentDraft((p) => ({
                            ...p,
                            paymentInstructions: e.target.value,
                          }));
                          setPaymentDirty(true);
                        }}
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-800">
                          Label Tombol Konfirmasi
                        </label>
                        <input
                          type="text"
                          value={paymentDraft.confirmationButtonLabel}
                          onChange={(e) => {
                            setPaymentDraft((p) => ({
                              ...p,
                              confirmationButtonLabel: e.target.value,
                            }));
                            setPaymentDirty(true);
                          }}
                          placeholder="Konfirmasi Pembayaran"
                          className="w-full px-3 py-2 min-h-[40px] text-xs bg-slate-50 border border-slate-200 rounded-lg"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-800">
                          URL Konfirmasi (WA / Telegram / Form)
                        </label>
                        <input
                          type="url"
                          value={paymentDraft.confirmationUrl}
                          onChange={(e) => {
                            setPaymentDraft((p) => ({
                              ...p,
                              confirmationUrl: e.target.value,
                            }));
                            setPaymentDirty(true);
                          }}
                          placeholder="https://wa.me/628..."
                          className="w-full px-3 py-2 min-h-[40px] text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={siteAdsense.savingConfig}
                    onClick={() => void handleSavePaymentSettings()}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 min-h-[42px] text-xs font-semibold rounded-xl cursor-pointer disabled:opacity-60 ${
                      paymentDirty
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'bg-slate-900 hover:bg-slate-800 text-white'
                    }`}
                  >
                    {siteAdsense.savingConfig ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    <span>
                      {paymentDirty
                        ? 'Simpan Pengaturan Pembayaran'
                        : 'Pengaturan Pembayaran Tersimpan'}
                    </span>
                  </button>
                </section>

                {/* Right: Dynamic Manual Payment Columns (Bank, E-Wallet, QRIS, PayPal, Custom) */}
                <section className="lg:col-span-7 space-y-4">
                  <form
                    onSubmit={(e) => void handleSavePaymentMethod(e)}
                    className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3.5"
                  >
                    <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">
                          {editingPaymentId
                            ? 'Edit Kolom Alat Pembayaran Manual'
                            : 'Tambah Kolom Alat Pembayaran Manual'}
                        </h3>
                        <p className="text-[11px] text-slate-500">
                          Tambahkan rekening bank, e-wallet (DANA/OVO/GoPay/ShopeePay), QRIS, PayPal, atau metode kustom lainnya.
                        </p>
                      </div>
                      {editingPaymentId && (
                        <button
                          type="button"
                          onClick={resetPaymentMethodForm}
                          className="px-2.5 py-1 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                        >
                          Batal Edit
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-800">
                          Jenis Kolom Pembayaran
                        </label>
                        <select
                          value={payType}
                          onChange={(e) =>
                            setPayType(e.target.value as ManualPaymentMethodType)
                          }
                          className="w-full px-3 py-2 min-h-[40px] text-xs bg-slate-50 border border-slate-200 rounded-lg"
                        >
                          <option value="bank">Transfer Bank</option>
                          <option value="ewallet">E-Wallet (DANA / GoPay / OVO / dll)</option>
                          <option value="qris">QRIS</option>
                          <option value="paypal">PayPal</option>
                          <option value="custom">Kolom Pembayaran Kustom</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-800">
                          Nama Bank / Provider
                        </label>
                        <input
                          type="text"
                          required
                          value={payProviderName}
                          onChange={(e) => setPayProviderName(e.target.value)}
                          placeholder="Misal: Bank BCA / DANA / QRIS"
                          className="w-full px-3 py-2 min-h-[40px] text-xs bg-slate-50 border border-slate-200 rounded-lg"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-800">
                          Nomor Rekening / Nomor HP / Email PayPal
                        </label>
                        <input
                          type="text"
                          value={payAccountNumber}
                          onChange={(e) => setPayAccountNumber(e.target.value)}
                          placeholder="Misal: 1234567890 atau 0812..."
                          className="w-full px-3 py-2 min-h-[40px] text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-800">
                          Nama Pemilik Rekening / Akun (a.n.)
                        </label>
                        <input
                          type="text"
                          value={payAccountHolder}
                          onChange={(e) => setPayAccountHolder(e.target.value)}
                          placeholder="Misal: PT TemaLoka Studio"
                          className="w-full px-3 py-2 min-h-[40px] text-xs bg-slate-50 border border-slate-200 rounded-lg"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-800">
                          URL Gambar QRIS (Opsional, HTTPS)
                        </label>
                        <input
                          type="url"
                          value={payQrisUrl}
                          onChange={(e) => setPayQrisUrl(e.target.value)}
                          placeholder="https://.../qris.png"
                          className="w-full px-3 py-2 min-h-[40px] text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-800">
                          Catatan Tambahan (Opsional)
                        </label>
                        <input
                          type="text"
                          value={payNote}
                          onChange={(e) => setPayNote(e.target.value)}
                          placeholder="Misal: Sertakan email di berita transfer"
                          className="w-full px-3 py-2 min-h-[40px] text-xs bg-slate-50 border border-slate-200 rounded-lg"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={payEnabled}
                          onChange={(e) => setPayEnabled(e.target.checked)}
                          className="w-4 h-4 accent-emerald-600 rounded"
                        />
                        <span>Tampilkan kolom ini ke pengguna</span>
                      </label>

                      <button
                        type="submit"
                        disabled={paymentMethodBusy || siteAdsense.savingConfig}
                        className="flex items-center gap-1.5 px-4 py-2.5 min-h-[40px] bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl cursor-pointer disabled:opacity-60"
                      >
                        {paymentMethodBusy ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Plus className="w-4 h-4" />
                        )}
                        <span>
                          {editingPaymentId ? 'Simpan Perubahan Kolom' : 'Tambah Kolom Pembayaran'}
                        </span>
                      </button>
                    </div>
                  </form>

                  <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
                    <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                      <h3 className="text-sm font-bold text-slate-900">
                        Daftar Kolom Pembayaran Manual ({paymentDraft.methods.length})
                      </h3>
                      <span className="text-[11px] text-slate-500">
                        {paymentDraft.methods.filter((m) => m.enabled).length} aktif tampil ke pengguna
                      </span>
                    </div>

                    {paymentDraft.methods.length === 0 ? (
                      <div className="p-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 text-center text-xs text-slate-500">
                        Belum ada kolom alat pembayaran manual. Tambahkan lewat formulir di atas.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {paymentDraft.methods.map((m) => {
                          const TypeIcon =
                            m.type === 'bank'
                              ? Building2
                              : m.type === 'ewallet'
                                ? Smartphone
                                : m.type === 'qris'
                                  ? QrCode
                                  : m.type === 'paypal'
                                    ? Wallet
                                    : CreditCard;
                          return (
                            <div
                              key={m.id}
                              className={`p-3 rounded-xl border space-y-2 ${
                                m.enabled
                                  ? 'bg-slate-50/70 border-slate-200'
                                  : 'bg-slate-100/70 border-slate-200 opacity-75'
                              }`}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-700 flex items-center justify-center shrink-0">
                                    <TypeIcon className="w-4 h-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="text-xs font-bold text-slate-900">
                                        {m.providerName}
                                      </span>
                                      <span className="px-1.5 py-0.5 text-[10px] font-mono uppercase rounded bg-white border border-slate-200 text-slate-600">
                                        {m.type}
                                      </span>
                                      <span
                                        className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                                          m.enabled
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : 'bg-slate-200 text-slate-600'
                                        }`}
                                      >
                                        {m.enabled ? 'Aktif' : 'Nonaktif'}
                                      </span>
                                    </div>
                                    <div className="text-[11px] font-mono text-slate-700 mt-0.5 break-all">
                                      {m.accountNumber || '(QRIS / Instruksi)'}
                                      {m.accountHolder ? ` · a.n. ${m.accountHolder}` : ''}
                                    </div>
                                    {m.note && (
                                      <div className="text-[11px] text-slate-500 mt-0.5">
                                        {m.note}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    disabled={paymentMethodBusy}
                                    onClick={() => void handleTogglePaymentMethod(m)}
                                    className="px-2.5 py-1.5 text-[11px] font-semibold bg-white border border-slate-200 hover:bg-slate-100 rounded-lg cursor-pointer"
                                  >
                                    {m.enabled ? 'Nonaktifkan' : 'Aktifkan'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => startEditPaymentMethod(m)}
                                    className="px-2.5 py-1.5 text-[11px] font-semibold bg-white border border-slate-200 hover:bg-slate-100 rounded-lg cursor-pointer"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    disabled={paymentMethodBusy}
                                    onClick={() => void handleDeletePaymentMethod(m)}
                                    aria-label={`Hapus ${m.providerName}`}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 bg-white border border-slate-200 rounded-lg cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </section>
              </div>
            )}

            {/* TAB 6: AKUN ADMIN & USER TIER + PER-USER FEATURE ACCESS */}
            {activeTab === 'account' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                <form
                  onSubmit={(e) => void handleUpdateAdminCredentials(e)}
                  className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3.5"
                >
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <KeyRound className="w-4 h-4 text-blue-600" />
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">
                        Ubah Email &amp; Password Admin Utama
                      </h2>
                      <p className="text-[11px] text-slate-500">
                        Email bawaan ({ADMIN_BOOTSTRAP_EMAIL}) bisa diganti kapan saja di sini beserta password Anda.
                      </p>
                    </div>
                  </div>

                  {(accountFormError || lastAuthError) && (
                    <div
                      role="alert"
                      className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                      <span>{accountFormError || lastAuthError}</span>
                    </div>
                  )}

                  <div className="space-y-2.5">
                    <div className="space-y-1">
                      <label htmlFor="admin-edit-current-pw" className="block text-xs font-semibold text-slate-800">
                        Password Admin Saat Ini (Wajib untuk Konfirmasi)
                      </label>
                      <div className="relative">
                        <input
                          id="admin-edit-current-pw"
                          type={showEditCurrentPw ? 'text' : 'password'}
                          required
                          autoComplete="current-password"
                          value={editCurrentPassword}
                          onChange={(e) => {
                            setEditCurrentPassword(e.target.value);
                            setAccountFormError(null);
                            clearLastAuthError();
                          }}
                          placeholder="Masukkan password admin saat ini..."
                          className="w-full pl-3 pr-10 py-2 min-h-[42px] text-sm sm:text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                        />
                        <button
                          type="button"
                          onClick={() => setShowEditCurrentPw((v) => !v)}
                          aria-label={showEditCurrentPw ? 'Sembunyikan password saat ini' : 'Lihat password saat ini'}
                          className="absolute inset-y-0 right-0 px-2.5 flex items-center justify-center text-slate-500 hover:text-slate-800 cursor-pointer"
                        >
                          {showEditCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="admin-edit-email" className="block text-xs font-semibold text-slate-800">
                        Email Admin Baru
                      </label>
                      <input
                        id="admin-edit-email"
                        type="email"
                        required
                        autoComplete="email"
                        inputMode="email"
                        value={editAdminEmail}
                        onChange={(e) => {
                          setEditAdminEmail(e.target.value);
                          setAccountFormError(null);
                        }}
                        className="w-full px-3 py-2 min-h-[42px] text-sm sm:text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                      />
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="admin-edit-name" className="block text-xs font-semibold text-slate-800">
                        Nama Tampilan Admin
                      </label>
                      <input
                        id="admin-edit-name"
                        type="text"
                        autoComplete="name"
                        value={editAdminDisplayName}
                        onChange={(e) => setEditAdminDisplayName(e.target.value)}
                        className="w-full px-3 py-2 min-h-[42px] text-sm sm:text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <label htmlFor="admin-edit-new-pw" className="block text-xs font-semibold text-slate-800">
                          Password Baru (Opsional)
                        </label>
                        <div className="relative">
                          <input
                            id="admin-edit-new-pw"
                            type={showEditNewPw ? 'text' : 'password'}
                            autoComplete="new-password"
                            value={editNewPassword}
                            onChange={(e) => {
                              setEditNewPassword(e.target.value);
                              setAccountFormError(null);
                            }}
                            placeholder="Kosongkan jika tidak ganti"
                            className="w-full pl-3 pr-10 py-2 min-h-[42px] text-sm sm:text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                          />
                          <button
                            type="button"
                            onClick={() => setShowEditNewPw((v) => !v)}
                            aria-label={showEditNewPw ? 'Sembunyikan password baru' : 'Lihat password baru'}
                            className="absolute inset-y-0 right-0 px-2.5 flex items-center justify-center text-slate-500 hover:text-slate-800 cursor-pointer"
                          >
                            {showEditNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="admin-edit-confirm-pw" className="block text-xs font-semibold text-slate-800">
                          Konfirmasi Password Baru
                        </label>
                        <div className="relative">
                          <input
                            id="admin-edit-confirm-pw"
                            type={showEditConfirmPw ? 'text' : 'password'}
                            autoComplete="new-password"
                            value={editNewPasswordConfirm}
                            onChange={(e) => {
                              setEditNewPasswordConfirm(e.target.value);
                              setAccountFormError(null);
                            }}
                            placeholder="Ulangi password baru"
                            className="w-full pl-3 pr-10 py-2 min-h-[42px] text-sm sm:text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                          />
                          <button
                            type="button"
                            onClick={() => setShowEditConfirmPw((v) => !v)}
                            aria-label={showEditConfirmPw ? 'Sembunyikan konfirmasi password' : 'Lihat konfirmasi password'}
                            className="absolute inset-y-0 right-0 px-2.5 flex items-center justify-center text-slate-500 hover:text-slate-800 cursor-pointer"
                          >
                            {showEditConfirmPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSigningIn}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 min-h-[42px] bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl cursor-pointer disabled:opacity-60"
                  >
                    {isSigningIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    <span>Simpan Perubahan Akun Admin</span>
                  </button>
                </form>

                {/* Registered Users, Free/Pro Management & Per-User Specific Feature Access */}
                <div className="lg:col-span-7 space-y-4">
                  <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-emerald-600" />
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">
                            Manajemen User ({managedUsers.length})
                          </h3>
                          <p className="text-[11px] text-slate-500">
                            Tentukan akun Premium (PRO) vs Free serta izinkan/batasi fitur tertentu per akun (termasuk Bebas Iklan).
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void loadProtectedAdminData()}
                        className="px-2.5 py-1.5 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                      >
                        Refresh
                      </button>
                    </div>

                    {/* Search & Tier Filter */}
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="relative flex-1">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={userSearchQuery}
                          onChange={(e) => setUserSearchQuery(e.target.value)}
                          placeholder="Cari email atau nama user..."
                          className="w-full pl-8 pr-3 py-2 min-h-[38px] text-xs bg-slate-50 border border-slate-200 rounded-lg"
                        />
                      </div>
                      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 shrink-0">
                        {(
                          [
                            ['all', 'Semua'],
                            ['pro', 'PRO'],
                            ['free', 'FREE'],
                          ] as const
                        ).map(([val, lbl]) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setUserTierFilter(val)}
                            className={`px-2.5 py-1 text-[11px] font-semibold rounded-md cursor-pointer ${
                              userTierFilter === val
                                ? 'bg-white text-slate-900 shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            {lbl}
                          </button>
                        ))}
                      </div>
                    </div>

                    {(() => {
                      const q = userSearchQuery.trim().toLowerCase();
                      const filtered = managedUsers.filter((u) => {
                        if (userTierFilter === 'pro' && u.tier !== 'pro') return false;
                        if (userTierFilter === 'free' && u.tier !== 'free') return false;
                        if (!q) return true;
                        return (
                          u.email.toLowerCase().includes(q) ||
                          u.displayName.toLowerCase().includes(q)
                        );
                      });

                      if (managedUsers.length === 0) {
                        return (
                          <div className="text-xs text-slate-500 py-5 text-center border border-dashed border-slate-200 rounded-lg">
                            Belum ada pengguna terdaftar di database.
                          </div>
                        );
                      }

                      if (filtered.length === 0) {
                        return (
                          <div className="text-xs text-slate-500 py-5 text-center border border-dashed border-slate-200 rounded-lg">
                            Tidak ada akun yang cocok dengan filter pencarian.
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-2.5 max-h-[540px] overflow-y-auto pr-0.5">
                          {filtered.map((u) => {
                            const overrides = u.featureOverrides || {};
                            const overrideCount = Object.keys(overrides).length;
                            const isExpanded = editingFeaturesUserId === u.id;
                            const freeAdsEffective =
                              overrides.free_ads === 'allow' ||
                              (overrides.free_ads !== 'deny' && u.tier === 'pro');
                            return (
                              <div
                                key={u.id}
                                className="rounded-xl bg-slate-50 border border-slate-200 overflow-hidden"
                              >
                                <div className="p-3 flex flex-wrap items-center justify-between gap-2.5 text-xs">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-semibold text-slate-900 truncate">
                                        {u.email}
                                      </span>
                                      <span
                                        className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                                          u.tier === 'pro'
                                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                            : 'bg-white text-slate-700 border border-slate-300'
                                        }`}
                                      >
                                        {u.tier.toUpperCase()}
                                      </span>
                                      {freeAdsEffective && (
                                        <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-emerald-100 text-emerald-800">
                                          Bebas Iklan
                                        </span>
                                      )}
                                      {overrideCount > 0 && (
                                        <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-blue-100 text-blue-800">
                                          {overrideCount} Akses Khusus
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-slate-500 mt-0.5">
                                      {u.displayName} · Role: {u.role}
                                    </div>
                                  </div>

                                  {u.role === 'admin' ? (
                                    <span className="px-2.5 py-1 text-[10px] font-bold bg-slate-900 text-white rounded shrink-0">
                                      ADMIN
                                    </span>
                                  ) : (
                                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                                      <button
                                        type="button"
                                        disabled={loadingUsers}
                                        onClick={() =>
                                          void handleToggleUserTier(
                                            u,
                                            u.tier === 'pro' ? 'free' : 'pro'
                                          )
                                        }
                                        className={`px-2.5 py-1.5 min-h-[34px] text-[11px] font-bold rounded-lg border cursor-pointer ${
                                          u.tier === 'pro'
                                            ? 'bg-amber-100 border-amber-300 text-amber-900 hover:bg-amber-200'
                                            : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100'
                                        }`}
                                      >
                                        {u.tier === 'pro'
                                          ? 'PRO · Turunkan Free'
                                          : 'FREE · Jadikan PRO'}
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => openUserFeaturesEditor(u)}
                                        className={`flex items-center gap-1 px-2.5 py-1.5 min-h-[34px] text-[11px] font-semibold rounded-lg border cursor-pointer ${
                                          isExpanded
                                            ? 'bg-slate-900 text-white border-slate-900'
                                            : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100'
                                        }`}
                                      >
                                        <Sliders className="w-3 h-3" />
                                        <span>Atur Fitur</span>
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {/* Per-User Specific Feature Access Drawer */}
                                {isExpanded && u.role !== 'admin' && (
                                  <div className="border-t border-slate-200 bg-white p-3.5 space-y-3 text-xs">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div>
                                        <div className="font-bold text-slate-900">
                                          Akses Fitur Khusus: {u.email}
                                        </div>
                                        <div className="text-[11px] text-slate-500">
                                          Pilih <strong>Default</strong> (ikuti paket {u.tier.toUpperCase()}), <strong>Izinkan</strong> (buka fitur ini meski Free), atau <strong>Blokir</strong>.
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => setUserFeatureDraft({})}
                                          className="px-2.5 py-1.5 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg cursor-pointer"
                                        >
                                          Reset Default
                                        </button>
                                        <button
                                          type="button"
                                          disabled={savingUserFeaturesId === u.id}
                                          onClick={() => void handleSaveUserFeatureOverrides(u)}
                                          className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg cursor-pointer disabled:opacity-60"
                                        >
                                          {savingUserFeaturesId === u.id ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                          ) : (
                                            <Save className="w-3.5 h-3.5" />
                                          )}
                                          <span>Simpan Akses User</span>
                                        </button>
                                      </div>
                                    </div>

                                    <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                                      {FEATURE_REGISTRY.map((feat) => {
                                        const currentChoice =
                                          userFeatureDraft[feat.id] || 'default';
                                        const ruleTier =
                                          premiumDraft.rules[feat.id]?.tier || feat.defaultTier;
                                        return (
                                          <div
                                            key={feat.id}
                                            className={`p-2 rounded-lg border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 ${
                                              feat.id === 'free_ads'
                                                ? 'bg-amber-50/70 border-amber-200'
                                                : 'bg-slate-50/70 border-slate-200'
                                            }`}
                                          >
                                            <div className="min-w-0">
                                              <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="font-semibold text-[11px] text-slate-900">
                                                  {feat.name}
                                                </span>
                                                <span
                                                  className={`px-1 py-0.5 text-[9px] font-bold rounded ${
                                                    ruleTier === 'pro'
                                                      ? 'bg-amber-100 text-amber-900'
                                                      : 'bg-emerald-100 text-emerald-800'
                                                  }`}
                                                >
                                                  {ruleTier.toUpperCase()}
                                                </span>
                                              </div>
                                            </div>

                                            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shrink-0">
                                              {(
                                                [
                                                  ['default', 'Default'],
                                                  ['allow', 'Izinkan'],
                                                  ['deny', 'Blokir'],
                                                ] as const
                                              ).map(([val, lbl]) => (
                                                <button
                                                  key={val}
                                                  type="button"
                                                  onClick={() =>
                                                    setUserFeatureOverrideChoice(feat.id, val)
                                                  }
                                                  className={`px-2 py-1 text-[10px] font-semibold rounded-md cursor-pointer ${
                                                    currentChoice === val
                                                      ? val === 'allow'
                                                        ? 'bg-emerald-600 text-white'
                                                        : val === 'deny'
                                                          ? 'bg-rose-600 text-white'
                                                          : 'bg-slate-900 text-white'
                                                      : 'text-slate-600 hover:bg-slate-100'
                                                  }`}
                                                >
                                                  {lbl}
                                                </button>
                                              ))}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </section>

                  <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-blue-600" />
                      <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                        Tautan Langsung Panel Admin
                      </h3>
                    </div>
                    {[`${adminUrlOrigin}/?admin`, `${adminUrlOrigin}/admin`].map((link) => (
                      <div
                        key={link}
                        className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200"
                      >
                        <code className="text-[11px] font-mono text-slate-800 truncate">{link}</code>
                        <button
                          type="button"
                          onClick={() => handleCopy(link, link, 'Tautan Admin')}
                          className="px-2.5 py-1 text-[11px] font-medium bg-white border border-slate-200 rounded cursor-pointer shrink-0"
                        >
                          {copiedKey === link ? 'Tersalin' : 'Salin'}
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 pt-1">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Login sesi aktif: {user?.email}</span>
                    </div>
                  </section>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};
