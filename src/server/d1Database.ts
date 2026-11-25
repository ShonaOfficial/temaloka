import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  ADMIN_BOOTSTRAP_EMAIL,
  ADSENSE_FIELD_LIMITS,
  DEFAULT_SITE_ADSENSE_CONFIG,
  sanitizePublisherId,
  sanitizeSlotDigits,
  type AdsenseUnitRecord,
  type SiteAdsenseConfig,
} from '../types/adsense.ts';
import {
  DEFAULT_DOMAIN_AFFILIATE_CONFIG,
  DEFAULT_PAYMENT_SETTINGS,
  DEFAULT_SITE_SEO_CONFIG,
  normalizeDomainAffiliateConfig,
  normalizePaymentSettings,
  type AdminAuthStatus,
  type AuthUserSession,
  type CloudflareD1AdminConfigView,
  type CloudflareD1UpdatePayload,
  type DbStorageMode,
  type DomainAffiliateConfig,
  type ManagedUserRow,
  type PaymentSettingsConfig,
  type SiteSeoConfig,
  type UserAccountTier,
} from '../types/admin.ts';
import {
  DEFAULT_PREMIUM_CONFIG,
  normalizePremiumConfig,
  sanitizeFeatureOverrides,
  sanitizeProPlanId,
  type FeatureOverrideValue,
  type PremiumSettingsConfig,
} from '../lib/featureRegistry.ts';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const SQLITE_DB_PATH = path.join(DATA_DIR, 'temaloka_d1.sqlite');
const LOCAL_SECRET_FILE = path.join(DATA_DIR, '.temaloka_master.key');
const CRED_FILE_PATH = path.join(DATA_DIR, 'd1_runtime.enc.json');

export const D1_SCHEMA_STATEMENTS: string[] = [
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
  `CREATE INDEX IF NOT EXISTS idx_user_notes_uid ON user_notes (user_id, updated_at_ms DESC)`,
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
  `CREATE INDEX IF NOT EXISTS idx_user_chat_uid ON user_chat_messages (user_id, created_at_ms ASC)`,
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

let sqliteDb: DatabaseSync | null = null;
let cachedMasterKey: Buffer | null = null;

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }
}

function getMasterKey(): Buffer {
  if (cachedMasterKey) return cachedMasterKey;
  const envSecret =
    process.env.SESSION_SECRET ||
    process.env.ADMIN_TOKEN_SECRET ||
    process.env.ENCRYPTION_KEY ||
    '';
  if (envSecret.trim()) {
    cachedMasterKey = crypto.createHash('sha256').update(envSecret.trim()).digest();
    return cachedMasterKey;
  }
  ensureDataDir();
  if (fs.existsSync(LOCAL_SECRET_FILE)) {
    const raw = fs.readFileSync(LOCAL_SECRET_FILE, 'utf8').trim();
    if (/^[a-f0-9]{64}$/i.test(raw)) {
      cachedMasterKey = Buffer.from(raw, 'hex');
      return cachedMasterKey;
    }
  }
  const fresh = crypto.randomBytes(32);
  fs.writeFileSync(LOCAL_SECRET_FILE, fresh.toString('hex'), { mode: 0o600 });
  cachedMasterKey = fresh;
  return cachedMasterKey;
}

export function encryptSecretPayload(obj: unknown): string {
  const key = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = JSON.stringify(obj);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  });
}

export function decryptSecretPayload<T>(payloadStr: string): T | null {
  try {
    const parsed = JSON.parse(payloadStr) as {
      v?: number;
      iv?: string;
      tag?: string;
      data?: string;
    };
    if (!parsed?.iv || !parsed?.tag || !parsed?.data) return null;
    const key = getMasterKey();
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(parsed.iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(parsed.data, 'base64')),
      decipher.final(),
    ]);
    return JSON.parse(decrypted.toString('utf8')) as T;
  } catch {
    return null;
  }
}

