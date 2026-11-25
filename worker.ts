import crypto from 'node:crypto';
import { FREELLM_MODELS } from './src/lib/aiEngineCatalog.ts';
import { checkDomainAvailabilityWeb } from './src/lib/domainLookupCore.ts';
import {
  DEFAULT_PREMIUM_CONFIG,
  normalizePremiumConfig,
  sanitizeFeatureOverrides,
  sanitizeProPlanId,
  type FeatureOverrideValue,
  type PremiumSettingsConfig,
} from './src/lib/featureRegistry.ts';
import {
  DEFAULT_DOMAIN_AFFILIATE_CONFIG,
  DEFAULT_PAYMENT_SETTINGS,
  DEFAULT_SITE_SEO_CONFIG,
  normalizeDomainAffiliateConfig,
  normalizePaymentSettings,
  type AdminAuthStatus,
  type AuthUserSession,
  type CloudflareD1AdminConfigView,
  type DomainAffiliateConfig,
  type ManagedUserRow,
  type PaymentSettingsConfig,
  type PublicSiteConfigResponse,
  type SiteSeoConfig,
  type UserAccountTier,
} from './src/types/admin.ts';
import {
  ADMIN_BOOTSTRAP_EMAIL,
  ADSENSE_FIELD_LIMITS,
  buildAdsTxtLine,
  DEFAULT_SITE_ADSENSE_CONFIG,
  sanitizePublisherId,
  sanitizeSlotDigits,
  type AdsenseUnitFormatType,
  type AdsenseUnitPlacementType,
  type AdsenseUnitRecord,
  type SiteAdsenseConfig,
} from './src/types/adsense.ts';

type SqlParam = string | number | null;

interface D1PreparedStatementLike {
  bind(...values: SqlParam[]): D1PreparedStatementLike;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<unknown>;
}

interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
}

interface CloudflareAssetFetcher {
  fetch(request: Request): Promise<Response>;
}

interface WorkerEnv {
  ASSETS: CloudflareAssetFetcher;
  DB?: D1DatabaseLike;
  ADMIN_EMAIL?: string;
  ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
  ADMIN_TOKEN_SECRET?: string;
  ENCRYPTION_KEY?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_D1_DATABASE_ID?: string;
  CLOUDFLARE_D1_DATABASE_NAME?: string;
  CLOUDFLARE_D1_BINDING?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_D1_WORKER_URL?: string;
  GEMINI_API_KEY?: string;
  FREELLMAPI_BASE_URL?: string;
  FREELLMAPI_API_KEY?: string;
  FREELLMAPI_MODEL?: string;
  GROQ_API_KEY?: string;
  CEREBRAS_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  MISTRAL_API_KEY?: string;
  NVIDIA_API_KEY?: string;
  CLOUDFLARE_AI_TOKEN?: string;
}

interface SignedTokenClaims {
  sub: string;
  email: string;
  role: 'user' | 'admin';
  iat: number;
  exp: number;
}

const D1_SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS admin_accounts (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    updated_at_ms INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS app_users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    tier TEXT NOT NULL DEFAULT 'free',
    preferred_mode TEXT NOT NULL DEFAULT 'local',
    preferred_gemini_model TEXT NOT NULL DEFAULT 'gemini-3.1-flash-lite',
    preferred_freellm_model TEXT NOT NULL DEFAULT 'auto',
    pro_plan_id TEXT NOT NULL DEFAULT '',
    feature_overrides_json TEXT NOT NULL DEFAULT '{}',
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    updated_by_email TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS server_secrets (
    key TEXT PRIMARY KEY,
    encrypted_json TEXT NOT NULL,
    updated_at_ms INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS adsense_units (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slot_id TEXT NOT NULL,
    format TEXT NOT NULL,
    placement TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    only_on_posts INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    created_by_uid TEXT NOT NULL DEFAULT '',
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS user_notes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    tag TEXT NOT NULL DEFAULT 'umum',
    pinned INTEGER NOT NULL DEFAULT 0,
    template_hint TEXT NOT NULL DEFAULT '',
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS user_chat_messages (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    engine_label TEXT NOT NULL,
    model_id TEXT NOT NULL,
    suggested_css TEXT NOT NULL DEFAULT '',
    page_context TEXT NOT NULL DEFAULT 'preview',
    created_at_ms INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS user_quotas (
    bucket_key TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    date_key TEXT NOT NULL,
    used_count INTEGER NOT NULL DEFAULT 0,
    daily_limit INTEGER NOT NULL DEFAULT 25,
    last_model TEXT NOT NULL DEFAULT '',
    updated_at_ms INTEGER NOT NULL
  )`,
];

let schemaInitialized = false;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function textResponse(body: string, contentType: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': contentType,
    },
  });
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const raw = await request.text();
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function getMasterKey(env: WorkerEnv): Buffer {
  const raw =
    (env.SESSION_SECRET || '').trim() ||
    (env.ADMIN_TOKEN_SECRET || '').trim() ||
    (env.ENCRYPTION_KEY || '').trim() ||
    (env.ADMIN_PASSWORD || '').trim() ||
    (env.CLOUDFLARE_API_TOKEN || '').trim() ||
    (env.CLOUDFLARE_D1_DATABASE_ID || '').trim() ||
    'temaloka-cf-worker-session-key';
  return crypto.createHash('sha256').update(raw).digest();
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hexKey] = parts;
  if (!salt || !hexKey) return false;
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(hexKey, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function signSessionToken(
  env: WorkerEnv,
  claims: { sub: string; email: string; role: 'user' | 'admin'; ttlSeconds?: number }
): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const fullClaims: SignedTokenClaims = {
    sub: claims.sub,
    email: claims.email,
    role: claims.role,
    iat: nowSec,
    exp: nowSec + (claims.ttlSeconds ?? 60 * 60 * 24 * 7),
  };
  const payloadB64 = Buffer.from(JSON.stringify(fullClaims), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getMasterKey(env))
    .update(payloadB64)
    .digest('base64url');
  return `tlk.${payloadB64}.${sig}`;
}

function verifySessionToken(env: WorkerEnv, token: string): SignedTokenClaims | null {
  try {
    const parts = token.trim().split('.');
    if (parts.length !== 3 || parts[0] !== 'tlk') return null;
    const [, payloadB64, sig] = parts;
    const expectedSig = crypto
      .createHmac('sha256', getMasterKey(env))
      .update(payloadB64)
      .digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const claims = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8')
    ) as SignedTokenClaims;
    if (!claims?.sub || !claims?.email || !claims?.exp) return null;
    if (Math.floor(Date.now() / 1000) > claims.exp) return null;
    return claims;
  } catch {
    return null;
  }
}

function hasD1Connection(env: WorkerEnv): boolean {
  if (env.DB) return true;
  if ((env.CLOUDFLARE_D1_WORKER_URL || '').trim()) return true;
  return Boolean(
    (env.CLOUDFLARE_ACCOUNT_ID || '').trim() &&
      (env.CLOUDFLARE_D1_DATABASE_ID || '').trim() &&
      (env.CLOUDFLARE_API_TOKEN || '').trim()
  );
}

function missingD1Error(): Error {
  return new Error(
    'Database Cloudflare D1 belum terhubung ke Worker. Buka Dashboard Cloudflare Workers → temaloka → Settings → Bindings → tambahkan D1 Database bernama DB (atau isi CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_API_TOKEN di Variables & Secrets).'
  );
}

async function rawExecuteD1<T = Record<string, unknown>>(
  env: WorkerEnv,
  sql: string,
  params: SqlParam[] = []
): Promise<T[]> {
  if (env.DB) {
    const stmt = env.DB.prepare(sql);
    const bound = params.length > 0 ? stmt.bind(...params) : stmt;
    const res = await bound.all<T>();
    return Array.isArray(res?.results) ? res.results : [];
  }

  const workerUrl = (env.CLOUDFLARE_D1_WORKER_URL || '').trim();
  const apiToken = (env.CLOUDFLARE_API_TOKEN || '').trim();
  if (workerUrl) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiToken) headers.Authorization = `Bearer ${apiToken}`;
    const resp = await fetch(workerUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ sql, params }),
      signal: AbortSignal.timeout(12000),
    });
    const data = (await resp.json()) as {
      success?: boolean;
      error?: string;
      results?: T[];
      result?: Array<{ results?: T[] }>;
    };
    if (!resp.ok || data.success === false) {
      throw new Error(data.error || `D1 Worker HTTP ${resp.status}`);
    }
    if (Array.isArray(data.results)) return data.results;
    if (Array.isArray(data.result) && data.result[0]?.results) return data.result[0].results;
    return [];
  }

  const acc = (env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const dbId = (env.CLOUDFLARE_D1_DATABASE_ID || '').trim();
  if (!acc || !dbId || !apiToken) {
    throw missingD1Error();
  }
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(acc)}/d1/database/${encodeURIComponent(dbId)}/query`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify({ sql, params }),
    signal: AbortSignal.timeout(12000),
  });
  const payload = (await resp.json()) as {
    success?: boolean;
    errors?: Array<{ message?: string }>;
    result?: Array<{ results?: T[] }>;
  };
  if (!resp.ok || payload.success === false) {
    const msg = payload.errors?.map((e) => e.message).filter(Boolean).join('; ');
    throw new Error(msg || `Cloudflare D1 HTTP ${resp.status}`);
  }
  return Array.isArray(payload.result?.[0]?.results) ? payload.result[0].results : [];
}

async function ensureWorkerD1Schema(env: WorkerEnv): Promise<void> {
  if (schemaInitialized || !hasD1Connection(env)) return;
  for (const stmt of D1_SCHEMA_STATEMENTS) {
    await rawExecuteD1(env, stmt, []);
  }
  for (const alterSql of [
    `ALTER TABLE app_users ADD COLUMN feature_overrides_json TEXT NOT NULL DEFAULT '{}'`,
    `ALTER TABLE app_users ADD COLUMN pro_plan_id TEXT NOT NULL DEFAULT ''`,
  ]) {
    try {
      await rawExecuteD1(env, alterSql, []);
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : '';
      if (!msg.includes('duplicate column')) {
        // ignore benign already-exists cases
      }
    }
  }
  schemaInitialized = true;
}

async function d1All<T = Record<string, unknown>>(
  env: WorkerEnv,
  sql: string,
  params: SqlParam[] = []
): Promise<T[]> {
  await ensureWorkerD1Schema(env);
  return rawExecuteD1<T>(env, sql, params);
}

async function d1Get<T = Record<string, unknown>>(
  env: WorkerEnv,
  sql: string,
  params: SqlParam[] = []
): Promise<T | null> {
  const rows = await d1All<T>(env, sql, params);
  return rows[0] ?? null;
}

async function d1Run(env: WorkerEnv, sql: string, params: SqlParam[] = []): Promise<void> {
  await ensureWorkerD1Schema(env);
  await rawExecuteD1(env, sql, params);
}

function parseFeatureOverridesJson(raw: unknown): Record<string, FeatureOverrideValue> {
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    return sanitizeFeatureOverrides(JSON.parse(raw));
  } catch {
    return {};
  }
}

