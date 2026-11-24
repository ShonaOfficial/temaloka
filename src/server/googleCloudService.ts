import type {
  GoogleCloudAdminConfigView,
  GoogleCloudPublicStatus,
  GoogleCloudUpdatePayload,
} from '../types/admin';
import {
  dbGet,
  dbRun,
  decryptSecretPayload,
  encryptSecretPayload,
  maskSecret,
} from './d1Database';

export interface StoredGoogleCloudSecrets {
  enabled: boolean;
  projectId: string;
  projectNumber: string;
  region: string;
  oauthEnabled: boolean;
  oauthClientId: string;
  oauthRedirectUri: string;
  geminiApiKey: string;
  searchConsoleApiKey: string;
  serviceAccountEmail: string;
  serviceAccountPrivateKey: string;
  serviceAccountProjectId: string;
  lastTestedAtMs: number;
  lastTestOk: boolean | null;
  lastTestMessage: string;
  updatedAtMs: number;
}

const SECRET_KEY = 'google_cloud_console';

let cachedAdminGeminiKey = '';
let cachedGcloudEnabled = false;

function defaultGoogleCloudSecrets(): StoredGoogleCloudSecrets {
  return {
    enabled: Boolean(
      process.env.GOOGLE_CLOUD_PROJECT ||
        process.env.GCP_PROJECT_ID ||
        process.env.GOOGLE_OAUTH_CLIENT_ID
    ),
    projectId: (
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCP_PROJECT_ID ||
      ''
    ).trim(),
    projectNumber: (process.env.GOOGLE_CLOUD_PROJECT_NUMBER || '').trim(),
    region: (process.env.GOOGLE_CLOUD_REGION || 'asia-northeast1').trim(),
    oauthEnabled: Boolean((process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim()),
    oauthClientId: (process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim(),
    oauthRedirectUri: (process.env.APP_URL || '').trim(),
    geminiApiKey: '',
    searchConsoleApiKey: '',
    serviceAccountEmail: '',
    serviceAccountPrivateKey: '',
    serviceAccountProjectId: '',
    lastTestedAtMs: 0,
    lastTestOk: null,
    lastTestMessage: '',
    updatedAtMs: 0,
  };
}

function syncGeminiCache(cfg: StoredGoogleCloudSecrets): void {
  cachedGcloudEnabled = cfg.enabled;
  cachedAdminGeminiKey = cfg.enabled ? cfg.geminiApiKey.trim() : '';
}

export function getEffectiveGeminiApiKey(): string {
  if (cachedGcloudEnabled && cachedAdminGeminiKey) {
    return cachedAdminGeminiKey;
  }
  return (process.env.GEMINI_API_KEY || '').trim();
}

export async function warmGoogleCloudConfigCache(): Promise<StoredGoogleCloudSecrets> {
  const cfg = await loadGoogleCloudConfig();
  syncGeminiCache(cfg);
  return cfg;
}

export async function loadGoogleCloudConfig(): Promise<StoredGoogleCloudSecrets> {
  const base = defaultGoogleCloudSecrets();
  try {
    const row = await dbGet<{ encrypted_json: string }>(
      'SELECT encrypted_json FROM server_secrets WHERE key = ?',
      [SECRET_KEY]
    );
    if (!row?.encrypted_json) {
      syncGeminiCache(base);
      return base;
    }
    const dec = decryptSecretPayload<Partial<StoredGoogleCloudSecrets>>(row.encrypted_json);
    if (!dec) {
      syncGeminiCache(base);
      return base;
    }
    const merged: StoredGoogleCloudSecrets = {
      ...base,
      enabled: typeof dec.enabled === 'boolean' ? dec.enabled : base.enabled,
      projectId: typeof dec.projectId === 'string' ? dec.projectId : base.projectId,
      projectNumber: typeof dec.projectNumber === 'string' ? dec.projectNumber : base.projectNumber,
      region: typeof dec.region === 'string' && dec.region.trim() ? dec.region : base.region,
      oauthEnabled: typeof dec.oauthEnabled === 'boolean' ? dec.oauthEnabled : base.oauthEnabled,
      oauthClientId: typeof dec.oauthClientId === 'string' ? dec.oauthClientId : base.oauthClientId,
      oauthRedirectUri:
        typeof dec.oauthRedirectUri === 'string' ? dec.oauthRedirectUri : base.oauthRedirectUri,
      geminiApiKey: typeof dec.geminiApiKey === 'string' ? dec.geminiApiKey : '',
      searchConsoleApiKey:
        typeof dec.searchConsoleApiKey === 'string' ? dec.searchConsoleApiKey : '',
      serviceAccountEmail:
        typeof dec.serviceAccountEmail === 'string' ? dec.serviceAccountEmail : '',
      serviceAccountPrivateKey:
        typeof dec.serviceAccountPrivateKey === 'string' ? dec.serviceAccountPrivateKey : '',
      serviceAccountProjectId:
        typeof dec.serviceAccountProjectId === 'string' ? dec.serviceAccountProjectId : '',
      lastTestedAtMs: typeof dec.lastTestedAtMs === 'number' ? dec.lastTestedAtMs : 0,
      lastTestOk: typeof dec.lastTestOk === 'boolean' ? dec.lastTestOk : null,
      lastTestMessage: typeof dec.lastTestMessage === 'string' ? dec.lastTestMessage : '',
      updatedAtMs: typeof dec.updatedAtMs === 'number' ? dec.updatedAtMs : 0,
    };
    syncGeminiCache(merged);
    return merged;
  } catch {
    syncGeminiCache(base);
    return base;
  }
}

async function persistGoogleCloudSecrets(next: StoredGoogleCloudSecrets): Promise<void> {
  await dbRun(
    `INSERT INTO server_secrets (key, encrypted_json, updated_at_ms)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET encrypted_json=excluded.encrypted_json, updated_at_ms=excluded.updated_at_ms`,
    [SECRET_KEY, encryptSecretPayload(next), next.updatedAtMs || Date.now()]
  );
  syncGeminiCache(next);
}

export async function saveGoogleCloudConfig(
  patch: GoogleCloudUpdatePayload
): Promise<GoogleCloudAdminConfigView> {
  const cur = await loadGoogleCloudConfig();

  const projectId = String(patch.projectId || '').trim().slice(0, 64);
  if (projectId && !/^[a-z][a-z0-9-]{2,63}$/.test(projectId)) {
    throw new Error(
      'Project ID Google Cloud tidak valid (gunakan huruf kecil, angka, dan tanda hubung).'
    );
  }

  const projectNumber = String(patch.projectNumber || '').trim().slice(0, 32);
  if (projectNumber && !/^\d{4,32}$/.test(projectNumber)) {
    throw new Error('Project Number Google Cloud harus berupa angka.');
  }

  const region = String(patch.region || cur.region || 'asia-northeast1')
    .trim()
    .slice(0, 40);
  if (region && !/^[a-z0-9-]{2,40}$/.test(region)) {
    throw new Error('Format Region Google Cloud tidak valid.');
  }

  const oauthClientId = String(patch.oauthClientId || '').trim().slice(0, 220);
  const oauthRedirectUri = String(patch.oauthRedirectUri || '').trim().slice(0, 300);
  if (oauthRedirectUri) {
    let parsed: URL;
    try {
      parsed = new URL(oauthRedirectUri);
    } catch {
      throw new Error('Authorized Redirect / Origin URI tidak valid.');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Authorized Redirect URI harus memakai HTTP atau HTTPS.');
    }
    if (parsed.hostname === '169.254.169.254') {
      throw new Error('Hostname internal tidak diizinkan.');
    }
  }

  let serviceAccountEmail = cur.serviceAccountEmail;
  let serviceAccountPrivateKey = cur.serviceAccountPrivateKey;
  let serviceAccountProjectId = cur.serviceAccountProjectId;

  if (patch.clearIndexingServiceAccount) {
    serviceAccountEmail = '';
    serviceAccountPrivateKey = '';
    serviceAccountProjectId = '';
  } else if (
    typeof patch.indexingServiceAccountJson === 'string' &&
    patch.indexingServiceAccountJson.trim()
  ) {
    let parsedSa: Record<string, unknown>;
    try {
      parsedSa = JSON.parse(patch.indexingServiceAccountJson.trim()) as Record<string, unknown>;
    } catch {
      throw new Error('Format JSON Service Account tidak valid.');
    }
    if (parsedSa.type !== 'service_account') {
      throw new Error('JSON harus bertipe "service_account" dari Google Cloud Console.');
    }
    const clientEmail = typeof parsedSa.client_email === 'string' ? parsedSa.client_email.trim() : '';
    const privateKey = typeof parsedSa.private_key === 'string' ? parsedSa.private_key.trim() : '';
    const saProjectId =
      typeof parsedSa.project_id === 'string' ? parsedSa.project_id.trim().slice(0, 64) : '';
    if (!clientEmail || !clientEmail.includes('@') || !privateKey.includes('BEGIN PRIVATE KEY')) {
      throw new Error(
        'JSON Service Account harus memiliki field "client_email" dan "private_key" yang valid.'
      );
    }
    serviceAccountEmail = clientEmail.slice(0, 180);
    serviceAccountPrivateKey = privateKey;
    serviceAccountProjectId = saProjectId;
  }

  const nextGeminiKey = patch.clearGeminiApiKey
    ? ''
    : typeof patch.geminiApiKey === 'string' && patch.geminiApiKey.trim()
      ? patch.geminiApiKey.trim()
      : cur.geminiApiKey;

  const nextSearchConsoleKey = patch.clearSearchConsoleApiKey
    ? ''
    : typeof patch.searchConsoleApiKey === 'string' && patch.searchConsoleApiKey.trim()
      ? patch.searchConsoleApiKey.trim()
      : cur.searchConsoleApiKey;

  const next: StoredGoogleCloudSecrets = {
    enabled: Boolean(patch.enabled),
    projectId: projectId || serviceAccountProjectId || '',
    projectNumber,
    region: region || 'asia-northeast1',
    oauthEnabled: Boolean(patch.oauthEnabled),
    oauthClientId,
    oauthRedirectUri,
    geminiApiKey: nextGeminiKey,
    searchConsoleApiKey: nextSearchConsoleKey,
    serviceAccountEmail,
    serviceAccountPrivateKey,
    serviceAccountProjectId,
    lastTestedAtMs: cur.lastTestedAtMs,
    lastTestOk: cur.lastTestOk,
    lastTestMessage: cur.lastTestMessage,
    updatedAtMs: Date.now(),
  };

  await persistGoogleCloudSecrets(next);
  return toGoogleCloudAdminView(next);
}

export function toGoogleCloudAdminView(c: StoredGoogleCloudSecrets): GoogleCloudAdminConfigView {
  const envGemini = (process.env.GEMINI_API_KEY || '').trim();
  const effectiveGemini = c.geminiApiKey.trim() || envGemini;

  return {
    enabled: c.enabled,
    projectId: c.projectId,
    projectNumber: c.projectNumber,
    region: c.region,
    oauthEnabled: c.oauthEnabled,
    oauthClientId: c.oauthClientId,
    oauthRedirectUri: c.oauthRedirectUri,
    hasGeminiApiKey: Boolean(c.geminiApiKey.trim()),
    geminiApiKeyMasked: maskSecret(effectiveGemini),
    hasEnvGeminiApiKey: Boolean(envGemini),
    hasSearchConsoleApiKey: Boolean(c.searchConsoleApiKey.trim()),
    searchConsoleApiKeyMasked: maskSecret(c.searchConsoleApiKey),
    hasIndexingServiceAccount: Boolean(c.serviceAccountEmail && c.serviceAccountPrivateKey),
    serviceAccountEmail: c.serviceAccountEmail,
    lastTestedAtMs: c.lastTestedAtMs,
    lastTestOk: c.lastTestOk,
    lastTestMessage: c.lastTestMessage,
    updatedAtMs: c.updatedAtMs,
  };
}

export function getGoogleCloudPublicStatus(
  c: StoredGoogleCloudSecrets
): GoogleCloudPublicStatus {
  const envGemini = (process.env.GEMINI_API_KEY || '').trim();
  return {
    enabled: c.enabled,
    projectId: c.projectId,
    oauthEnabled: c.enabled && c.oauthEnabled && Boolean(c.oauthClientId),
    oauthClientId: c.enabled && c.oauthEnabled ? c.oauthClientId : '',
    hasGeminiApiKey: Boolean((c.enabled && c.geminiApiKey.trim()) || envGemini),
    hasIndexingServiceAccount: Boolean(
      c.enabled && c.serviceAccountEmail && c.serviceAccountPrivateKey
    ),
    serviceAccountEmail: c.enabled ? c.serviceAccountEmail : '',
  };
}

export async function testGoogleCloudConnection(): Promise<{
  ok: boolean;
  message: string;
  details: {
    projectConfigured: boolean;
    geminiKeyStatus: string;
    oauthStatus: string;
    serviceAccountStatus: string;
  };
  config: GoogleCloudAdminConfigView;
}> {
  const cur = await loadGoogleCloudConfig();
  const effectiveKey = cur.geminiApiKey.trim() || (process.env.GEMINI_API_KEY || '').trim();

  let geminiOk = false;
  let geminiKeyStatus = 'Belum ada GEMINI_API_KEY (Admin maupun Env Secrets).';

  if (effectiveKey) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
        method: 'GET',
        headers: {
          'x-goog-api-key': effectiveKey,
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const json = (await res.json()) as { models?: Array<{ name?: string }> };
        const count = Array.isArray(json.models) ? json.models.length : 0;
        geminiOk = true;
        geminiKeyStatus = `Terhubung ke Google Generative Language API (${count} model tersedia).`;
      } else {
        geminiKeyStatus = `Google API menolak kunci (HTTP ${res.status}). Periksa kembali pembatasan/API key di Google Cloud Console.`;
      }
    } catch (err) {
      geminiKeyStatus =
        err instanceof Error
          ? `Gagal menjangkau Google API: ${err.message}`
          : 'Gagal menjangkau Google API.';
    }
  }

  const oauthValid =
    !cur.oauthEnabled || /\.apps\.googleusercontent\.com$/i.test(cur.oauthClientId.trim());
  const oauthStatus = !cur.oauthEnabled
    ? 'OAuth Client ID dinonaktifkan.'
    : oauthValid
      ? `OAuth Client ID valid (${cur.oauthClientId.slice(0, 18)}...).`
      : 'Format OAuth Client ID tidak berakhiran .apps.googleusercontent.com.';

  const saValid = Boolean(cur.serviceAccountEmail && cur.serviceAccountPrivateKey);
  const serviceAccountStatus = saValid
    ? `Service Account siap (${cur.serviceAccountEmail}).`
    : 'Service Account JSON belum diunggah (opsional, untuk Indexing API).';

  const projectConfigured = Boolean(cur.projectId.trim());
  const overallOk =
    Boolean(effectiveKey ? geminiOk : projectConfigured || saValid) && oauthValid;

  const summaryParts = [geminiKeyStatus];
  if (cur.oauthEnabled) summaryParts.push(oauthStatus);
  if (saValid) summaryParts.push(serviceAccountStatus);
  const message = summaryParts.join(' | ');

  const updated: StoredGoogleCloudSecrets = {
    ...cur,
    lastTestedAtMs: Date.now(),
    lastTestOk: overallOk,
    lastTestMessage: message,
  };
  await persistGoogleCloudSecrets(updated);

  return {
    ok: overallOk,
    message,
    details: {
      projectConfigured,
      geminiKeyStatus,
      oauthStatus,
      serviceAccountStatus,
    },
    config: toGoogleCloudAdminView(updated),
  };
}