export function maskSecret(secret: string): string {
  const clean = secret.trim();
  if (!clean) return '';
  if (clean.length <= 8) return '••••••••';
  return `${clean.slice(0, 4)}••••${clean.slice(-4)}`;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
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

export interface SignedTokenClaims {
  sub: string;
  email: string;
  role: 'user' | 'admin';
  iat: number;
  exp: number;
}

export function signSessionToken(claims: {
  sub: string;
  email: string;
  role: 'user' | 'admin';
  ttlSeconds?: number;
}): string {
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
    .createHmac('sha256', getMasterKey())
    .update(payloadB64)
    .digest('base64url');
  return `tlk.${payloadB64}.${sig}`;
}

export function verifySessionToken(token: string): SignedTokenClaims | null {
  try {
    const parts = token.trim().split('.');
    if (parts.length !== 3 || parts[0] !== 'tlk') return null;
    const [, payloadB64, sig] = parts;
    const expectedSig = crypto
      .createHmac('sha256', getMasterKey())
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

export function getSqliteDb(): DatabaseSync {
  if (sqliteDb) return sqliteDb;
  ensureDataDir();
  sqliteDb = new DatabaseSync(SQLITE_DB_PATH);
  sqliteDb.exec('PRAGMA journal_mode = WAL;');
  sqliteDb.exec('PRAGMA synchronous = NORMAL;');
  for (const stmt of D1_SCHEMA_STATEMENTS) {
    sqliteDb.exec(stmt);
  }
  try {
    sqliteDb.exec(
      `ALTER TABLE app_users ADD COLUMN feature_overrides_json TEXT NOT NULL DEFAULT '{}'`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : '';
    if (!msg.includes('duplicate column')) {
      throw err;
    }
  }
  try {
    sqliteDb.exec(
      `ALTER TABLE app_users ADD COLUMN pro_plan_id TEXT NOT NULL DEFAULT ''`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : '';
    if (!msg.includes('duplicate column')) {
      throw err;
    }
  }
  return sqliteDb;
}

export interface StoredD1Credentials {
  enabled: boolean;
  accountId: string;
  databaseId: string;
  databaseName: string;
  bindingName: string;
  workerProxyUrl: string;
  apiToken: string;
  lastTestedAtMs: number;
  lastTestOk: boolean | null;
  lastTestMessage: string;
  updatedAtMs: number;
}

function defaultD1Credentials(): StoredD1Credentials {
  const envAcc = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const envDb = (process.env.CLOUDFLARE_D1_DATABASE_ID || '').trim();
  const envTok = (process.env.CLOUDFLARE_API_TOKEN || '').trim();
  const envWorker = (process.env.CLOUDFLARE_D1_WORKER_URL || '').trim();
  const hasEnv = Boolean((envAcc && envDb && envTok) || envWorker);
  return {
    enabled: hasEnv,
    accountId: envAcc,
    databaseId: envDb,
    databaseName: (process.env.CLOUDFLARE_D1_DATABASE_NAME || 'temaloka-db').trim(),
    bindingName: (process.env.CLOUDFLARE_D1_BINDING || 'DB').trim(),
    workerProxyUrl: envWorker,
    apiToken: envTok,
    lastTestedAtMs: 0,
    lastTestOk: null,
    lastTestMessage: '',
    updatedAtMs: 0,
  };
}

export function loadStoredD1Credentials(): StoredD1Credentials {
  const fallback = defaultD1Credentials();
  try {
    if (fs.existsSync(CRED_FILE_PATH)) {
      const raw = fs.readFileSync(CRED_FILE_PATH, 'utf8');
      const dec = decryptSecretPayload<Partial<StoredD1Credentials>>(raw);
      if (dec) {
        return {
          ...fallback,
          enabled: Boolean(dec.enabled),
          accountId: typeof dec.accountId === 'string' ? dec.accountId : fallback.accountId,
          databaseId: typeof dec.databaseId === 'string' ? dec.databaseId : fallback.databaseId,
          databaseName:
            typeof dec.databaseName === 'string' && dec.databaseName.trim()
              ? dec.databaseName
              : fallback.databaseName,
          bindingName:
            typeof dec.bindingName === 'string' && dec.bindingName.trim()
              ? dec.bindingName
              : fallback.bindingName,
          workerProxyUrl:
            typeof dec.workerProxyUrl === 'string' ? dec.workerProxyUrl : fallback.workerProxyUrl,
          apiToken:
            typeof dec.apiToken === 'string' && dec.apiToken.trim()
              ? dec.apiToken
              : fallback.apiToken,
          lastTestedAtMs: typeof dec.lastTestedAtMs === 'number' ? dec.lastTestedAtMs : 0,
          lastTestOk: typeof dec.lastTestOk === 'boolean' ? dec.lastTestOk : null,
          lastTestMessage: typeof dec.lastTestMessage === 'string' ? dec.lastTestMessage : '',
          updatedAtMs: typeof dec.updatedAtMs === 'number' ? dec.updatedAtMs : 0,
        };
      }
    }
  } catch {
    // ignore corrupt credential file
  }
  return fallback;
}

export function saveStoredD1Credentials(next: StoredD1Credentials): void {
  ensureDataDir();
  fs.writeFileSync(CRED_FILE_PATH, encryptSecretPayload(next), { mode: 0o600 });
}

export function isRemoteD1Configured(creds?: StoredD1Credentials): boolean {
  const c = creds ?? loadStoredD1Credentials();
  if (!c.enabled) return false;
  if (c.workerProxyUrl.trim()) return true;
  return Boolean(c.accountId.trim() && c.databaseId.trim() && c.apiToken.trim());
}

export function getActiveDbMode(): DbStorageMode {
  return isRemoteD1Configured() ? 'cloudflare-d1' : 'local-sqlite';
}

export function getD1AdminConfigView(): CloudflareD1AdminConfigView {
  const c = loadStoredD1Credentials();
  return {
    enabled: c.enabled,
    accountId: c.accountId,
    databaseId: c.databaseId,
    databaseName: c.databaseName,
    bindingName: c.bindingName,
    workerProxyUrl: c.workerProxyUrl,
    hasApiToken: Boolean(c.apiToken.trim()),
    apiTokenMasked: maskSecret(c.apiToken),
    activeMode: isRemoteD1Configured(c) ? 'cloudflare-d1' : 'local-sqlite',
    lastTestedAtMs: c.lastTestedAtMs,
    lastTestOk: c.lastTestOk,
    lastTestMessage: c.lastTestMessage,
    updatedAtMs: c.updatedAtMs,
  };
}

type SqlParam = string | number | null;

async function executeOnRemoteD1<T = Record<string, unknown>>(
  sql: string,
  params: SqlParam[],
  overrideCreds?: StoredD1Credentials
): Promise<{ rows: T[]; meta?: Record<string, unknown> }> {
  const creds = overrideCreds ?? loadStoredD1Credentials();
  if (creds.workerProxyUrl.trim()) {
    const parsedWorker = new URL(creds.workerProxyUrl.trim());
    if (!['https:', 'http:'].includes(parsedWorker.protocol)) {
      throw new Error('URL Worker Proxy D1 harus diawali https:// atau http://');
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (creds.apiToken.trim()) {
      headers.Authorization = `Bearer ${creds.apiToken.trim()}`;
    }
    const resp = await fetch(parsedWorker.toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify({ sql, params }),
      signal: AbortSignal.timeout(12000),
    });
    const data = (await resp.json()) as {
      success?: boolean;
      error?: string;
      results?: T[];
      result?: Array<{ results?: T[]; meta?: Record<string, unknown> }>;
    };
    if (!resp.ok || data.success === false) {
      throw new Error(data.error || `Worker D1 mengembalikan HTTP ${resp.status}`);
    }
    if (Array.isArray(data.results)) {
      return { rows: data.results };
    }
    if (Array.isArray(data.result) && data.result[0]) {
      return { rows: data.result[0].results || [], meta: data.result[0].meta };
    }
    return { rows: [] };
  }

  const acc = creds.accountId.trim();
  const dbId = creds.databaseId.trim();
  const tok = creds.apiToken.trim();
  if (!acc || !dbId || !tok) {
    throw new Error('Account ID, Database ID, dan API Token Cloudflare D1 belum lengkap.');
  }
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(acc) || !/^[a-zA-Z0-9_-]{8,80}$/.test(dbId)) {
    throw new Error('Format Account ID atau Database ID Cloudflare tidak valid.');
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(acc)}/d1/database/${encodeURIComponent(dbId)}/query`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tok}`,
    },
    body: JSON.stringify({ sql, params }),
    signal: AbortSignal.timeout(12000),
  });

  const payload = (await resp.json()) as {
    success?: boolean;
    errors?: Array<{ code?: number; message?: string }>;
    result?: Array<{
      success?: boolean;
      results?: T[];
      meta?: Record<string, unknown>;
    }>;
  };

  if (!resp.ok || payload.success === false) {
    const errMsg =
      payload.errors?.map((e) => e.message).filter(Boolean).join('; ') ||
      `Cloudflare D1 HTTP ${resp.status}`;
    throw new Error(errMsg);
  }

  const first = payload.result?.[0];
  return {
    rows: Array.isArray(first?.results) ? first.results : [],
    meta: first?.meta,
  };
}

let remoteSchemaEnsured = false;

export async function ensureRemoteD1Schema(): Promise<void> {
  if (remoteSchemaEnsured) return;
  if (!isRemoteD1Configured()) return;
  for (const stmt of D1_SCHEMA_STATEMENTS) {
    await executeOnRemoteD1(stmt, []);
  }
  try {
    await executeOnRemoteD1(
      `ALTER TABLE app_users ADD COLUMN feature_overrides_json TEXT NOT NULL DEFAULT '{}'`,
      []
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : '';
    if (!msg.includes('duplicate column')) {
      throw err;
    }
  }
  try {
    await executeOnRemoteD1(
      `ALTER TABLE app_users ADD COLUMN pro_plan_id TEXT NOT NULL DEFAULT ''`,
      []
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : '';
    if (!msg.includes('duplicate column')) {
      throw err;
    }
  }
  remoteSchemaEnsured = true;
}

export async function dbAll<T = Record<string, unknown>>(
  sql: string,
  params: SqlParam[] = []
): Promise<T[]> {
  if (isRemoteD1Configured()) {
    await ensureRemoteD1Schema();
    const { rows } = await executeOnRemoteD1<T>(sql, params);
    return rows;
  }
  const db = getSqliteDb();
  const stmt = db.prepare(sql);
  return stmt.all(...params) as T[];
}

export async function dbGet<T = Record<string, unknown>>(
  sql: string,
  params: SqlParam[] = []
): Promise<T | null> {
  const rows = await dbAll<T>(sql, params);
  return rows[0] ?? null;
}

export async function dbRun(sql: string, params: SqlParam[] = []): Promise<void> {
  // Always mirror mutations to local SQLite too when operating in D1 mode for instant safety backup
  const sqlite = getSqliteDb();
  sqlite.prepare(sql).run(...params);

  if (isRemoteD1Configured()) {
    await ensureRemoteD1Schema();
    await executeOnRemoteD1(sql, params);
  }
}

export async function testCloudflareD1Connection(
  override?: Partial<CloudflareD1UpdatePayload>
): Promise<{ ok: boolean; latencyMs: number; message: string; tables: string[] }> {
  const existing = loadStoredD1Credentials();
  const testCreds: StoredD1Credentials = {
    ...existing,
    enabled: true,
    accountId: (override?.accountId ?? existing.accountId).trim(),
    databaseId: (override?.databaseId ?? existing.databaseId).trim(),
    databaseName: (override?.databaseName ?? existing.databaseName).trim(),
    bindingName: (override?.bindingName ?? existing.bindingName).trim(),
    workerProxyUrl: (override?.workerProxyUrl ?? existing.workerProxyUrl).trim(),
    apiToken:
      override?.apiToken && override.apiToken.trim()
        ? override.apiToken.trim()
        : existing.apiToken,
  };

  const t0 = Date.now();
  try {
    await executeOnRemoteD1('SELECT 1 AS ok', [], testCreds);
    const tblRes = await executeOnRemoteD1<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name`,
      [],
      testCreds
    );
    const latencyMs = Date.now() - t0;
    const tables = tblRes.rows.map((r) => r.name);
    const msg = `Terhubung ke Cloudflare D1 (${latencyMs} ms). ${tables.length} tabel ditemukan.`;

    saveStoredD1Credentials({
      ...existing,
      lastTestedAtMs: Date.now(),
      lastTestOk: true,
      lastTestMessage: msg,
    });

    return { ok: true, latencyMs, message: msg, tables };
  } catch (err) {
    const latencyMs = Date.now() - t0;
    const msg = err instanceof Error ? err.message : 'Gagal menghubungi Cloudflare D1.';
    saveStoredD1Credentials({
      ...existing,
      lastTestedAtMs: Date.now(),
      lastTestOk: false,
      lastTestMessage: msg,
    });
    return { ok: false, latencyMs, message: msg, tables: [] };
  }
}

export async function initializeRemoteD1SchemaNow(): Promise<{
  ok: boolean;
  message: string;
  tables: string[];
}> {
  if (!isRemoteD1Configured()) {
    throw new Error('Aktifkan & simpan kredensial Cloudflare D1 terlebih dahulu.');
  }
  for (const stmt of D1_SCHEMA_STATEMENTS) {
    await executeOnRemoteD1(stmt, []);
  }
  try {
    await executeOnRemoteD1(
      `ALTER TABLE app_users ADD COLUMN feature_overrides_json TEXT NOT NULL DEFAULT '{}'`,
      []
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : '';
    if (!msg.includes('duplicate column')) {
      throw err;
    }
  }
  try {
    await executeOnRemoteD1(
      `ALTER TABLE app_users ADD COLUMN pro_plan_id TEXT NOT NULL DEFAULT ''`,
      []
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : '';
    if (!msg.includes('duplicate column')) {
      throw err;
    }
  }
  remoteSchemaEnsured = true;
  const tblRes = await executeOnRemoteD1<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name`,
    []
  );
  const tables = tblRes.rows.map((r) => r.name);
  return {
    ok: true,
    message: `Skema tabel TemaLoka berhasil dibuat di Cloudflare D1 (${tables.length} tabel siap).`,
    tables,
  };
}

export async function syncLocalSqliteToRemoteD1(): Promise<{
  syncedCounts: Record<string, number>;
}> {
  if (!isRemoteD1Configured()) {
    throw new Error('Cloudflare D1 belum aktif/terkonfigurasi.');
  }
  await initializeRemoteD1SchemaNow();
  const db = getSqliteDb();
  const syncedCounts: Record<string, number> = {
    admin_accounts: 0,
    app_users: 0,
    app_config: 0,
    adsense_units: 0,
    user_notes: 0,
    user_chat_messages: 0,
    server_secrets: 0,
  };

  const admins = db.prepare('SELECT * FROM admin_accounts').all() as Array<{
    id: string;
    email: string;
    display_name: string;
    password_hash: string;
    updated_at_ms: number;
  }>;
  for (const row of admins) {
    await executeOnRemoteD1(
      `INSERT INTO admin_accounts (id, email, display_name, password_hash, updated_at_ms)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET email=excluded.email, display_name=excluded.display_name, password_hash=excluded.password_hash, updated_at_ms=excluded.updated_at_ms`,
      [row.id, row.email, row.display_name, row.password_hash, row.updated_at_ms]
    );
    syncedCounts.admin_accounts++;
  }

  const users = db.prepare('SELECT * FROM app_users').all() as Array<{
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
    created_at_ms: number;
    updated_at_ms: number;
  }>;
  for (const row of users) {
    await executeOnRemoteD1(
      `INSERT INTO app_users (id, email, display_name, password_hash, role, tier, preferred_mode, preferred_gemini_model, preferred_freellm_model, pro_plan_id, feature_overrides_json, created_at_ms, updated_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET email=excluded.email, display_name=excluded.display_name, tier=excluded.tier, preferred_mode=excluded.preferred_mode, pro_plan_id=excluded.pro_plan_id, feature_overrides_json=excluded.feature_overrides_json, updated_at_ms=excluded.updated_at_ms`,
      [
        row.id,
        row.email,
        row.display_name,
        row.password_hash,
        row.role,
        row.tier,
        row.preferred_mode,
        row.preferred_gemini_model,
        row.preferred_freellm_model,
        row.pro_plan_id || '',
        row.feature_overrides_json || '{}',
        row.created_at_ms,
        row.updated_at_ms,
      ]
    );
    syncedCounts.app_users++;
  }

  const configs = db.prepare('SELECT * FROM app_config').all() as Array<{
    key: string;
    value_json: string;
    updated_at_ms: number;
    updated_by_email: string;
  }>;
  for (const row of configs) {
    await executeOnRemoteD1(
      `INSERT INTO app_config (key, value_json, updated_at_ms, updated_by_email)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at_ms=excluded.updated_at_ms, updated_by_email=excluded.updated_by_email`,
      [row.key, row.value_json, row.updated_at_ms, row.updated_by_email]
    );
    syncedCounts.app_config++;
  }

  const secrets = db.prepare('SELECT * FROM server_secrets').all() as Array<{
    key: string;
    encrypted_json: string;
    updated_at_ms: number;
  }>;
  for (const row of secrets) {
    await executeOnRemoteD1(
      `INSERT INTO server_secrets (key, encrypted_json, updated_at_ms)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET encrypted_json=excluded.encrypted_json, updated_at_ms=excluded.updated_at_ms`,
      [row.key, row.encrypted_json, row.updated_at_ms]
    );
    syncedCounts.server_secrets++;
  }

  const units = db.prepare('SELECT * FROM adsense_units').all() as Array<{
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
  }>;
  for (const row of units) {
    await executeOnRemoteD1(
      `INSERT INTO adsense_units (id, name, slot_id, format, placement, enabled, only_on_posts, notes, created_by_uid, created_at_ms, updated_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, slot_id=excluded.slot_id, format=excluded.format, placement=excluded.placement, enabled=excluded.enabled, only_on_posts=excluded.only_on_posts, notes=excluded.notes, updated_at_ms=excluded.updated_at_ms`,
      [
        row.id,
        row.name,
        row.slot_id,
        row.format,
        row.placement,
        row.enabled,
        row.only_on_posts,
        row.notes,
        row.created_by_uid,
        row.created_at_ms,
        row.updated_at_ms,
      ]
    );
    syncedCounts.adsense_units++;
  }

  const notes = db.prepare('SELECT * FROM user_notes').all() as Array<{
    id: string;
    user_id: string;
    title: string;
    content: string;
    tag: string;
    pinned: number;
    template_hint: string;
    created_at_ms: number;
    updated_at_ms: number;
  }>;
  for (const row of notes) {
    await executeOnRemoteD1(
      `INSERT INTO user_notes (id, user_id, title, content, tag, pinned, template_hint, created_at_ms, updated_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET title=excluded.title, content=excluded.content, tag=excluded.tag, pinned=excluded.pinned, template_hint=excluded.template_hint, updated_at_ms=excluded.updated_at_ms`,
      [
        row.id,
        row.user_id,
        row.title,
        row.content,
        row.tag,
        row.pinned,
        row.template_hint,
        row.created_at_ms,
        row.updated_at_ms,
      ]
    );
    syncedCounts.user_notes++;
  }

  const msgs = db.prepare('SELECT * FROM user_chat_messages').all() as Array<{
    id: string;
    user_id: string;
    role: string;
    content: string;
    engine_label: string;
    model_id: string;
    suggested_css: string;
    page_context: string;
    created_at_ms: number;
  }>;
  for (const row of msgs) {
    await executeOnRemoteD1(
      `INSERT INTO user_chat_messages (id, user_id, role, content, engine_label, model_id, suggested_css, page_context, created_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      [
        row.id,
        row.user_id,
        row.role,
        row.content,
        row.engine_label,
        row.model_id,
        row.suggested_css,
        row.page_context,
        row.created_at_ms,
      ]
    );
    syncedCounts.user_chat_messages++;
  }

  return { syncedCounts };
}

export async function getAdminRecord(): Promise<{
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  updatedAtMs: number;
} | null> {
  const row = await dbGet<{
    id: string;
    email: string;
    display_name: string;
    password_hash: string;
    updated_at_ms: number;
  }>(`SELECT id, email, display_name, password_hash, updated_at_ms FROM admin_accounts WHERE id = ?`, [
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

export async function getAdminAuthStatus(): Promise<AdminAuthStatus> {
  const envEmail = (process.env.ADMIN_EMAIL || ADMIN_BOOTSTRAP_EMAIL).trim().toLowerCase();
  const envPassword = (process.env.ADMIN_PASSWORD || '').trim();
  const dbAdmin = await getAdminRecord();

  return {
    configured: Boolean(dbAdmin || envPassword),
    claimedInDb: Boolean(dbAdmin),
    hasEnvPassword: Boolean(envPassword),
    adminEmail: dbAdmin?.email || envEmail,
    adminDisplayName: dbAdmin?.displayName || 'Admin TemaLoka',
    dbMode: getActiveDbMode(),
  };
}

export async function claimPrimaryAdminAccount(input: {
  email?: string;
  displayName?: string;
  password: string;
}): Promise<AuthUserSession> {
  const existing = await getAdminRecord();
  if (existing) {
    throw new Error('Akun Admin utama sudah diklaim. Gunakan form Login Admin.');
  }
  const envPassword = (process.env.ADMIN_PASSWORD || '').trim();
  if (envPassword) {
    throw new Error('Password Admin diatur lewat Environment Variable ADMIN_PASSWORD.');
  }
  const cleanPass = input.password.trim();
  if (cleanPass.length < 6) {
    throw new Error('Password Admin minimal 6 karakter.');
  }
  const cleanEmail = (input.email || process.env.ADMIN_EMAIL || ADMIN_BOOTSTRAP_EMAIL)
    .trim()
    .toLowerCase();
  if (!cleanEmail.includes('@') || cleanEmail.length < 5) {
    throw new Error('Format email Admin tidak valid.');
  }
  const cleanName = (input.displayName || 'Admin TemaLoka').trim().slice(0, 80) || 'Admin TemaLoka';
  const now = Date.now();
  const passHash = hashPassword(cleanPass);

  await dbRun(
    `INSERT INTO admin_accounts (id, email, display_name, password_hash, updated_at_ms)
     VALUES (?, ?, ?, ?, ?)`,
    ['primary', cleanEmail, cleanName, passHash, now]
  );

  return {
    id: 'admin-primary',
    email: cleanEmail,
    displayName: cleanName,
    role: 'admin',
    tier: 'admin',
    preferredMode: 'freellm',
    preferredGeminiModel: 'gemini-3.1-flash-lite',
    preferredFreeLlmModel: 'auto',
  };
}

export async function authenticateAdminLogin(
  emailInput: string,
  passwordInput: string
): Promise<AuthUserSession> {
  const email = emailInput.trim().toLowerCase();
  const password = passwordInput;
  const dbAdmin = await getAdminRecord();

  if (dbAdmin) {
    if (email !== dbAdmin.email.toLowerCase()) {
      throw new Error('Email atau password Admin salah.');
    }
    if (!verifyPassword(password, dbAdmin.passwordHash)) {
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

  const envEmail = (process.env.ADMIN_EMAIL || ADMIN_BOOTSTRAP_EMAIL).trim().toLowerCase();
  const envPass = (process.env.ADMIN_PASSWORD || '').trim();
  if (!envPass) {
    throw new Error('Akun Admin belum diatur. Buat password Admin pertama kali terlebih dahulu.');
  }
  const a = Buffer.from(password, 'utf8');
  const b = Buffer.from(envPass, 'utf8');
  const passMatch = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (email !== envEmail || !passMatch) {
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

export async function updatePrimaryAdminAccount(input: {
  currentPassword: string;
  newEmail: string;
  newDisplayName: string;
  newPassword?: string;
}): Promise<AuthUserSession> {
  const dbAdmin = await getAdminRecord();
  const envEmail = (process.env.ADMIN_EMAIL || ADMIN_BOOTSTRAP_EMAIL).trim().toLowerCase();
  const envPass = (process.env.ADMIN_PASSWORD || '').trim();

  if (dbAdmin) {
    if (!verifyPassword(input.currentPassword, dbAdmin.passwordHash)) {
      throw new Error('Password Admin saat ini tidak cocok.');
    }
  } else if (envPass) {
    if (input.currentPassword !== envPass) {
      throw new Error('Password Admin saat ini tidak cocok.');
    }
  } else {
    throw new Error('Akun Admin belum diinisialisasi.');
  }

  const cleanEmail = input.newEmail.trim().toLowerCase();
  if (!cleanEmail.includes('@') || cleanEmail.length < 5) {
    throw new Error('Format email Admin baru tidak valid.');
  }
  const cleanName = (input.newDisplayName || 'Admin TemaLoka').trim().slice(0, 80);
  const nextPassHash =
    input.newPassword && input.newPassword.trim()
      ? (() => {
          if (input.newPassword.trim().length < 6) {
            throw new Error('Password baru minimal 6 karakter.');
          }
          return hashPassword(input.newPassword.trim());
        })()
      : dbAdmin
        ? dbAdmin.passwordHash
        : hashPassword(envPass || input.currentPassword);

  const now = Date.now();
  await dbRun(
    `INSERT INTO admin_accounts (id, email, display_name, password_hash, updated_at_ms)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       email=excluded.email,
       display_name=excluded.display_name,
       password_hash=excluded.password_hash,
       updated_at_ms=excluded.updated_at_ms`,
    ['primary', cleanEmail || envEmail, cleanName, nextPassHash, now]
  );

  return {
    id: 'admin-primary',
    email: cleanEmail || envEmail,
    displayName: cleanName,
    role: 'admin',
    tier: 'admin',
    preferredMode: 'freellm',
    preferredGeminiModel: 'gemini-3.1-flash-lite',
    preferredFreeLlmModel: 'auto',
  };
}

function parseFeatureOverridesJson(raw: unknown): Record<string, FeatureOverrideValue> {
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    return sanitizeFeatureOverrides(JSON.parse(raw));
  } catch {
    return {};
  }
}

export async function registerAppUser(input: {
  email: string;
  displayName?: string;
  password: string;
}): Promise<AuthUserSession> {
  const email = input.email.trim().toLowerCase();
  if (!email.includes('@') || email.length < 5) {
    throw new Error('Masukkan alamat email yang valid.');
  }
  if (input.password.length < 6) {
    throw new Error('Password minimal 6 karakter.');
  }
  const adminStatus = await getAdminAuthStatus();
  if (email === adminStatus.adminEmail.toLowerCase()) {
    throw new Error('Email ini terdaftar sebagai Admin Utama. Gunakan tab Login Admin.');
  }
  const existing = await dbGet<{ id: string }>('SELECT id FROM app_users WHERE email = ?', [email]);
  if (existing) {
    throw new Error('Email sudah terdaftar. Silakan masuk dengan password Anda.');
  }

  const id = `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const displayName = (input.displayName || email.split('@')[0] || 'Pengguna').trim().slice(0, 80);
  const passHash = hashPassword(input.password);
  const now = Date.now();

  await dbRun(
    `INSERT INTO app_users (id, email, display_name, password_hash, role, tier, preferred_mode, preferred_gemini_model, preferred_freellm_model, pro_plan_id, feature_overrides_json, created_at_ms, updated_at_ms)
     VALUES (?, ?, ?, ?, 'user', 'free', 'freellm', 'gemini-3.1-flash-lite', 'auto', '', '{}', ?, ?)`,
    [id, email, displayName, passHash, now, now]
  );

  return {
    id,
    email,
    displayName,
    role: 'user',
    tier: 'free',
    preferredMode: 'freellm',
    preferredGeminiModel: 'gemini-3.1-flash-lite',
    preferredFreeLlmModel: 'auto',
    proPlanId: null,
    featureOverrides: {},
  };
}

export async function authenticateAppUser(
  emailInput: string,
  passwordInput: string
): Promise<AuthUserSession> {
  const email = emailInput.trim().toLowerCase();
  const row = await dbGet<{
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
  }>('SELECT * FROM app_users WHERE email = ?', [email]);

  if (!row || !verifyPassword(passwordInput, row.password_hash)) {
    throw new Error('Email atau password tidak sesuai.');
  }

  const mode =
    row.preferred_mode === 'gemini' || row.preferred_mode === 'freellm'
      ? row.preferred_mode
      : 'local';
  const tier: UserAccountTier =
    row.tier === 'pro' || row.tier === 'admin' ? row.tier : 'free';

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role === 'admin' ? 'admin' : 'user',
    tier,
    preferredMode: mode,
    preferredGeminiModel: row.preferred_gemini_model || 'gemini-3.1-flash-lite',
    preferredFreeLlmModel: row.preferred_freellm_model || 'auto',
    proPlanId: tier === 'pro' && row.pro_plan_id ? row.pro_plan_id : null,
    featureOverrides: parseFeatureOverridesJson(row.feature_overrides_json),
  };
}

export async function getSessionUserByClaims(
  claims: SignedTokenClaims
): Promise<AuthUserSession | null> {
  if (claims.role === 'admin' && claims.sub === 'admin-primary') {
    const status = await getAdminAuthStatus();
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
  const row = await dbGet<{
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
  }>('SELECT * FROM app_users WHERE id = ?', [claims.sub]);
  if (!row) return null;
  const mode =
    row.preferred_mode === 'gemini' || row.preferred_mode === 'freellm'
      ? row.preferred_mode
      : 'local';
  const tier: UserAccountTier =
    row.tier === 'pro' || row.tier === 'admin' ? row.tier : 'free';
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role === 'admin' ? 'admin' : 'user',
    tier,
    preferredMode: mode,
    preferredGeminiModel: row.preferred_gemini_model || 'gemini-3.1-flash-lite',
    preferredFreeLlmModel: row.preferred_freellm_model || 'auto',
    proPlanId: tier === 'pro' && row.pro_plan_id ? row.pro_plan_id : null,
    featureOverrides: parseFeatureOverridesJson(row.feature_overrides_json),
  };
}

export async function listManagedUsers(searchQuery?: string): Promise<ManagedUserRow[]> {
  const cleanQ = (searchQuery || '').trim().toLowerCase().slice(0, 120);
  const rows = cleanQ
    ? await dbAll<{
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
        'SELECT id, email, display_name, role, tier, pro_plan_id, feature_overrides_json, created_at_ms, updated_at_ms FROM app_users WHERE lower(email) LIKE ? OR lower(display_name) LIKE ? ORDER BY updated_at_ms DESC LIMIT 200',
        [`%${cleanQ}%`, `%${cleanQ}%`]
      )
    : await dbAll<{
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
        'SELECT id, email, display_name, role, tier, pro_plan_id, feature_overrides_json, created_at_ms, updated_at_ms FROM app_users ORDER BY updated_at_ms DESC LIMIT 200'
      );
  return rows.map((r) => {
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
}

export async function setAppUserTier(
  userId: string,
  tier: 'free' | 'pro',
  rawProPlanId?: string | null
): Promise<{ tier: 'free' | 'pro'; proPlanId: string | null }> {
  const existing = await dbGet<{ id: string; pro_plan_id?: string }>(
    'SELECT id, pro_plan_id FROM app_users WHERE id = ?',
    [userId]
  );
  if (!existing) {
    throw new Error('Akun pengguna tidak ditemukan.');
  }
  let nextPlanId = '';
  if (tier === 'pro') {
    const requested = sanitizeProPlanId(rawProPlanId);
    if (requested) {
      nextPlanId = requested;
    } else if (existing.pro_plan_id) {
      nextPlanId = sanitizeProPlanId(existing.pro_plan_id);
    } else {
      const prem = await getPremiumSettingsConfig();
      nextPlanId = prem.defaultProPlanId || prem.proPlans[0]?.id || '';
    }
  }
  await dbRun('UPDATE app_users SET tier = ?, pro_plan_id = ?, updated_at_ms = ? WHERE id = ?', [
    tier,
    nextPlanId,
    Date.now(),
    userId,
  ]);
  return { tier, proPlanId: tier === 'pro' && nextPlanId ? nextPlanId : null };
}

export async function setAppUserFeatureOverrides(
  userId: string,
  rawOverrides: unknown
): Promise<Record<string, FeatureOverrideValue>> {
  const existing = await dbGet<{ id: string }>('SELECT id FROM app_users WHERE id = ?', [userId]);
  if (!existing) {
    throw new Error('Akun pengguna tidak ditemukan.');
  }
  const sanitized = sanitizeFeatureOverrides(rawOverrides);
  await dbRun('UPDATE app_users SET feature_overrides_json = ?, updated_at_ms = ? WHERE id = ?', [
    JSON.stringify(sanitized),
    Date.now(),
    userId,
  ]);
  return sanitized;
}

export async function getAppConfigJson<T>(key: string, fallback: T): Promise<T> {
  const row = await dbGet<{ value_json: string }>('SELECT value_json FROM app_config WHERE key = ?', [
    key,
  ]);
  if (!row?.value_json) return fallback;
  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return fallback;
  }
}

export async function setAppConfigJson(
  key: string,
  value: unknown,
  updatedByEmail: string
): Promise<void> {
  await dbRun(
    `INSERT INTO app_config (key, value_json, updated_at_ms, updated_by_email)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value_json=excluded.value_json,
       updated_at_ms=excluded.updated_at_ms,
       updated_by_email=excluded.updated_by_email`,
    [key, JSON.stringify(value), Date.now(), updatedByEmail]
  );
}

export async function getSiteAdsenseConfig(): Promise<SiteAdsenseConfig> {
  const raw = await getAppConfigJson<Partial<SiteAdsenseConfig>>('adsense', {});
  return { ...DEFAULT_SITE_ADSENSE_CONFIG, ...raw };
}

export async function saveSiteAdsenseConfig(
  next: SiteAdsenseConfig,
  adminEmail: string,
  adminId: string
): Promise<SiteAdsenseConfig> {
  const rawPub = (next.publisherId || '').trim();
  const sanitizedPub = rawPub ? sanitizePublisherId(rawPub) : '';
  if (rawPub && !sanitizedPub) {
    throw new Error('Format Publisher ID tidak valid. Gunakan format ca-pub-1234567890123456.');
  }
  const rawTplPub = (next.defaultTemplatePubId || '').trim();
  const sanitizedTplPub = rawTplPub ? sanitizePublisherId(rawTplPub) : '';
  if (rawTplPub && !sanitizedTplPub) {
    throw new Error('Format Publisher ID default template tidak valid.');
  }

  const saved: SiteAdsenseConfig = {
    adsenseEnabled: Boolean(next.adsenseEnabled),
    publisherId: sanitizedPub,
    autoAdsEnabled: Boolean(next.autoAdsEnabled),
    headMetaEnabled: Boolean(next.headMetaEnabled),
    adsTxtContent: String(next.adsTxtContent || '').slice(0, ADSENSE_FIELD_LIMITS.adsTxtMax),
    hideAdsForAdmin: Boolean(next.hideAdsForAdmin),
    hideAdsInOfflineMode: Boolean(next.hideAdsInOfflineMode),
    testMode: Boolean(next.testMode),
    defaultTemplatePubId: sanitizedTplPub || sanitizedPub,
    topBannerEnabled: Boolean(next.topBannerEnabled),
    topBannerSlot: sanitizeSlotDigits(next.topBannerSlot || ''),
    topBannerFormat:
      next.topBannerFormat === 'auto' || next.topBannerFormat === 'rectangle'
        ? next.topBannerFormat
        : 'horizontal',
    sidebarSlotEnabled: Boolean(next.sidebarSlotEnabled),
    sidebarSlotId: sanitizeSlotDigits(next.sidebarSlotId || ''),
    sidebarSlotFormat:
      next.sidebarSlotFormat === 'auto' || next.sidebarSlotFormat === 'vertical'
        ? next.sidebarSlotFormat
        : 'rectangle',
    footerSlotEnabled: Boolean(next.footerSlotEnabled),
    footerSlotId: sanitizeSlotDigits(next.footerSlotId || ''),
    footerSlotFormat:
      next.footerSlotFormat === 'horizontal' || next.footerSlotFormat === 'rectangle'
        ? next.footerSlotFormat
        : 'auto',
    modalSlotEnabled: Boolean(next.modalSlotEnabled),
    modalSlotId: sanitizeSlotDigits(next.modalSlotId || ''),
    modalSlotFormat: next.modalSlotFormat === 'auto' ? 'auto' : 'rectangle',
    adminNote: String(next.adminNote || '').slice(0, ADSENSE_FIELD_LIMITS.adminNoteMax),
    updatedByUid: adminId,
    updatedByEmail: adminEmail.slice(0, ADSENSE_FIELD_LIMITS.adminEmailMax),
    updatedAtMs: Date.now(),
  };

  await setAppConfigJson('adsense', saved, adminEmail);
  return saved;
}

export async function listAdsenseUnits(onlyEnabled = false): Promise<AdsenseUnitRecord[]> {
  const sql = onlyEnabled
    ? 'SELECT * FROM adsense_units WHERE enabled = 1 ORDER BY updated_at_ms DESC, name ASC'
    : 'SELECT * FROM adsense_units ORDER BY updated_at_ms DESC, name ASC';
  const rows = await dbAll<{
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
  }>(sql);

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
}

export async function getSiteSeoConfig(): Promise<SiteSeoConfig> {
  const raw = await getAppConfigJson<Partial<SiteSeoConfig>>('seo_global', {});
  return { ...DEFAULT_SITE_SEO_CONFIG, ...raw };
}

export async function saveSiteSeoConfig(
  next: Partial<SiteSeoConfig>,
  adminEmail: string
): Promise<SiteSeoConfig> {
  const current = await getSiteSeoConfig();
  const saved: SiteSeoConfig = {
    seoEnabled: next.seoEnabled ?? current.seoEnabled,
    siteTitle: String(next.siteTitle ?? current.siteTitle).trim().slice(0, 140) || DEFAULT_SITE_SEO_CONFIG.siteTitle,
    metaDescription: String(next.metaDescription ?? current.metaDescription).trim().slice(0, 400),
    metaKeywords: String(next.metaKeywords ?? current.metaKeywords).trim().slice(0, 400),
    canonicalOrigin: String(next.canonicalOrigin ?? current.canonicalOrigin).trim().slice(0, 260),
    ogImageUrl: String(next.ogImageUrl ?? current.ogImageUrl).trim().slice(0, 400),
    defaultBlogUrl: String(next.defaultBlogUrl ?? current.defaultBlogUrl).trim().slice(0, 300),
    robotsTxtContent: String(next.robotsTxtContent ?? current.robotsTxtContent).slice(0, 4000),
    sitemapEnabled: next.sitemapEnabled ?? current.sitemapEnabled,
    googleSiteVerification: String(next.googleSiteVerification ?? current.googleSiteVerification).trim().slice(0, 160),
    bingSiteVerification: String(next.bingSiteVerification ?? current.bingSiteVerification).trim().slice(0, 160),
    yandexVerification: String(next.yandexVerification ?? current.yandexVerification).trim().slice(0, 160),
    gaMeasurementId: String(next.gaMeasurementId ?? current.gaMeasurementId).trim().slice(0, 60),
    gtmContainerId: String(next.gtmContainerId ?? current.gtmContainerId).trim().slice(0, 60),
    indexNowKey: String(next.indexNowKey ?? current.indexNowKey).trim().slice(0, 128),
    schemaOrgEnabled: next.schemaOrgEnabled ?? current.schemaOrgEnabled,
    schemaOrgName: String(next.schemaOrgName ?? current.schemaOrgName).trim().slice(0, 120),
    customHeadSnippet: String(next.customHeadSnippet ?? current.customHeadSnippet).slice(0, 3000),
    updatedAtMs: Date.now(),
    updatedByEmail: adminEmail,
  };
  await setAppConfigJson('seo_global', saved, adminEmail);
  return saved;
}

export async function getPremiumSettingsConfig(): Promise<PremiumSettingsConfig> {
  const raw = await getAppConfigJson<unknown>('premium_features', null);
  return raw ? normalizePremiumConfig(raw) : DEFAULT_PREMIUM_CONFIG;
}

export async function savePremiumSettingsConfig(
  next: unknown,
  adminEmail: string
): Promise<PremiumSettingsConfig> {
  const normalized = normalizePremiumConfig(next);
  const saved: PremiumSettingsConfig = {
    ...normalized,
    updatedAtMs: Date.now(),
    updatedByEmail: adminEmail,
  };
  await setAppConfigJson('premium_features', saved, adminEmail);
  return saved;
}

export async function getPaymentSettingsConfig(): Promise<PaymentSettingsConfig> {
  const raw = await getAppConfigJson<unknown>('payment_settings', null);
  return raw ? normalizePaymentSettings(raw) : DEFAULT_PAYMENT_SETTINGS;
}

export async function savePaymentSettingsConfig(
  next: unknown,
  adminEmail: string
): Promise<PaymentSettingsConfig> {
  const normalized = normalizePaymentSettings(next);
  const saved: PaymentSettingsConfig = {
    ...normalized,
    updatedAtMs: Date.now(),
    updatedByEmail: adminEmail,
  };
  await setAppConfigJson('payment_settings', saved, adminEmail);
  return saved;
}

export async function getDomainAffiliateConfig(): Promise<DomainAffiliateConfig> {
  const raw = await getAppConfigJson<unknown>('domain_affiliate_settings', null);
  return raw ? normalizeDomainAffiliateConfig(raw) : DEFAULT_DOMAIN_AFFILIATE_CONFIG;
}

export async function saveDomainAffiliateConfig(
  next: unknown,
  adminEmail: string
): Promise<DomainAffiliateConfig> {
  const normalized = normalizeDomainAffiliateConfig(next);
  const saved: DomainAffiliateConfig = {
    ...normalized,
    updatedAtMs: Date.now(),
    updatedByEmail: adminEmail,
  };
  await setAppConfigJson('domain_affiliate_settings', saved, adminEmail);
  return saved;
}