async function getAdminRecord(env: WorkerEnv) {
  if (!hasD1Connection(env)) return null;
  const row = await d1Get<{
    id: string;
    email: string;
    display_name: string;
    password_hash: string;
    updated_at_ms: number;
  }>(env, 'SELECT id, email, display_name, password_hash, updated_at_ms FROM admin_accounts WHERE id = ?', [
    'primary',
  ]);
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    updatedAtMs: row.updated_at_ms,
  };
}

async function getAdminAuthStatus(env: WorkerEnv): Promise<AdminAuthStatus> {
  const envEmail = (env.ADMIN_EMAIL || ADMIN_BOOTSTRAP_EMAIL).trim().toLowerCase();
  const envPassword = (env.ADMIN_PASSWORD || '').trim();
  const dbAdmin = hasD1Connection(env) ? await getAdminRecord(env).catch(() => null) : null;
  return {
    configured: Boolean(dbAdmin || envPassword),
    claimedInDb: Boolean(dbAdmin),
    hasEnvPassword: Boolean(envPassword),
    adminEmail: dbAdmin?.email || envEmail,
    adminDisplayName: dbAdmin?.displayName || 'Admin TemaLoka',
    dbMode: hasD1Connection(env) ? 'cloudflare-d1' : 'local-sqlite',
  };
}

async function authenticateAdminLogin(
  env: WorkerEnv,
  emailInput: string,
  passwordInput: string
): Promise<AuthUserSession> {
  const email = emailInput.trim().toLowerCase();
  const dbAdmin = hasD1Connection(env) ? await getAdminRecord(env) : null;

  if (dbAdmin) {
    if (email !== dbAdmin.email.toLowerCase() || !verifyPassword(passwordInput, dbAdmin.passwordHash)) {
      throw new Error('Email atau password Admin salah.');
    }
    return {
      id: 'admin-primary',
      email: dbAdmin.email,
      displayName: dbAdmin.displayName,
      role: 'admin',
      tier: 'admin',
      preferredMode: 'freellm',
      preferredGeminiModel: 'gemini-3.1-flash-lite',
      preferredFreeLlmModel: 'auto',
    };
  }

  const envEmail = (env.ADMIN_EMAIL || ADMIN_BOOTSTRAP_EMAIL).trim().toLowerCase();
  const envPass = (env.ADMIN_PASSWORD || '').trim();
  if (!envPass) {
    if (!hasD1Connection(env)) {
      throw missingD1Error();
    }
    throw new Error('Akun Admin belum diatur. Buka /?admin untuk membuat password Admin pertama kali.');
  }
  const a = Buffer.from(passwordInput, 'utf8');
  const b = Buffer.from(envPass, 'utf8');
  const match = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (email !== envEmail || !match) {
    throw new Error('Email atau password Admin salah.');
  }
  return {
    id: 'admin-primary',
    email: envEmail,
    displayName: 'Admin TemaLoka',
    role: 'admin',
    tier: 'admin',
    preferredMode: 'freellm',
    preferredGeminiModel: 'gemini-3.1-flash-lite',
    preferredFreeLlmModel: 'auto',
  };
}

async function resolveOptionalUser(request: Request, env: WorkerEnv): Promise<AuthUserSession | null> {
  const auth = request.headers.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
  if (!match?.[1]) return null;
  const claims = verifySessionToken(env, match[1]);
  if (!claims) return null;

  if (claims.role === 'admin' && claims.sub === 'admin-primary') {
    const status = await getAdminAuthStatus(env);
    return {
      id: 'admin-primary',
      email: status.adminEmail,
      displayName: status.adminDisplayName,
      role: 'admin',
      tier: 'admin',
      preferredMode: 'freellm',
      preferredGeminiModel: 'gemini-3.1-flash-lite',
      preferredFreeLlmModel: 'auto',
      proPlanId: null,
      featureOverrides: {},
    };
  }
  if (!hasD1Connection(env)) return null;
  const row = await d1Get<{
    id: string;
    email: string;
    display_name: string;
    role: string;
    tier: string;
    preferred_mode: string;
    preferred_gemini_model: string;
    preferred_freellm_model: string;
    pro_plan_id?: string;
    feature_overrides_json?: string;
  }>(env, 'SELECT * FROM app_users WHERE id = ?', [claims.sub]);
  if (!row) return null;
  const tier: UserAccountTier =
    row.tier === 'pro' || row.tier === 'admin' ? row.tier : 'free';
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role === 'admin' ? 'admin' : 'user',
    tier,
    preferredMode:
      row.preferred_mode === 'gemini' || row.preferred_mode === 'freellm'
        ? row.preferred_mode
        : 'local',
    preferredGeminiModel: row.preferred_gemini_model || 'gemini-3.1-flash-lite',
    preferredFreeLlmModel: row.preferred_freellm_model || 'auto',
    proPlanId: tier === 'pro' && row.pro_plan_id ? row.pro_plan_id : null,
    featureOverrides: parseFeatureOverridesJson(row.feature_overrides_json),
  };
}

async function getAppConfigJson<T>(env: WorkerEnv, key: string, fallback: T): Promise<T> {
  if (!hasD1Connection(env)) return fallback;
  try {
    const row = await d1Get<{ value_json: string }>(
      env,
      'SELECT value_json FROM app_config WHERE key = ?',
      [key]
    );
    if (!row?.value_json) return fallback;
    return JSON.parse(row.value_json) as T;
  } catch {
    return fallback;
  }
}

async function setAppConfigJson(
  env: WorkerEnv,
  key: string,
  value: unknown,
  updatedByEmail: string
): Promise<void> {
  await d1Run(
    env,
    `INSERT INTO app_config (key, value_json, updated_at_ms, updated_by_email)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value_json=excluded.value_json,
       updated_at_ms=excluded.updated_at_ms,
       updated_by_email=excluded.updated_by_email`,
    [key, JSON.stringify(value), Date.now(), updatedByEmail]
  );
}

async function listAdsenseUnits(env: WorkerEnv, onlyEnabled: boolean): Promise<AdsenseUnitRecord[]> {
  if (!hasD1Connection(env)) return [];
  try {
    const sql = onlyEnabled
      ? 'SELECT * FROM adsense_units WHERE enabled = 1 ORDER BY updated_at_ms DESC, name ASC'
      : 'SELECT * FROM adsense_units ORDER BY updated_at_ms DESC, name ASC';
    const rows = await d1All<{
      id: string;
      name: string;
      slot_id: string;
      format: string;
      placement: string;
      enabled: number;
      only_on_posts: number;
      notes: string;
      created_by_uid: string;
      created_at_ms: number;
      updated_at_ms: number;
    }>(env, sql);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slotId: r.slot_id,
      format: r.format as AdsenseUnitRecord['format'],
      placement: r.placement as AdsenseUnitRecord['placement'],
      enabled: Boolean(r.enabled),
      onlyOnPosts: Boolean(r.only_on_posts),
      notes: r.notes || '',
      createdByUid: r.created_by_uid || '',
      createdAtMs: r.created_at_ms,
      updatedAtMs: r.updated_at_ms,
    }));
  } catch {
    return [];
  }
}

function getConfiguredFreeLlmProviders(env: WorkerEnv): string[] {
  const list: string[] = [];
  if ((env.FREELLMAPI_BASE_URL || '').trim()) list.push('freellmapi-gateway');
  if ((env.GROQ_API_KEY || '').trim()) list.push('groq');
  if ((env.CEREBRAS_API_KEY || '').trim()) list.push('cerebras');
  if ((env.OPENROUTER_API_KEY || '').trim()) list.push('openrouter');
  if ((env.MISTRAL_API_KEY || '').trim()) list.push('mistral');
  if ((env.NVIDIA_API_KEY || '').trim()) list.push('nvidia-nim');
  if ((env.CLOUDFLARE_AI_TOKEN || '').trim() && (env.CLOUDFLARE_ACCOUNT_ID || '').trim()) {
    list.push('cloudflare-ai');
  }
  if ((env.GEMINI_API_KEY || '').trim()) list.push('gemini-compat');
  return list;
}

async function callEdgeFreeLlmChat(
  env: WorkerEnv,
  systemInstruction: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  userPrompt: string
): Promise<{ text: string; provider: string; model: string }> {
  const candidates: Array<{ name: string; url: string; key: string; model: string }> = [];
  if ((env.FREELLMAPI_BASE_URL || '').trim()) {
    candidates.push({
      name: 'FreeLLMAPI',
      url: `${env.FREELLMAPI_BASE_URL!.trim().replace(/\/+$/, '')}/chat/completions`,
      key: (env.FREELLMAPI_API_KEY || '').trim(),
      model: (env.FREELLMAPI_MODEL || 'auto').trim(),
    });
  }
  if ((env.GROQ_API_KEY || '').trim()) {
    candidates.push({
      name: 'Groq',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      key: env.GROQ_API_KEY!.trim(),
      model: 'llama-3.3-70b-versatile',
    });
  }
  if ((env.CEREBRAS_API_KEY || '').trim()) {
    candidates.push({
      name: 'Cerebras',
      url: 'https://api.cerebras.ai/v1/chat/completions',
      key: env.CEREBRAS_API_KEY!.trim(),
      model: 'llama-3.3-70b',
    });
  }
  if ((env.OPENROUTER_API_KEY || '').trim()) {
    candidates.push({
      name: 'OpenRouter',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      key: env.OPENROUTER_API_KEY!.trim(),
      model: 'meta-llama/llama-3.3-70b-instruct:free',
    });
  }
  if ((env.MISTRAL_API_KEY || '').trim()) {
    candidates.push({
      name: 'Mistral',
      url: 'https://api.mistral.ai/v1/chat/completions',
      key: env.MISTRAL_API_KEY!.trim(),
      model: 'mistral-small-latest',
    });
  }
  if ((env.NVIDIA_API_KEY || '').trim()) {
    candidates.push({
      name: 'NVIDIA NIM',
      url: 'https://integrate.api.nvidia.com/v1/chat/completions',
      key: env.NVIDIA_API_KEY!.trim(),
      model: 'meta/llama-3.1-70b-instruct',
    });
  }

  for (const c of candidates) {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (c.key) headers.Authorization = `Bearer ${c.key}`;
      const resp = await fetch(c.url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: c.model,
          temperature: 0.4,
          max_tokens: 2048,
          messages: [
            { role: 'system', content: systemInstruction },
            ...history,
            { role: 'user', content: userPrompt },
          ],
        }),
        signal: AbortSignal.timeout(22000),
      });
      if (!resp.ok) continue;
      const data = (await resp.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (text) return { text, provider: c.name, model: c.model };
    } catch {
      // try next provider
    }
  }

  if ((env.GEMINI_API_KEY || '').trim()) {
    const geminiKey = env.GEMINI_API_KEY!.trim();
    const model = 'gemini-2.5-flash';
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [
            ...history.map((h) => ({
              role: h.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: h.content }],
            })),
            { role: 'user', parts: [{ text: userPrompt }] },
          ],
        }),
        signal: AbortSignal.timeout(22000),
      }
    );
    if (resp.ok) {
      const gData = (await resp.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = gData.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('').trim();
      if (text) return { text, provider: 'Gemini Cloud', model };
    }
  }

  throw new Error(
    'Belum ada API key provider AI (GEMINI_API_KEY / GROQ_API_KEY / OPENROUTER_API_KEY) di Variables & Secrets Cloudflare Workers. Anda tetap bisa memakai AI Lokal (WebLLM/Ollama) langsung di browser.'
  );
}

function isBlockedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '::1' ||
    lower === '0.0.0.0' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    return true;
  }
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(lower);
  if (m) {
    const [, a, b] = m.map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
  }
  return false;
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    try {
      // ==================== AUTH & ADMIN ACCOUNT ====================
      if (pathname === '/api/auth/me' && request.method === 'GET') {
        const user = await resolveOptionalUser(request, env);
        if (!user) return jsonResponse({ authenticated: false, user: null });
        return jsonResponse({ authenticated: true, user });
      }

      if (pathname === '/api/admin/auth/status' && request.method === 'GET') {
        const status = await getAdminAuthStatus(env);
        return jsonResponse(status);
      }

      if (pathname === '/api/auth/register' && request.method === 'POST') {
        if (!hasD1Connection(env)) return jsonResponse({ error: missingD1Error().message }, 503);
        const body = await readJsonBody(request);
        const email = String(body.email || '').trim().toLowerCase();
        const displayName = String(body.displayName || '').trim();
        const password = String(body.password || '');
        if (!email.includes('@') || email.length < 5) {
          return jsonResponse({ error: 'Masukkan alamat email yang valid.' }, 400);
        }
        if (password.length < 6) {
          return jsonResponse({ error: 'Password minimal 6 karakter.' }, 400);
        }
        const adminStatus = await getAdminAuthStatus(env);
        if (email === adminStatus.adminEmail.toLowerCase()) {
          return jsonResponse(
            { error: 'Email ini terdaftar sebagai Admin Utama. Gunakan tab Login Admin.' },
            400
          );
        }
        const existing = await d1Get<{ id: string }>(
          env,
          'SELECT id FROM app_users WHERE email = ?',
          [email]
        );
        if (existing) {
          return jsonResponse(
            { error: 'Email sudah terdaftar. Silakan masuk dengan password Anda.' },
            400
          );
        }
        const id = `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
        const finalName = (displayName || email.split('@')[0] || 'Pengguna').slice(0, 80);
        const passHash = hashPassword(password);
        const now = Date.now();
        await d1Run(
          env,
          `INSERT INTO app_users (id, email, display_name, password_hash, role, tier, preferred_mode, preferred_gemini_model, preferred_freellm_model, pro_plan_id, feature_overrides_json, created_at_ms, updated_at_ms)
           VALUES (?, ?, ?, ?, 'user', 'free', 'freellm', 'gemini-3.1-flash-lite', 'auto', '', '{}', ?, ?)`,
          [id, email, finalName, passHash, now, now]
        );
        const user: AuthUserSession = {
          id,
          email,
          displayName: finalName,
          role: 'user',
          tier: 'free',
          preferredMode: 'freellm',
          preferredGeminiModel: 'gemini-3.1-flash-lite',
          preferredFreeLlmModel: 'auto',
          proPlanId: null,
          featureOverrides: {},
        };
        const token = signSessionToken(env, { sub: user.id, email: user.email, role: user.role });
        return jsonResponse({ token, user });
      }

      if (pathname === '/api/auth/login' && request.method === 'POST') {
        const body = await readJsonBody(request);
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');
        if (!email || !password) {
          return jsonResponse({ error: 'Masukkan email dan password.' }, 400);
        }
        const adminStatus = await getAdminAuthStatus(env);
        let user: AuthUserSession;
        if (email === adminStatus.adminEmail.toLowerCase()) {
          user = await authenticateAdminLogin(env, email, password);
        } else {
          if (!hasD1Connection(env)) return jsonResponse({ error: missingD1Error().message }, 503);
          const row = await d1Get<{
            id: string;
            email: string;
            display_name: string;
            password_hash: string;
            role: string;
            tier: string;
            preferred_mode: string;
            preferred_gemini_model: string;
            preferred_freellm_model: string;
            pro_plan_id?: string;
            feature_overrides_json?: string;
          }>(env, 'SELECT * FROM app_users WHERE email = ?', [email]);
          if (!row || !verifyPassword(password, row.password_hash)) {
            return jsonResponse({ error: 'Email atau password tidak sesuai.' }, 401);
          }
          const tier: UserAccountTier =
            row.tier === 'pro' || row.tier === 'admin' ? row.tier : 'free';
          user = {
            id: row.id,
            email: row.email,
            displayName: row.display_name,
            role: row.role === 'admin' ? 'admin' : 'user',
            tier,
            preferredMode:
              row.preferred_mode === 'gemini' || row.preferred_mode === 'freellm'
                ? row.preferred_mode
                : 'local',
            preferredGeminiModel: row.preferred_gemini_model || 'gemini-3.1-flash-lite',
            preferredFreeLlmModel: row.preferred_freellm_model || 'auto',
            proPlanId: tier === 'pro' && row.pro_plan_id ? row.pro_plan_id : null,
            featureOverrides: parseFeatureOverridesJson(row.feature_overrides_json),
          };
        }
        const token = signSessionToken(env, { sub: user.id, email: user.email, role: user.role });
        return jsonResponse({ token, user });
      }

      if (pathname === '/api/admin/auth/claim' && request.method === 'POST') {
        if (!hasD1Connection(env)) return jsonResponse({ error: missingD1Error().message }, 503);
        const body = await readJsonBody(request);
        const existing = await getAdminRecord(env);
        if (existing) {
          return jsonResponse(
            { error: 'Akun Admin utama sudah diklaim. Gunakan form Login Admin.' },
            400
          );
        }
        if ((env.ADMIN_PASSWORD || '').trim()) {
          return jsonResponse(
            { error: 'Password Admin diatur lewat Environment Variable ADMIN_PASSWORD.' },
            400
          );
        }
        const password = String(body.password || '').trim();
        if (password.length < 6) {
          return jsonResponse({ error: 'Password Admin minimal 6 karakter.' }, 400);
        }
        const email = String(body.email || env.ADMIN_EMAIL || ADMIN_BOOTSTRAP_EMAIL)
          .trim()
          .toLowerCase();
        const displayName =
          String(body.displayName || 'Admin TemaLoka').trim().slice(0, 80) || 'Admin TemaLoka';
        await d1Run(
          env,
          `INSERT INTO admin_accounts (id, email, display_name, password_hash, updated_at_ms) VALUES (?, ?, ?, ?, ?)`,
          ['primary', email, displayName, hashPassword(password), Date.now()]
        );
        const user: AuthUserSession = {
          id: 'admin-primary',
          email,
          displayName,
          role: 'admin',
          tier: 'admin',
          preferredMode: 'freellm',
          preferredGeminiModel: 'gemini-3.1-flash-lite',
          preferredFreeLlmModel: 'auto',
        };
        const token = signSessionToken(env, { sub: user.id, email: user.email, role: 'admin' });
        return jsonResponse({ token, user });
      }

      if (pathname === '/api/admin/auth/login' && request.method === 'POST') {
        const body = await readJsonBody(request);
        const user = await authenticateAdminLogin(
          env,
          String(body.email || ''),
          String(body.password || '')
        );
        const token = signSessionToken(env, { sub: user.id, email: user.email, role: 'admin' });
        return jsonResponse({ token, user });
      }

      if (pathname === '/api/auth/preferences' && request.method === 'PATCH') {
        const session = await resolveOptionalUser(request, env);
        if (!session) return jsonResponse({ error: 'Sesi login diperlukan.' }, 401);
        const body = await readJsonBody(request);
        const mode =
          body.preferredMode === 'gemini' || body.preferredMode === 'freellm'
            ? body.preferredMode
            : 'local';
        const geminiModel = String(body.preferredGeminiModel || session.preferredGeminiModel).slice(
          0,
          64
        );
        const freellmModel = String(body.preferredFreeLlmModel || session.preferredFreeLlmModel).slice(
          0,
          80
        );
        if (hasD1Connection(env) && session.id !== 'admin-primary') {
          await d1Run(
            env,
            `UPDATE app_users SET preferred_mode = ?, preferred_gemini_model = ?, preferred_freellm_model = ?, updated_at_ms = ? WHERE id = ?`,
            [mode, geminiModel, freellmModel, Date.now(), session.id]
          );
        }
        return jsonResponse({
          ok: true,
          user: {
            ...session,
            preferredMode: mode,
            preferredGeminiModel: geminiModel,
            preferredFreeLlmModel: freellmModel,
          },
        });
      }

      if (pathname === '/api/admin/account/update' && request.method === 'POST') {
        const admin = await resolveOptionalUser(request, env);
        if (!admin || admin.role !== 'admin') return jsonResponse({ error: 'Akses Admin diperlukan.' }, 403);
        if (!hasD1Connection(env)) return jsonResponse({ error: missingD1Error().message }, 503);
        const body = await readJsonBody(request);
        const currentPassword = String(body.currentPassword || '');
        const newEmail = String(body.newEmail || admin.email).trim().toLowerCase();
        const newDisplayName = String(body.newDisplayName || admin.displayName).trim().slice(0, 80);
        const newPassword = typeof body.newPassword === 'string' ? body.newPassword.trim() : '';

        const dbAdmin = await getAdminRecord(env);
        const envPass = (env.ADMIN_PASSWORD || '').trim();
        if (dbAdmin) {
          if (!verifyPassword(currentPassword, dbAdmin.passwordHash)) {
            return jsonResponse({ error: 'Password Admin saat ini tidak cocok.' }, 400);
          }
        } else if (envPass) {
          if (currentPassword !== envPass) {
            return jsonResponse({ error: 'Password Admin saat ini tidak cocok.' }, 400);
          }
        } else {
          return jsonResponse({ error: 'Akun Admin belum diinisialisasi.' }, 400);
        }

        const nextHash = newPassword
          ? (() => {
              if (newPassword.length < 6) throw new Error('Password baru minimal 6 karakter.');
              return hashPassword(newPassword);
            })()
          : dbAdmin?.passwordHash || hashPassword(envPass || currentPassword);

        await d1Run(
          env,
          `INSERT INTO admin_accounts (id, email, display_name, password_hash, updated_at_ms)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET email=excluded.email, display_name=excluded.display_name, password_hash=excluded.password_hash, updated_at_ms=excluded.updated_at_ms`,
          ['primary', newEmail, newDisplayName || 'Admin TemaLoka', nextHash, Date.now()]
        );
        const updatedUser: AuthUserSession = {
          id: 'admin-primary',
          email: newEmail,
          displayName: newDisplayName || 'Admin TemaLoka',
          role: 'admin',
          tier: 'admin',
          preferredMode: 'freellm',
          preferredGeminiModel: 'gemini-3.1-flash-lite',
          preferredFreeLlmModel: 'auto',
        };
        const token = signSessionToken(env, {
          sub: updatedUser.id,
          email: updatedUser.email,
          role: 'admin',
        });
        return jsonResponse({ token, user: updatedUser });
      }

      // ==================== PUBLIC & ADMIN CONFIG ROUTES ====================
      if (pathname === '/api/config/public' && request.method === 'GET') {
        const optionalUser = await resolveOptionalUser(request, env);
        const isAdmin = optionalUser?.role === 'admin';
        const [rawAdsense, units, rawSeo, rawPremium, rawPayment, rawDomain] = await Promise.all([
          getAppConfigJson<Partial<SiteAdsenseConfig>>(env, 'adsense', {}),
          listAdsenseUnits(env, !isAdmin),
          getAppConfigJson<Partial<SiteSeoConfig>>(env, 'seo_global', {}),
          getAppConfigJson<unknown>(env, 'premium_features', null),
          getAppConfigJson<unknown>(env, 'payment_settings', null),
          getAppConfigJson<unknown>(env, 'domain_affiliate_settings', null),
        ]);

        const publicCfg: PublicSiteConfigResponse = {
          dbMode: hasD1Connection(env) ? 'cloudflare-d1' : 'local-sqlite',
          adsense: { ...DEFAULT_SITE_ADSENSE_CONFIG, ...rawAdsense },
          units,
          seo: { ...DEFAULT_SITE_SEO_CONFIG, ...rawSeo },
          premium: rawPremium ? normalizePremiumConfig(rawPremium) : DEFAULT_PREMIUM_CONFIG,
          payment: rawPayment ? normalizePaymentSettings(rawPayment) : DEFAULT_PAYMENT_SETTINGS,
          domainAffiliate: rawDomain
            ? normalizeDomainAffiliateConfig(rawDomain)
            : DEFAULT_DOMAIN_AFFILIATE_CONFIG,
          freellm: {
            enabled: true,
            defaultModel: (env.FREELLMAPI_MODEL || 'auto').trim(),
            routingStrategy: 'auto',
            allowForGuests: true,
            configuredProviders: getConfiguredFreeLlmProviders(env),
          },
          gcloud: {
            enabled: Boolean((env.GEMINI_API_KEY || '').trim()),
            projectId: '',
            oauthEnabled: false,
            oauthClientId: '',
            hasGeminiApiKey: Boolean((env.GEMINI_API_KEY || '').trim()),
            hasIndexingServiceAccount: false,
            serviceAccountEmail: '',
          },
        };
        return jsonResponse(publicCfg);
      }

      if (pathname === '/api/admin/d1/config' && request.method === 'GET') {
        const admin = await resolveOptionalUser(request, env);
        if (!admin || admin.role !== 'admin') return jsonResponse({ error: 'Akses Admin diperlukan.' }, 403);
        const view: CloudflareD1AdminConfigView = {
          enabled: hasD1Connection(env),
          accountId: (env.CLOUDFLARE_ACCOUNT_ID || '').trim(),
          databaseId: (env.CLOUDFLARE_D1_DATABASE_ID || '').trim(),
          databaseName: (env.CLOUDFLARE_D1_DATABASE_NAME || 'temaloka_db').trim(),
          bindingName: env.DB ? 'DB (Worker Binding Aktif)' : (env.CLOUDFLARE_D1_BINDING || 'DB').trim(),
          workerProxyUrl: (env.CLOUDFLARE_D1_WORKER_URL || '').trim(),
          hasApiToken: Boolean((env.CLOUDFLARE_API_TOKEN || '').trim() || env.DB),
          apiTokenMasked: env.DB ? 'Native D1 Binding' : (env.CLOUDFLARE_API_TOKEN ? '••••••••' : ''),
          activeMode: hasD1Connection(env) ? 'cloudflare-d1' : 'local-sqlite',
          lastTestedAtMs: Date.now(),
          lastTestOk: hasD1Connection(env),
          lastTestMessage: env.DB
            ? 'Terhubung langsung ke D1 Binding (DB) di Cloudflare Workers.'
            : hasD1Connection(env)
              ? 'Terhubung via D1 REST API env vars.'
              : 'Tambahkan D1 Binding bernama DB di Cloudflare Workers.',
          updatedAtMs: Date.now(),
        };
        return jsonResponse({ config: view });
      }

      if (
        (pathname === '/api/admin/d1/test' || pathname === '/api/admin/d1/init-schema') &&
        request.method === 'POST'
      ) {
        const admin = await resolveOptionalUser(request, env);
        if (!admin || admin.role !== 'admin') return jsonResponse({ error: 'Akses Admin diperlukan.' }, 403);
        if (!hasD1Connection(env)) return jsonResponse({ ok: false, message: missingD1Error().message }, 400);
        const t0 = Date.now();
        await ensureWorkerD1Schema(env);
        const tbls = await d1All<{ name: string }>(
          env,
          `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name`
        );
        const tables = tbls.map((t) => t.name);
        return jsonResponse({
          ok: true,
          latencyMs: Date.now() - t0,
          tables,
          message: `Terhubung ke Cloudflare D1 (${tables.length} tabel siap).`,
        });
      }

      if (pathname === '/api/admin/adsense/config' && request.method === 'PUT') {
        const admin = await resolveOptionalUser(request, env);
        if (!admin || admin.role !== 'admin') return jsonResponse({ error: 'Akses Admin diperlukan.' }, 403);
        if (!hasD1Connection(env)) return jsonResponse({ error: missingD1Error().message }, 503);
        const next = await readJsonBody(request);
        const rawPub = String(next.publisherId || '').trim();
        const sanitizedPub = rawPub ? sanitizePublisherId(rawPub) : '';
        if (rawPub && !sanitizedPub) {
          return jsonResponse({ error: 'Format Publisher ID tidak valid (ca-pub-...)' }, 400);
        }
        const saved: SiteAdsenseConfig = {
          ...DEFAULT_SITE_ADSENSE_CONFIG,
          adsenseEnabled: Boolean(next.adsenseEnabled),
          publisherId: sanitizedPub,
          autoAdsEnabled: Boolean(next.autoAdsEnabled),
          headMetaEnabled: Boolean(next.headMetaEnabled),
          adsTxtContent: String(next.adsTxtContent || '').slice(0, ADSENSE_FIELD_LIMITS.adsTxtMax),
          hideAdsForAdmin: Boolean(next.hideAdsForAdmin),
          hideAdsInOfflineMode: Boolean(next.hideAdsInOfflineMode),
          testMode: Boolean(next.testMode),
          defaultTemplatePubId: sanitizePublisherId(String(next.defaultTemplatePubId || '')) || sanitizedPub,
          topBannerEnabled: Boolean(next.topBannerEnabled),
          topBannerSlot: sanitizeSlotDigits(String(next.topBannerSlot || '')),
          topBannerFormat:
            next.topBannerFormat === 'auto' || next.topBannerFormat === 'rectangle'
              ? next.topBannerFormat
              : 'horizontal',
          sidebarSlotEnabled: Boolean(next.sidebarSlotEnabled),
          sidebarSlotId: sanitizeSlotDigits(String(next.sidebarSlotId || '')),
          sidebarSlotFormat:
            next.sidebarSlotFormat === 'auto' || next.sidebarSlotFormat === 'vertical'
              ? next.sidebarSlotFormat
              : 'rectangle',
          footerSlotEnabled: Boolean(next.footerSlotEnabled),
          footerSlotId: sanitizeSlotDigits(String(next.footerSlotId || '')),
          footerSlotFormat:
            next.footerSlotFormat === 'horizontal' || next.footerSlotFormat === 'rectangle'
              ? next.footerSlotFormat
              : 'auto',
          modalSlotEnabled: Boolean(next.modalSlotEnabled),
          modalSlotId: sanitizeSlotDigits(String(next.modalSlotId || '')),
          modalSlotFormat: next.modalSlotFormat === 'auto' ? 'auto' : 'rectangle',
          adminNote: String(next.adminNote || '').slice(0, ADSENSE_FIELD_LIMITS.adminNoteMax),
          updatedByUid: admin.id,
          updatedByEmail: admin.email,
          updatedAtMs: Date.now(),
        };
        await setAppConfigJson(env, 'adsense', saved, admin.email);
        return jsonResponse({ config: saved });
      }

      if (pathname === '/api/admin/adsense/units' && request.method === 'POST') {
        const admin = await resolveOptionalUser(request, env);
        if (!admin || admin.role !== 'admin') return jsonResponse({ error: 'Akses Admin diperlukan.' }, 403);
        if (!hasD1Connection(env)) return jsonResponse({ error: missingD1Error().message }, 503);
        const body = await readJsonBody(request);
        const name = String(body.name || '').trim().slice(0, ADSENSE_FIELD_LIMITS.unitNameMax);
        if (!name) return jsonResponse({ error: 'Nama unit iklan wajib diisi.' }, 400);
        const id = `ad_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
        const now = Date.now();
        const format: AdsenseUnitFormatType =
          body.format === 'leaderboard' ||
          body.format === 'sidebar' ||
          body.format === 'in-article' ||
          body.format === 'multiplex'
            ? body.format
            : 'responsive';
        const placement: AdsenseUnitPlacementType =
          body.placement === 'topBanner' ||
          body.placement === 'sidebarSlot' ||
          body.placement === 'footerSlot' ||
          body.placement === 'modalSlot'
            ? body.placement
            : 'bloggerTemplate';
        await d1Run(
          env,
          `INSERT INTO adsense_units (id, name, slot_id, format, placement, enabled, only_on_posts, notes, created_by_uid, created_at_ms, updated_at_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            name,
            sanitizeSlotDigits(String(body.slotId || '')),
            format,
            placement,
            body.enabled !== false ? 1 : 0,
            body.onlyOnPosts ? 1 : 0,
            String(body.notes || '').trim().slice(0, ADSENSE_FIELD_LIMITS.unitNotesMax),
            admin.id,
            now,
            now,
          ]
        );
        const units = await listAdsenseUnits(env, false);
        return jsonResponse({ units });
      }

      if (pathname.startsWith('/api/admin/adsense/units/') && request.method === 'PUT') {
        const admin = await resolveOptionalUser(request, env);
        if (!admin || admin.role !== 'admin') return jsonResponse({ error: 'Akses Admin diperlukan.' }, 403);
        if (!hasD1Connection(env)) return jsonResponse({ error: missingD1Error().message }, 503);
        const unitId = decodeURIComponent(pathname.slice('/api/admin/adsense/units/'.length));
        const body = await readJsonBody(request);
        const name = String(body.name || '').trim().slice(0, ADSENSE_FIELD_LIMITS.unitNameMax);
        if (!unitId || !name) return jsonResponse({ error: 'ID dan nama unit iklan wajib diisi.' }, 400);
        await d1Run(
          env,
          `UPDATE adsense_units SET name=?, slot_id=?, format=?, placement=?, enabled=?, only_on_posts=?, notes=?, updated_at_ms=? WHERE id=?`,
          [
            name,
            sanitizeSlotDigits(String(body.slotId || '')),
            String(body.format || 'responsive'),
            String(body.placement || 'bloggerTemplate'),
            body.enabled ? 1 : 0,
            body.onlyOnPosts ? 1 : 0,
            String(body.notes || '').trim().slice(0, ADSENSE_FIELD_LIMITS.unitNotesMax),
            Date.now(),
            unitId,
          ]
        );
        const units = await listAdsenseUnits(env, false);
        return jsonResponse({ units });
      }

      if (pathname.startsWith('/api/admin/adsense/units/') && request.method === 'DELETE') {
        const admin = await resolveOptionalUser(request, env);
        if (!admin || admin.role !== 'admin') return jsonResponse({ error: 'Akses Admin diperlukan.' }, 403);
        if (!hasD1Connection(env)) return jsonResponse({ error: missingD1Error().message }, 503);
        const unitId = decodeURIComponent(pathname.slice('/api/admin/adsense/units/'.length));
        await d1Run(env, 'DELETE FROM adsense_units WHERE id = ?', [unitId]);
        const units = await listAdsenseUnits(env, false);
        return jsonResponse({ units });
      }

      if (pathname === '/api/admin/seo' && request.method === 'PUT') {
        const admin = await resolveOptionalUser(request, env);
        if (!admin || admin.role !== 'admin') return jsonResponse({ error: 'Akses Admin diperlukan.' }, 403);
        if (!hasD1Connection(env)) return jsonResponse({ error: missingD1Error().message }, 503);
        const body = await readJsonBody(request);
        const cur = await getAppConfigJson<Partial<SiteSeoConfig>>(env, 'seo_global', {});
        const seo: SiteSeoConfig = {
          ...DEFAULT_SITE_SEO_CONFIG,
          ...cur,
          ...(body as Partial<SiteSeoConfig>),
          updatedAtMs: Date.now(),
          updatedByEmail: admin.email,
        };
        await setAppConfigJson(env, 'seo_global', seo, admin.email);
        return jsonResponse({ seo });
      }

      if (pathname === '/api/admin/premium' && request.method === 'PUT') {
        const admin = await resolveOptionalUser(request, env);
        if (!admin || admin.role !== 'admin') return jsonResponse({ error: 'Akses Admin diperlukan.' }, 403);
        if (!hasD1Connection(env)) return jsonResponse({ error: missingD1Error().message }, 503);
        const body = await readJsonBody(request);
        const premium: PremiumSettingsConfig = {
          ...normalizePremiumConfig(body),
          updatedAtMs: Date.now(),
          updatedByEmail: admin.email,
        };
        await setAppConfigJson(env, 'premium_features', premium, admin.email);
        return jsonResponse({ premium });
      }

      if (pathname === '/api/admin/payment' && request.method === 'PUT') {
        const admin = await resolveOptionalUser(request, env);
        if (!admin || admin.role !== 'admin') return jsonResponse({ error: 'Akses Admin diperlukan.' }, 403);
        if (!hasD1Connection(env)) return jsonResponse({ error: missingD1Error().message }, 503);
        const body = await readJsonBody(request);
        const payment: PaymentSettingsConfig = {
          ...normalizePaymentSettings(body),
          updatedAtMs: Date.now(),
          updatedByEmail: admin.email,
        };
        await setAppConfigJson(env, 'payment_settings', payment, admin.email);
        return jsonResponse({ payment });
      }

      if (pathname === '/api/admin/domain-affiliate' && request.method === 'PUT') {
        const admin = await resolveOptionalUser(request, env);
        if (!admin || admin.role !== 'admin') return jsonResponse({ error: 'Akses Admin diperlukan.' }, 403);
        if (!hasD1Connection(env)) return jsonResponse({ error: missingD1Error().message }, 503);
        const body = await readJsonBody(request);
        const domainAffiliate: DomainAffiliateConfig = {
          ...normalizeDomainAffiliateConfig(body),
          updatedAtMs: Date.now(),
          updatedByEmail: admin.email,
        };
        await setAppConfigJson(env, 'domain_affiliate_settings', domainAffiliate, admin.email);
        return jsonResponse({ domainAffiliate });
      }

      // ==================== USER MANAGEMENT ====================
      if (pathname === '/api/admin/users' && request.method === 'GET') {
        const admin = await resolveOptionalUser(request, env);
        if (!admin || admin.role !== 'admin') return jsonResponse({ error: 'Akses Admin diperlukan.' }, 403);
        if (!hasD1Connection(env)) return jsonResponse({ users: [] });
        const q = (url.searchParams.get('q') || '').trim().toLowerCase().slice(0, 120);
        const rows = q
          ? await d1All<{
              id: string;
              email: string;
              display_name: string;
              role: string;
              tier: string;
              pro_plan_id?: string;
              feature_overrides_json?: string;
              created_at_ms: number;
              updated_at_ms: number;
            }>(
              env,
              'SELECT id, email, display_name, role, tier, pro_plan_id, feature_overrides_json, created_at_ms, updated_at_ms FROM app_users WHERE lower(email) LIKE ? OR lower(display_name) LIKE ? ORDER BY updated_at_ms DESC LIMIT 200',
              [`%${q}%`, `%${q}%`]
            )
          : await d1All<{
              id: string;
              email: string;
              display_name: string;
              role: string;
              tier: string;
              pro_plan_id?: string;
              feature_overrides_json?: string;
              created_at_ms: number;
              updated_at_ms: number;
            }>(
              env,
              'SELECT id, email, display_name, role, tier, pro_plan_id, feature_overrides_json, created_at_ms, updated_at_ms FROM app_users ORDER BY updated_at_ms DESC LIMIT 200'
            );
        const users: ManagedUserRow[] = rows.map((r) => {
          const tier: UserAccountTier = r.tier === 'pro' || r.tier === 'admin' ? r.tier : 'free';
          return {
            id: r.id,
            email: r.email,
            displayName: r.display_name,
            role: r.role === 'admin' ? 'admin' : 'user',
            tier,
            proPlanId: tier === 'pro' && r.pro_plan_id ? r.pro_plan_id : null,
            featureOverrides: parseFeatureOverridesJson(r.feature_overrides_json),
            createdAtMs: r.created_at_ms,
            updatedAtMs: r.updated_at_ms,
          };
        });
        return jsonResponse({ users });
      }

      if (pathname.startsWith('/api/admin/users/') && pathname.endsWith('/tier') && request.method === 'PUT') {
        const admin = await resolveOptionalUser(request, env);
        if (!admin || admin.role !== 'admin') return jsonResponse({ error: 'Akses Admin diperlukan.' }, 403);
        if (!hasD1Connection(env)) return jsonResponse({ error: missingD1Error().message }, 503);
        const userId = decodeURIComponent(
          pathname.slice('/api/admin/users/'.length, -'/tier'.length)
        );
        const body = await readJsonBody(request);
        const tier: 'free' | 'pro' = body.tier === 'pro' ? 'pro' : 'free';
        const nextPlanId = tier === 'pro' ? sanitizeProPlanId(body.proPlanId) : '';
        await d1Run(env, 'UPDATE app_users SET tier = ?, pro_plan_id = ?, updated_at_ms = ? WHERE id = ?', [
          tier,
          nextPlanId,
          Date.now(),
          userId,
        ]);
        return jsonResponse({ ok: true, tier, proPlanId: tier === 'pro' && nextPlanId ? nextPlanId : null });
      }

      if (pathname.startsWith('/api/admin/users/') && pathname.endsWith('/features') && request.method === 'PUT') {
        const admin = await resolveOptionalUser(request, env);
        if (!admin || admin.role !== 'admin') return jsonResponse({ error: 'Akses Admin diperlukan.' }, 403);
        if (!hasD1Connection(env)) return jsonResponse({ error: missingD1Error().message }, 503);
        const userId = decodeURIComponent(
          pathname.slice('/api/admin/users/'.length, -'/features'.length)
        );
        const body = await readJsonBody(request);
        const sanitized = sanitizeFeatureOverrides(body.featureOverrides);
        await d1Run(
          env,
          'UPDATE app_users SET feature_overrides_json = ?, updated_at_ms = ? WHERE id = ?',
          [JSON.stringify(sanitized), Date.now(), userId]
        );
        return jsonResponse({ ok: true, featureOverrides: sanitized });
      }

      // ==================== DOMAIN CHECK & FETCH XML ====================
      if (pathname === '/api/domain/check' && request.method === 'POST') {
        const body = await readJsonBody(request);
        const query = String(body.query || '').trim().slice(0, 120);
        if (!query) return jsonResponse({ error: 'Masukkan nama domain atau kata kunci terlebih dahulu.' }, 400);
        const result = await checkDomainAvailabilityWeb({
          query,
          tlds: Array.isArray(body.tlds)
            ? body.tlds.filter((t): t is string => typeof t === 'string').slice(0, 16)
            : undefined,
          includeSuggestions: body.includeSuggestions !== false,
        });
        return jsonResponse(result, 200);
      }

      if (pathname === '/api/fetch-xml' && request.method === 'POST') {
        const body = await readJsonBody(request);
        let rawUrl = String(body.url || '').trim();
        if (!rawUrl) return jsonResponse({ error: 'Masukkan URL file XML atau blog.' }, 400);
        const ghBlob = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/i.exec(rawUrl);
        if (ghBlob) {
          rawUrl = `https://raw.githubusercontent.com/${ghBlob[1]}/${ghBlob[2]}/${ghBlob[3]}`;
        }
        const parsed = new URL(rawUrl);
        if (!['http:', 'https:'].includes(parsed.protocol) || isBlockedHost(parsed.hostname)) {
          return jsonResponse({ error: 'URL tidak diizinkan.' }, 400);
        }
        const resp = await fetch(parsed.toString(), {
          headers: { 'User-Agent': 'TemaLokaStudio/1.0' },
          signal: AbortSignal.timeout(12000),
        });
        if (!resp.ok) {
          return jsonResponse({ error: `Gagal memuat URL (HTTP ${resp.status}).` }, 400);
        }
        const text = await resp.text();
        return jsonResponse({ xml: text, sourceUrl: parsed.toString() });
      }

      // ==================== CLOUD NOTES & CHAT HISTORY ====================
      if (pathname === '/api/notes' && request.method === 'GET') {
        const user = await resolveOptionalUser(request, env);
        if (!user) return jsonResponse({ error: 'Sesi login diperlukan.' }, 401);
        if (!hasD1Connection(env)) return jsonResponse({ notes: [] });
        const rows = await d1All<{
          id: string;
          title: string;
          content: string;
          tag: string;
          pinned: number;
          template_hint: string;
          created_at_ms: number;
          updated_at_ms: number;
        }>(
          env,
          'SELECT id, title, content, tag, pinned, template_hint, created_at_ms, updated_at_ms FROM user_notes WHERE user_id = ? ORDER BY pinned DESC, updated_at_ms DESC LIMIT 120',
          [user.id]
        );
        return jsonResponse({
          notes: rows.map((r) => ({
            id: r.id,
            title: r.title,
            content: r.content,
            tag: r.tag,
            pinned: Boolean(r.pinned),
            templateHint: r.template_hint,
            createdAtMs: r.created_at_ms,
            updatedAtMs: r.updated_at_ms,
          })),
        });
      }

      if (pathname.startsWith('/api/notes/') && request.method === 'PUT') {
        const user = await resolveOptionalUser(request, env);
        if (!user) return jsonResponse({ error: 'Sesi login diperlukan.' }, 401);
        if (!hasD1Connection(env)) return jsonResponse({ error: missingD1Error().message }, 503);
        const rawId = decodeURIComponent(pathname.slice('/api/notes/'.length)).trim();
        const body = await readJsonBody(request);
        const now = Date.now();
        const title = String(body.title || 'Catatan Tanpa Judul').trim().slice(0, 160) || 'Catatan Tanpa Judul';
        const content = String(body.content || '').slice(0, 50000);
        const tag = ['umum', 'xml', 'css', 'url', 'ide'].includes(String(body.tag))
          ? String(body.tag)
          : 'umum';
        const pinned = body.pinned ? 1 : 0;
        const templateHint = String(body.templateHint || '').slice(0, 120);
        await d1Run(
          env,
          `INSERT INTO user_notes (id, user_id, title, content, tag, pinned, template_hint, created_at_ms, updated_at_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET title=excluded.title, content=excluded.content, tag=excluded.tag, pinned=excluded.pinned, template_hint=excluded.template_hint, updated_at_ms=excluded.updated_at_ms`,
          [rawId, user.id, title, content, tag, pinned, templateHint, now, now]
        );
        return jsonResponse({
          note: {
            id: rawId,
            title,
            content,
            tag,
            pinned: Boolean(pinned),
            templateHint,
            createdAtMs: now,
            updatedAtMs: now,
          },
        });
      }

      if (pathname.startsWith('/api/notes/') && request.method === 'DELETE') {
        const user = await resolveOptionalUser(request, env);
        if (!user) return jsonResponse({ error: 'Sesi login diperlukan.' }, 401);
        if (!hasD1Connection(env)) return jsonResponse({ ok: true });
        const rawId = decodeURIComponent(pathname.slice('/api/notes/'.length)).trim();
        await d1Run(env, 'DELETE FROM user_notes WHERE id = ? AND user_id = ?', [rawId, user.id]);
        return jsonResponse({ ok: true });
      }

      if (pathname === '/api/chat-messages' && request.method === 'GET') {
        const user = await resolveOptionalUser(request, env);
        if (!user) return jsonResponse({ error: 'Sesi login diperlukan.' }, 401);
        if (!hasD1Connection(env)) return jsonResponse({ messages: [] });
        const rows = await d1All<{
          id: string;
          role: string;
          content: string;
          engine_label: string;
          model_id: string;
          suggested_css: string;
          page_context: string;
          created_at_ms: number;
        }>(
          env,
          'SELECT id, role, content, engine_label, model_id, suggested_css, page_context, created_at_ms FROM user_chat_messages WHERE user_id = ? ORDER BY created_at_ms ASC LIMIT 100',
          [user.id]
        );
        return jsonResponse({
          messages: rows.map((r) => ({
            id: r.id,
            role: r.role === 'assistant' ? 'assistant' : 'user',
            content: r.content,
            engineLabel: r.engine_label,
            modelId: r.model_id,
            suggestedCss: r.suggested_css || undefined,
            pageContext: r.page_context,
            createdAtMs: r.created_at_ms,
          })),
        });
      }

      if (pathname === '/api/chat-messages' && request.method === 'POST') {
        const user = await resolveOptionalUser(request, env);
        if (!user) return jsonResponse({ error: 'Sesi login diperlukan.' }, 401);
        if (!hasD1Connection(env)) return jsonResponse({ saved: [] });
        const body = await readJsonBody(request);
        const items = Array.isArray(body.messages) ? body.messages.slice(0, 4) : [];
        const saved: Array<Record<string, unknown>> = [];
        for (const item of items) {
          if (!item || typeof item !== 'object') continue;
          const rec = item as Record<string, unknown>;
          if (typeof rec.content !== 'string') continue;
          const id = `msg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
          const role = rec.role === 'assistant' ? 'assistant' : 'user';
          const content = rec.content.slice(0, 12000);
          const engineLabel = String(rec.engineLabel || 'AI').slice(0, 100);
          const modelId = String(rec.modelId || 'auto').slice(0, 64);
          const suggestedCss = typeof rec.suggestedCss === 'string' ? rec.suggestedCss.slice(0, 6000) : '';
          const pageContext = String(rec.pageContext || 'domain').slice(0, 32);
          const createdAtMs = typeof rec.createdAtMs === 'number' ? rec.createdAtMs : Date.now();
          await d1Run(
            env,
            `INSERT INTO user_chat_messages (id, user_id, role, content, engine_label, model_id, suggested_css, page_context, created_at_ms)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, user.id, role, content, engineLabel, modelId, suggestedCss, pageContext, createdAtMs]
          );
          saved.push({ id, role, content, engineLabel, modelId, suggestedCss: suggestedCss || undefined, pageContext, createdAtMs });
        }
        return jsonResponse({ saved });
      }

      if (pathname === '/api/chat-messages' && request.method === 'DELETE') {
        const user = await resolveOptionalUser(request, env);
        if (!user) return jsonResponse({ error: 'Sesi login diperlukan.' }, 401);
        if (hasD1Connection(env)) {
          await d1Run(env, 'DELETE FROM user_chat_messages WHERE user_id = ?', [user.id]);
        }
        return jsonResponse({ ok: true });
      }

      // ==================== AI ROUTES ====================
      if (pathname === '/api/ai/freellm/models' && request.method === 'GET') {
        return jsonResponse({
          models: FREELLM_MODELS,
          status: {
            enabled: true,
            defaultModel: (env.FREELLMAPI_MODEL || 'auto').trim(),
            routingStrategy: 'auto',
            allowForGuests: true,
            configuredProviders: getConfiguredFreeLlmProviders(env),
          },
        });
      }

      if (pathname === '/api/ai/quota-status' && request.method === 'POST') {
        const user = await resolveOptionalUser(request, env);
        return jsonResponse({
          authenticated: Boolean(user),
          quota: {
            dateKey: new Date().toISOString().slice(0, 10),
            usedCount: 0,
            dailyLimit: 25,
            remaining: 25,
          },
        });
      }

      if (pathname === '/api/ai/chat' && request.method === 'POST') {
        const body = await readJsonBody(request);
        const message = String(body.message || '').trim().slice(0, 8000);
        if (!message) return jsonResponse({ error: 'Tuliskan pertanyaan terlebih dahulu.' }, 400);
        const activePage = String(body.activePage || 'domain').slice(0, 32);
        const templateContext = String(body.templateContext || '').slice(0, 18000);
        const rawHistory = Array.isArray(body.history) ? body.history : [];
        const history = rawHistory
          .slice(-8)
          .map((item) => {
            const h = item as { role?: string; content?: string };
            return {
              role: (h?.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
              content: typeof h?.content === 'string' ? h.content.slice(0, 2000) : '',
            };
          })
          .filter((h) => Boolean(h.content));
        const res = await callEdgeFreeLlmChat(
          env,
          'Anda adalah Asisten AI resmi di dalam studio TemaLoka (editor template XML Blogspot/Blogger). Jawab dalam Bahasa Indonesia yang jelas dan terstruktur.',
          history,
          `Tab aktif: ${activePage}\nKonteks template XML:\n${templateContext}\n\nPertanyaan:\n${message}`
        );
        return jsonResponse({
          reply: res.text,
          provider: res.provider,
          model: res.model,
        });
      }

      // ==================== ADS.TXT / ROBOTS.TXT / SITEMAP.XML ====================
      if (pathname === '/ads.txt' && request.method === 'GET') {
        const rawAdsense = await getAppConfigJson<Partial<SiteAdsenseConfig>>(env, 'adsense', {});
        const cfg = { ...DEFAULT_SITE_ADSENSE_CONFIG, ...rawAdsense };
        const body = cfg.adsTxtContent.trim() || (cfg.publisherId ? buildAdsTxtLine(cfg.publisherId) : '');
        return textResponse(body || '# ads.txt', 'text/plain; charset=utf-8');
      }

      if (pathname === '/robots.txt' && request.method === 'GET') {
        const rawSeo = await getAppConfigJson<Partial<SiteSeoConfig>>(env, 'seo_global', {});
        const cfg = { ...DEFAULT_SITE_SEO_CONFIG, ...rawSeo };
        const origin = cfg.canonicalOrigin || url.origin;
        const body =
          cfg.robotsTxtContent.trim() ||
          `User-agent: *\nAllow: /\nDisallow: /api/\n${cfg.sitemapEnabled ? `Sitemap: ${origin.replace(/\/+$/, '')}/sitemap.xml\n` : ''}`;
        return textResponse(body, 'text/plain; charset=utf-8');
      }

      if (pathname === '/sitemap.xml' && request.method === 'GET') {
        const rawSeo = await getAppConfigJson<Partial<SiteSeoConfig>>(env, 'seo_global', {});
        const cfg = { ...DEFAULT_SITE_SEO_CONFIG, ...rawSeo };
        const origin = (cfg.canonicalOrigin || url.origin).replace(/\/+$/, '');
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${origin}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>\n</urlset>`;
        return textResponse(xml, 'application/xml; charset=utf-8');
      }

      if (pathname.startsWith('/api/')) {
        return jsonResponse(
          {
            error: `Endpoint ${pathname} belum tersedia di Cloudflare Worker ringan ini.`,
          },
          501
        );
      }

      return env.ASSETS.fetch(request);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan pada server Worker.';
      const status = /belum terhubung/i.test(msg) ? 503 : 400;
      return jsonResponse({ error: msg }, status);
    }
  },
};
