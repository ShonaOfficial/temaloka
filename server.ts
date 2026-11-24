import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Type } from '@google/genai';
import {
  authenticateAdminLogin,
  authenticateAppUser,
  claimPrimaryAdminAccount,
  dbAll,
  dbGet,
  dbRun,
  getActiveDbMode,
  getAdminAuthStatus,
  getD1AdminConfigView,
  getPaymentSettingsConfig,
  getPremiumSettingsConfig,
  getSessionUserByClaims,
  getSiteAdsenseConfig,
  getSiteSeoConfig,
  getSqliteDb,
  initializeRemoteD1SchemaNow,
  listAdsenseUnits,
  listManagedUsers,
  loadStoredD1Credentials,
  registerAppUser,
  savePaymentSettingsConfig,
  savePremiumSettingsConfig,
  saveSiteAdsenseConfig,
  saveSiteSeoConfig,
  saveStoredD1Credentials,
  setAppUserFeatureOverrides,
  setAppUserTier,
  signSessionToken,
  syncLocalSqliteToRemoteD1,
  testCloudflareD1Connection,
  updatePrimaryAdminAccount,
  verifySessionToken,
} from './src/server/d1Database';
import {
  callFreeLlmChat,
  callFreeLlmJson,
  getFreeLlmPublicStatus,
  loadFreeLlmConfig,
  saveFreeLlmConfig,
  testFreeLlmGateway,
  toFreeLlmAdminView,
} from './src/server/freellmService';
import {
  getEffectiveGeminiApiKey,
  getGoogleCloudPublicStatus,
  loadGoogleCloudConfig,
  saveGoogleCloudConfig,
  testGoogleCloudConnection,
  toGoogleCloudAdminView,
  warmGoogleCloudConfigCache,
} from './src/server/googleCloudService';
import { FREELLM_MODELS } from './src/lib/aiEngineCatalog';
import {
  ADSENSE_FIELD_LIMITS,
  sanitizeSlotDigits,
  type AdsenseUnitFormatType,
  type AdsenseUnitPlacementType,
} from './src/types/adsense';
import type { AuthUserSession } from './src/types/admin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure SQLite D1-compatible store is initialized on boot and warm Google Cloud cache
getSqliteDb();
void warmGoogleCloudConfigCache();

const app = express();

function resolveServerPort(): number {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--port' && args[i + 1]) {
      const parsed = Number(args[i + 1]);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    } else if (arg.startsWith('--port=')) {
      const parsed = Number(arg.slice('--port='.length));
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  const envPort = Number(process.env.PORT);
  const nginxPort = Number(process.env.NGINX_PORT);
  if (
    process.env.NODE_ENV !== 'production' &&
    Number.isFinite(envPort) &&
    Number.isFinite(nginxPort) &&
    envPort === nginxPort
  ) {
    return Number(process.env.DEFAULT_APP_PORT) || 3000;
  }
  return (Number.isFinite(envPort) && envPort > 0 ? envPort : 0) || Number(process.env.DEFAULT_APP_PORT) || 3000;
}

const PORT = resolveServerPort();

app.use(express.json({ limit: '10mb' }));

const CALLABLE_GEMINI_MODELS = new Set(['gemini-3.1-flash-lite']);
const PRO_GEMINI_MODELS = new Set(['gemini-4-hydrogen', 'gemini-4-neon', 'gemini-4-carbon', 'gemini-4-argon']);
const DAILY_GEMINI_QUOTA_LIMIT = 25;

function getUtcDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function extractBearerToken(req: express.Request): string {
  const authHeader = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return match?.[1] || '';
}

async function resolveOptionalUser(req: express.Request): Promise<AuthUserSession | null> {
  const token = extractBearerToken(req);
  if (!token) return null;
  const claims = verifySessionToken(token);
  if (!claims) return null;
  return await getSessionUserByClaims(claims);
}

async function requireAuthenticatedUser(
  req: express.Request,
  res: express.Response
): Promise<AuthUserSession | null> {
  const session = await resolveOptionalUser(req);
  if (!session) {
    res.status(401).json({
      error: 'Sesi login diperlukan atau telah kedaluwarsa. Silakan masuk terlebih dahulu.',
      code: 'AUTH_REQUIRED',
    });
    return null;
  }
  return session;
}

async function requireAdminSession(
  req: express.Request,
  res: express.Response
): Promise<AuthUserSession | null> {
  const session = await requireAuthenticatedUser(req, res);
  if (!session) return null;
  if (session.role !== 'admin') {
    res.status(403).json({
      error: 'Akses ditolak. Fitur ini khusus Admin TemaLoka.',
      code: 'ADMIN_REQUIRED',
    });
    return null;
  }
  return session;
}

async function getUserDailyQuota(
  userId: string,
  options?: { increment?: boolean; model?: string }
): Promise<{
  dateKey: string;
  usedCount: number;
  dailyLimit: number;
  remaining: number;
}> {
  const dateKey = getUtcDateKey();
  const bucketKey = `${userId}:${dateKey}`;
  const row = await dbGet<{ used_count: number; daily_limit: number }>(
    'SELECT used_count, daily_limit FROM user_quotas WHERE bucket_key = ?',
    [bucketKey]
  );
  const currentUsed = Number(row?.used_count || 0);
  const limit = Number(row?.daily_limit || DAILY_GEMINI_QUOTA_LIMIT);

  if (options?.increment) {
    if (currentUsed >= limit) {
      return {
        dateKey,
        usedCount: currentUsed,
        dailyLimit: limit,
        remaining: 0,
      };
    }
    const nextUsed = currentUsed + 1;
    await dbRun(
      `INSERT INTO user_quotas (bucket_key, user_id, date_key, used_count, daily_limit, last_model, updated_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(bucket_key) DO UPDATE SET
         used_count=excluded.used_count,
         last_model=excluded.last_model,
         updated_at_ms=excluded.updated_at_ms`,
      [bucketKey, userId, dateKey, nextUsed, limit, (options.model || '').slice(0, 64), Date.now()]
    );
    return {
      dateKey,
      usedCount: nextUsed,
      dailyLimit: limit,
      remaining: Math.max(0, limit - nextUsed),
    };
  }

  return {
    dateKey,
    usedCount: currentUsed,
    dailyLimit: limit,
    remaining: Math.max(0, limit - currentUsed),
  };
}

interface VerifiedAiExecution {
  engine: 'freellm' | 'gemini';
  user: AuthUserSession | null;
  geminiModel: 'gemini-3.1-flash-lite';
  freellmModel: string;
  quota?: {
    dateKey: string;
    usedCount: number;
    dailyLimit: number;
    remaining: number;
  };
}

async function resolveAiExecutionRequest(
  req: express.Request,
  res: express.Response,
  options?: { consumeQuota?: boolean }
): Promise<VerifiedAiExecution | null> {
  const requestedEngine = req.body?.engine === 'freellm' ? 'freellm' : 'gemini';
  const session = await resolveOptionalUser(req);

  if (requestedEngine === 'freellm') {
    const cfg = await loadFreeLlmConfig();
    if (!cfg.enabled) {
      res.status(503).json({
        error: 'Mesin FreeLLMAPI sedang dinonaktifkan oleh Admin di Panel Admin.',
        code: 'FREELLM_DISABLED',
      });
      return null;
    }
    if (!cfg.allowForGuests && !session) {
      res.status(401).json({
        error: 'Admin mewajibkan login akun untuk mengakses FreeLLMAPI.',
        code: 'AUTH_REQUIRED',
      });
      return null;
    }
    const freellmModel =
      typeof req.body?.model === 'string' && req.body.model.trim()
        ? req.body.model.trim().slice(0, 100)
        : cfg.defaultModel || 'auto';
    return {
      engine: 'freellm',
      user: session,
      geminiModel: 'gemini-3.1-flash-lite',
      freellmModel,
    };
  }

  // Gemini Cloud Engine requires authenticated account
  if (!session) {
    res.status(401).json({
      error: 'Masuk dengan akun TemaLoka terlebih dahulu untuk memakai Gemini Cloud (atau pilih FreeLLMAPI / AI Lokal).',
      code: 'AUTH_REQUIRED',
    });
    return null;
  }

  const requestedModel =
    typeof req.body?.model === 'string' && req.body.model.trim()
      ? req.body.model.trim()
      : 'gemini-3.1-flash-lite';
  if (PRO_GEMINI_MODELS.has(requestedModel) && session.tier !== 'pro' && session.role !== 'admin') {
    res.status(403).json({
      error: `Model "${requestedModel}" membutuhkan akun Pro atau Admin.`,
      code: 'PRO_MODEL_REQUIRED',
    });
    return null;
  }

  const geminiModel: 'gemini-3.1-flash-lite' = CALLABLE_GEMINI_MODELS.has(requestedModel)
    ? (requestedModel as 'gemini-3.1-flash-lite')
    : 'gemini-3.1-flash-lite';

  if (options?.consumeQuota !== false) {
    const before = await getUserDailyQuota(session.id, { increment: false });
    if (before.remaining <= 0) {
      res.status(429).json({
        error: `Batas kuota harian Gemini (${before.dailyLimit}/${before.dailyLimit}) telah tercapai. Beralih ke FreeLLMAPI atau AI Lokal agar tetap bekerja tanpa limit.`,
        code: 'DAILY_QUOTA_EXCEEDED',
        quota: before,
      });
      return null;
    }
    const updatedQuota = await getUserDailyQuota(session.id, {
      increment: true,
      model: geminiModel,
    });
    return {
      engine: 'gemini',
      user: session,
      geminiModel,
      freellmModel: 'auto',
      quota: updatedQuota,
    };
  }

  const currentQuota = await getUserDailyQuota(session.id, { increment: false });
  return {
    engine: 'gemini',
    user: session,
    geminiModel,
    freellmModel: 'auto',
    quota: currentQuota,
  };
}

function getGeminiErrorResponse(err: unknown, fallbackMessage: string): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err || fallbackMessage);
  if (/RESOURCE_EXHAUSTED|429/i.test(raw)) {
    return {
      status: 429,
      message:
        'Batas permintaan AI tercapai sementara. Coba lagi sebentar, pilih FreeLLMAPI, atau alihkan ke AI Lokal.',
    };
  }
  if (/PERMISSION_DENIED|API_KEY_INVALID|403|400/i.test(raw) && /key|permission|api/i.test(raw)) {
    return {
      status: 403,
      message: 'API key AI pada konfigurasi server tidak valid atau belum aktif.',
    };
  }
  return {
    status: 500,
    message: raw || fallbackMessage,
  };
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = getEffectiveGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY belum dikonfigurasi pada Settings > Secrets atau Tab Google Cloud di Panel Admin.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '::1' ||
    lower === '::' ||
    lower === '0.0.0.0' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal') ||
    lower.startsWith('fc') ||
    lower.startsWith('fd') ||
    lower.startsWith('fe80:') ||
    lower.startsWith('::ffff:127.') ||
    lower.startsWith('::ffff:10.') ||
    lower.startsWith('::ffff:192.168.') ||
    lower.startsWith('::ffff:169.254.')
  ) {
    return true;
  }
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(lower);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
  }
  return false;
}

function normalizeXmlSourceUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  const ghBlobMatch = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/i.exec(trimmed);
  if (ghBlobMatch) {
    const [, owner, repo, rest] = ghBlobMatch;
    return `https://raw.githubusercontent.com/${owner}/${repo}/${rest}`;
  }
  return trimmed;
}

function convertLiveBlogHtmlToXml(html: string, sourceUrl: string): string {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = (titleMatch?.[1] || 'Pratinjau Blog').replace(/[<>&]/g, '').trim();

  const styleMatches: string[] = [];
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m: RegExpExecArray | null;
  while ((m = styleRegex.exec(html)) !== null) {
    if (m[1] && m[1].trim().length > 0 && styleMatches.join('\n').length < 180000) {
      styleMatches.push(m[1].trim());
    }
  }

  const linkMatches: string[] = [];
  const linkRegex = /<link[^>]+rel=["']stylesheet["'][^>]*>/gi;
  while ((m = linkRegex.exec(html)) !== null) {
    const hrefMatch = /href=["']([^"']+)["']/i.exec(m[0]);
    if (hrefMatch?.[1]) {
      const resolved = new URL(hrefMatch[1], sourceUrl).toString().replace(/&/g, '&amp;');
      linkMatches.push(`<link rel="stylesheet" href="${resolved}" />`);
    }
  }

  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  const rawBody = bodyMatch?.[1] || '<div class="post"><h2 class="post-title"><data:post.title/></h2><div class="post-body"><data:post.body/></div></div>';
  const safeBody = rawBody.replace(/<script[\s\S]*?<\/script>/gi, '');
  const combinedSkin = styleMatches.join('\n\n').replace(/\]\]>/g, ']]&gt;');

  return `<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE html>
<html b:css='false' b:defaultwidgetversion='2' b:layoutsVersion='3' xmlns='http://www.w3.org/1999/xhtml' xmlns:b='http://www.google.com/2005/gml/b' xmlns:data='http://www.google.com/2005/gml/data' xmlns:expr='http://www.google.com/2005/gml/expr'>
<head>
  <meta content='width=device-width, initial-scale=1' name='viewport'/>
  <title>${title}</title>
  ${linkMatches.join('\n  ')}
  <b:skin><![CDATA[
    <Variable name="body.background" description="Background" type="color" default="#ffffff" value="#ffffff"/>
    <Variable name="body.text.color" description="Text Color" type="color" default="#1e293b" value="#1e293b"/>
    <Variable name="keycolor" description="Accent Color" type="color" default="#2563eb" value="#2563eb"/>
${combinedSkin}
  ]]></b:skin>
</head>
<body>
  <div id="temaloka-imported-live-wrapper" data-source="${sourceUrl.replace(/"/g, '&quot;')}">
    ${safeBody}
  </div>
</body>
</html>`;
}

// ==================== AUTH & ADMIN ACCOUNT ROUTES ====================

app.get('/api/auth/me', async (req, res) => {
  const user = await resolveOptionalUser(req);
  if (!user) {
    res.json({ authenticated: false, user: null });
    return;
  }
  const quota = await getUserDailyQuota(user.id, { increment: false });
  res.json({ authenticated: true, user, quota });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email : '';
    const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const user = await registerAppUser({ email, displayName, password });
    const token = signSessionToken({ sub: user.id, email: user.email, role: user.role });
    const quota = await getUserDailyQuota(user.id, { increment: false });
    res.json({ token, user, quota });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Gagal mendaftarkan akun baru.',
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password) {
      res.status(400).json({ error: 'Masukkan email dan password.' });
      return;
    }

    const adminStatus = await getAdminAuthStatus();
    let user: AuthUserSession;
    if (email === adminStatus.adminEmail.toLowerCase()) {
      user = await authenticateAdminLogin(email, password);
    } else {
      user = await authenticateAppUser(email, password);
    }

    const token = signSessionToken({ sub: user.id, email: user.email, role: user.role });
    const quota = await getUserDailyQuota(user.id, { increment: false });
    res.json({ token, user, quota });
  } catch (err) {
    res.status(401).json({
      error: err instanceof Error ? err.message : 'Email atau password salah.',
    });
  }
});

app.patch('/api/auth/preferences', async (req, res) => {
  try {
    const session = await requireAuthenticatedUser(req, res);
    if (!session) return;
    if (session.role === 'admin' && session.id === 'admin-primary') {
      res.json({ ok: true, user: session });
      return;
    }
    const mode =
      req.body?.preferredMode === 'gemini' || req.body?.preferredMode === 'freellm'
        ? req.body.preferredMode
        : 'local';
    const geminiModel =
      typeof req.body?.preferredGeminiModel === 'string'
        ? req.body.preferredGeminiModel.slice(0, 64)
        : session.preferredGeminiModel;
    const freellmModel =
      typeof req.body?.preferredFreeLlmModel === 'string'
        ? req.body.preferredFreeLlmModel.slice(0, 80)
        : session.preferredFreeLlmModel;

    await dbRun(
      `UPDATE app_users
       SET preferred_mode = ?, preferred_gemini_model = ?, preferred_freellm_model = ?, updated_at_ms = ?
       WHERE id = ?`,
      [mode, geminiModel, freellmModel, Date.now(), session.id]
    );
    res.json({
      ok: true,
      user: {
        ...session,
        preferredMode: mode,
        preferredGeminiModel: geminiModel,
        preferredFreeLlmModel: freellmModel,
      },
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal menyimpan preferensi akun.',
    });
  }
});

app.get('/api/admin/auth/status', async (_req, res) => {
  try {
    const status = await getAdminAuthStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal memeriksa status Admin.',
    });
  }
});

app.post('/api/admin/auth/claim', async (req, res) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email : undefined;
    const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName : undefined;
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const user = await claimPrimaryAdminAccount({ email, displayName, password });
    const token = signSessionToken({ sub: user.id, email: user.email, role: 'admin' });
    res.json({ token, user });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Gagal membuat akun Admin awal.',
    });
  }
});

app.post('/api/admin/auth/login', async (req, res) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const user = await authenticateAdminLogin(email, password);
    const token = signSessionToken({ sub: user.id, email: user.email, role: 'admin' });
    res.json({ token, user });
  } catch (err) {
    res.status(401).json({
      error: err instanceof Error ? err.message : 'Login Admin gagal.',
    });
  }
});

app.post('/api/admin/account/update', async (req, res) => {
  try {
    const admin = await requireAdminSession(req, res);
    if (!admin) return;
    const currentPassword =
      typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const newEmail = typeof req.body?.newEmail === 'string' ? req.body.newEmail : admin.email;
    const newDisplayName =
      typeof req.body?.newDisplayName === 'string' ? req.body.newDisplayName : admin.displayName;
    const newPassword =
      typeof req.body?.newPassword === 'string' ? req.body.newPassword : undefined;

    const updatedUser = await updatePrimaryAdminAccount({
      currentPassword,
      newEmail,
      newDisplayName,
      newPassword,
    });
    const token = signSessionToken({
      sub: updatedUser.id,
      email: updatedUser.email,
      role: 'admin',
    });
    res.json({ token, user: updatedUser });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Gagal memperbarui akun Admin.',
    });
  }
});

app.get('/api/admin/users', async (req, res) => {
  try {
    const admin = await requireAdminSession(req, res);
    if (!admin) return;
    const searchQ = typeof req.query.q === 'string' ? req.query.q : '';
    const users = await listManagedUsers(searchQ);
    res.json({ users });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal memuat daftar pengguna.',
    });
  }
});

app.put('/api/admin/users/:id/tier', async (req, res) => {
  try {
    const admin = await requireAdminSession(req, res);
    if (!admin) return;
    const targetId = String(req.params.id || '').trim();
    const tier = req.body?.tier === 'pro' ? 'pro' : 'free';
    const rawProPlanId =
      typeof req.body?.proPlanId === 'string' ? req.body.proPlanId : null;
    if (!targetId) {
      res.status(400).json({ error: 'ID pengguna tidak valid.' });
      return;
    }
    const updated = await setAppUserTier(targetId, tier, rawProPlanId);
    res.json({ ok: true, id: targetId, tier: updated.tier, proPlanId: updated.proPlanId });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal mengubah tier pengguna.',
    });
  }
});

app.put('/api/admin/users/:id/features', async (req, res) => {
  try {
    const admin = await requireAdminSession(req, res);
    if (!admin) return;
    const targetId = String(req.params.id || '').trim();
    if (!targetId) {
      res.status(400).json({ error: 'ID pengguna tidak valid.' });
      return;
    }
    const featureOverrides = await setAppUserFeatureOverrides(
      targetId,
      req.body?.featureOverrides
    );
    res.json({ ok: true, id: targetId, featureOverrides });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Gagal menyimpan akses fitur khusus pengguna.',
    });
  }
});

// ==================== CLOUDFLARE D1 ADMIN MANAGEMENT ROUTES ====================

app.get('/api/admin/d1/config', async (req, res) => {
  try {
    const admin = await requireAdminSession(req, res);
    if (!admin) return;
    res.json(getD1AdminConfigView());
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal membaca konfigurasi Cloudflare D1.',
    });
  }
});

app.put('/api/admin/d1/config', async (req, res) => {
  try {
    const admin = await requireAdminSession(req, res);
    if (!admin) return;
    const cur = loadStoredD1Credentials();
    const workerProxyUrl =
      typeof req.body?.workerProxyUrl === 'string' ? req.body.workerProxyUrl.trim() : cur.workerProxyUrl;
    if (workerProxyUrl) {
      const parsed = new URL(workerProxyUrl);
      if (!['http:', 'https:'].includes(parsed.protocol) || isBlockedHostname(parsed.hostname)) {
        res.status(400).json({ error: 'URL Worker Proxy D1 harus publik dan memakai HTTP/HTTPS.' });
        return;
      }
    }

    const nextApiToken = req.body?.clearApiToken
      ? ''
      : typeof req.body?.apiToken === 'string' && req.body.apiToken.trim()
        ? req.body.apiToken.trim()
        : cur.apiToken;

    saveStoredD1Credentials({
      ...cur,
      enabled: Boolean(req.body?.enabled),
      accountId:
        typeof req.body?.accountId === 'string' ? req.body.accountId.trim() : cur.accountId,
      databaseId:
        typeof req.body?.databaseId === 'string' ? req.body.databaseId.trim() : cur.databaseId,
      databaseName:
        typeof req.body?.databaseName === 'string' && req.body.databaseName.trim()
          ? req.body.databaseName.trim()
          : cur.databaseName,
      bindingName:
        typeof req.body?.bindingName === 'string' && req.body.bindingName.trim()
          ? req.body.bindingName.trim()
          : cur.bindingName,
      workerProxyUrl,
      apiToken: nextApiToken,
      updatedAtMs: Date.now(),
    });
    res.json(getD1AdminConfigView());
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Gagal menyimpan konfigurasi Cloudflare D1.',
    });
  }
});

app.post('/api/admin/d1/test', async (req, res) => {
  try {
    const admin = await requireAdminSession(req, res);
    if (!admin) return;
    const result = await testCloudflareD1Connection({
      accountId: typeof req.body?.accountId === 'string' ? req.body.accountId : undefined,
      databaseId: typeof req.body?.databaseId === 'string' ? req.body.databaseId : undefined,
      workerProxyUrl:
        typeof req.body?.workerProxyUrl === 'string' ? req.body.workerProxyUrl : undefined,
      apiToken: typeof req.body?.apiToken === 'string' ? req.body.apiToken : undefined,
    });
    res.json({ ...result, config: getD1AdminConfigView() });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: err instanceof Error ? err.message : 'Gagal menguji koneksi D1.',
    });
  }
});

app.post('/api/admin/d1/init-schema', async (req, res) => {
  try {
    const admin = await requireAdminSession(req, res);
    if (!admin) return;
    const result = await initializeRemoteD1SchemaNow();
    res.json(result);
  } catch (err) {
    res.status(400).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Gagal menginisialisasi tabel Cloudflare D1.',
    });
  }
});

app.post(['/api/admin/d1/sync-local', '/api/admin/d1/sync-local-to-remote'], async (req, res) => {
  try {
    const admin = await requireAdminSession(req, res);
    if (!admin) return;
    const result = await syncLocalSqliteToRemoteD1();
    res.json({
      ok: true,
      message: 'Data lokal berhasil disinkronkan ke Cloudflare D1.',
      ...result,
    });
  } catch (err) {
    res.status(400).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Gagal menyinkronkan data ke Cloudflare D1.',
    });
  }
});

// ==================== PUBLIC & ADMIN CONFIG (ADSENSE, SEO, PREMIUM, FREELLM) ====================

app.get('/api/config/public', async (req, res) => {
  try {
    const optionalUser = await resolveOptionalUser(req);
    const isAdmin = optionalUser?.role === 'admin';
    const [adsense, units, seo, premium, payment, freellmCfg, gcloudCfg] = await Promise.all([
      getSiteAdsenseConfig(),
      listAdsenseUnits(!isAdmin),
      getSiteSeoConfig(),
      getPremiumSettingsConfig(),
      getPaymentSettingsConfig(),
      loadFreeLlmConfig(),
      loadGoogleCloudConfig(),
    ]);

    res.json({
      dbMode: getActiveDbMode(),
      adsense,
      units,
      seo,
      premium,
      payment,
      freellm: getFreeLlmPublicStatus(freellmCfg),
      gcloud: getGoogleCloudPublicStatus(gcloudCfg),
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal memuat konfigurasi situs.',
    });
  }
});

app.put('/api/admin/adsense/config', async (req, res) => {
  try {
    const admin = await requireAdminSession(req, res);
    if (!admin) return;
    const saved = await saveSiteAdsenseConfig(req.body || {}, admin.email, admin.id);
    adsTxtCache = null;
    res.json({ config: saved });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Gagal menyimpan pengaturan AdSense.',
    });
  }
});

app.post('/api/admin/adsense/units', async (req, res) => {
  try {
    const admin = await requireAdminSession(req, res);
    if (!admin) return;
    const name = String(req.body?.name || '').trim().slice(0, ADSENSE_FIELD_LIMITS.unitNameMax);
    if (!name) {
      res.status(400).json({ error: 'Nama unit iklan wajib diisi.' });
      return;
    }
    const id = `ad_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
    const now = Date.now();
    const slotId = sanitizeSlotDigits(String(req.body?.slotId || ''));
    const format: AdsenseUnitFormatType =
      req.body?.format === 'leaderboard' ||
      req.body?.format === 'sidebar' ||
      req.body?.format === 'in-article' ||
      req.body?.format === 'multiplex'
        ? req.body.format
        : 'responsive';
    const placement: AdsenseUnitPlacementType =
      req.body?.placement === 'topBanner' ||
      req.body?.placement === 'sidebarSlot' ||
      req.body?.placement === 'footerSlot' ||
      req.body?.placement === 'modalSlot'
        ? req.body.placement
        : 'bloggerTemplate';
    const enabled = req.body?.enabled !== false;
    const onlyOnPosts = Boolean(req.body?.onlyOnPosts);
    const notes = String(req.body?.notes || '').trim().slice(0, ADSENSE_FIELD_LIMITS.unitNotesMax);

    await dbRun(
      `INSERT INTO adsense_units (id, name, slot_id, format, placement, enabled, only_on_posts, notes, created_by_uid, created_at_ms, updated_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, slotId, format, placement, enabled ? 1 : 0, onlyOnPosts ? 1 : 0, notes, admin.id, now, now]
    );
    const units = await listAdsenseUnits(false);
    res.json({ units });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal menambahkan unit iklan.',
    });
  }
});

app.put('/api/admin/adsense/units/:id', async (req, res) => {
  try {
    const admin = await requireAdminSession(req, res);
    if (!admin) return;
    const unitId = String(req.params.id || '').trim();
    const name = String(req.body?.name || '').trim().slice(0, ADSENSE_FIELD_LIMITS.unitNameMax);
    if (!unitId || !name) {
      res.status(400).json({ error: 'ID dan nama unit iklan wajib diisi.' });
      return;
    }
    const slotId = sanitizeSlotDigits(String(req.body?.slotId || ''));
    const format: AdsenseUnitFormatType =
      req.body?.format === 'leaderboard' ||
      req.body?.format === 'sidebar' ||
      req.body?.format === 'in-article' ||
      req.body?.format === 'multiplex'
        ? req.body.format
        : 'responsive';
    const placement: AdsenseUnitPlacementType =
      req.body?.placement === 'topBanner' ||
      req.body?.placement === 'sidebarSlot' ||
      req.body?.placement === 'footerSlot' ||
      req.body?.placement === 'modalSlot'
        ? req.body.placement
        : 'bloggerTemplate';
    const enabled = Boolean(req.body?.enabled);
    const onlyOnPosts = Boolean(req.body?.onlyOnPosts);
    const notes = String(req.body?.notes || '').trim().slice(0, ADSENSE_FIELD_LIMITS.unitNotesMax);

    await dbRun(
      `UPDATE adsense_units
       SET name = ?, slot_id = ?, format = ?, placement = ?, enabled = ?, only_on_posts = ?, notes = ?, updated_at_ms = ?
       WHERE id = ?`,
      [name, slotId, format, placement, enabled ? 1 : 0, onlyOnPosts ? 1 : 0, notes, Date.now(), unitId]
    );
    const units = await listAdsenseUnits(false);
    res.json({ units });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal mengubah unit iklan.',
    });
  }
});

app.delete('/api/admin/adsense/units/:id', async (req, res) => {
  try {
    const admin = await requireAdminSession(req, res);
    if (!admin) return;
    const unitId = String(req.params.id || '').trim();
    await dbRun('DELETE FROM adsense_units WHERE id = ?', [unitId]);
    const units = await listAdsenseUnits(false);
    res.json({ units });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal menghapus unit iklan.',
    });
  }
});

app.put('/api/admin/seo', async (req, res) => {
  try {
    const admin = await requireAdminSession(req, res);
    if (!admin) return;
    const seo = await saveSiteSeoConfig(req.body || {}, admin.email);
    res.json({ seo });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Gagal menyimpan pengaturan SEO.',
    });
  }
});

app.put('/api/admin/premium', async (req, res) => {
  try {
    const admin = await requireAdminSession(req, res);
    if (!admin) return;
    const premium = await savePremiumSettingsConfig(req.body || {}, admin.email);
    res.json({ premium });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Gagal menyimpan pengaturan Fitur Premium.',
    });
  }
});

app.put('/api/admin/payment', async (req, res) => {
  try {
    const admin = await requireAdminSession(req, res);
    if (!admin) return;
    const payment = await savePaymentSettingsConfig(req.body || {}, admin.email);
    res.json({ payment });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Gagal menyimpan pengaturan Alat Pembayaran Manual.',
    });
  }
});

// ==================== FREELLMAPI ADMIN & RUNTIME ROUTES ====================

app.get('/api/ai/freellm/models', async (_req, res) => {
  const cfg = await loadFreeLlmConfig();
  res.json({
    models: FREELLM_MODELS,
    status: getFreeLlmPublicStatus(cfg),
  });
});

app.get('/api/admin/freellm/config', async (req, res) => {
  const admin = await requireAdminSession(req, res);
  if (!admin) return;
  const cfg = await loadFreeLlmConfig();
  res.json(toFreeLlmAdminView(cfg));
});

app.put('/api/admin/freellm/config', async (req, res) => {
  try {
    const admin = await requireAdminSession(req, res);
    if (!admin) return;
    const updated = await saveFreeLlmConfig(req.body || {});
    const full = await loadFreeLlmConfig();
    res.json({ adminView: updated, publicStatus: getFreeLlmPublicStatus(full) });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Gagal menyimpan konfigurasi FreeLLMAPI.',
    });
  }
});

app.post('/api/admin/freellm/test', async (req, res) => {
  const admin = await requireAdminSession(req, res);
  if (!admin) return;
  const result = await testFreeLlmGateway();
  res.json(result);
});

// ==================== GOOGLE CLOUD CONSOLE ADMIN ROUTES ====================

app.get('/api/admin/gcloud/config', async (req, res) => {
  try {
    const admin = await requireAdminSession(req, res);
    if (!admin) return;
    const cfg = await loadGoogleCloudConfig();
    res.json({ config: toGoogleCloudAdminView(cfg) });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal membaca konfigurasi Google Cloud Console.',
    });
  }
});

app.put('/api/admin/gcloud/config', async (req, res) => {
  try {
    const admin = await requireAdminSession(req, res);
    if (!admin) return;
    const updatedView = await saveGoogleCloudConfig(req.body || {});
    const full = await loadGoogleCloudConfig();
    res.json({
      config: updatedView,
      publicStatus: getGoogleCloudPublicStatus(full),
    });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Gagal menyimpan konfigurasi Google Cloud Console.',
    });
  }
});

app.post('/api/admin/gcloud/test', async (req, res) => {
  try {
    const admin = await requireAdminSession(req, res);
    if (!admin) return;
    const result = await testGoogleCloudConnection();
    res.json(result);
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: err instanceof Error ? err.message : 'Gagal menguji koneksi Google Cloud Console.',
    });
  }
});

// ==================== USER CLOUD NOTEPAD & CHAT PERSISTENCE IN D1 ====================

app.get('/api/notes', async (req, res) => {
  try {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;
    const rows = await dbAll<{
      id: string;
      title: string;
      content: string;
      tag: string;
      pinned: number;
      template_hint: string;
      created_at_ms: number;
      updated_at_ms: number;
    }>(
      'SELECT id, title, content, tag, pinned, template_hint, created_at_ms, updated_at_ms FROM user_notes WHERE user_id = ? ORDER BY pinned DESC, updated_at_ms DESC LIMIT 120',
      [user.id]
    );
    res.json({
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
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal memuat catatan dari D1.',
    });
  }
});

app.put('/api/notes/:id', async (req, res) => {
  try {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;
    const rawId = String(req.params.id || '').trim();
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(rawId)) {
      res.status(400).json({ error: 'ID catatan tidak valid.' });
      return;
    }
    const existing = await dbGet<{ user_id: string; created_at_ms: number }>(
      'SELECT user_id, created_at_ms FROM user_notes WHERE id = ?',
      [rawId]
    );
    if (existing && existing.user_id !== user.id) {
      res.status(403).json({ error: 'Anda tidak memiliki izin mengubah catatan ini.' });
      return;
    }
    const now = Date.now();
    const title = String(req.body?.title || 'Catatan Tanpa Judul').trim().slice(0, 160) || 'Catatan Tanpa Judul';
    const content = String(req.body?.content || '').slice(0, 50000);
    const tag = ['umum', 'xml', 'css', 'url', 'ide'].includes(String(req.body?.tag))
      ? String(req.body.tag)
      : 'umum';
    const pinned = req.body?.pinned ? 1 : 0;
    const templateHint = String(req.body?.templateHint || '').slice(0, 120);
    const createdAtMs = existing?.created_at_ms || now;

    await dbRun(
      `INSERT INTO user_notes (id, user_id, title, content, tag, pinned, template_hint, created_at_ms, updated_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title=excluded.title,
         content=excluded.content,
         tag=excluded.tag,
         pinned=excluded.pinned,
         template_hint=excluded.template_hint,
         updated_at_ms=excluded.updated_at_ms`,
      [rawId, user.id, title, content, tag, pinned, templateHint, createdAtMs, now]
    );

    res.json({
      note: {
        id: rawId,
        title,
        content,
        tag,
        pinned: Boolean(pinned),
        templateHint,
        createdAtMs,
        updatedAtMs: now,
      },
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal menyimpan catatan ke D1.',
    });
  }
});

app.delete('/api/notes/:id', async (req, res) => {
  try {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;
    const rawId = String(req.params.id || '').trim();
    await dbRun('DELETE FROM user_notes WHERE id = ? AND user_id = ?', [rawId, user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal menghapus catatan dari D1.',
    });
  }
});

app.get('/api/chat-messages', async (req, res) => {
  try {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;
    const rows = await dbAll<{
      id: string;
      role: string;
      content: string;
      engine_label: string;
      model_id: string;
      suggested_css: string;
      page_context: string;
      created_at_ms: number;
    }>(
      'SELECT id, role, content, engine_label, model_id, suggested_css, page_context, created_at_ms FROM user_chat_messages WHERE user_id = ? ORDER BY created_at_ms ASC LIMIT 100',
      [user.id]
    );
    res.json({
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
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal memuat riwayat chat AI.',
    });
  }
});

app.post('/api/chat-messages', async (req, res) => {
  try {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;
    const items = Array.isArray(req.body?.messages) ? req.body.messages.slice(0, 4) : [];
    const saved: Array<Record<string, unknown>> = [];
    for (const item of items) {
      if (!item || typeof item.content !== 'string') continue;
      const id = `msg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const role = item.role === 'assistant' ? 'assistant' : 'user';
      const content = item.content.slice(0, 12000);
      const engineLabel = String(item.engineLabel || 'AI').slice(0, 100);
      const modelId = String(item.modelId || 'auto').slice(0, 64);
      const suggestedCss = typeof item.suggestedCss === 'string' ? item.suggestedCss.slice(0, 6000) : '';
      const pageContext = String(item.pageContext || 'preview').slice(0, 32);
      const createdAtMs = typeof item.createdAtMs === 'number' ? item.createdAtMs : Date.now();

      await dbRun(
        `INSERT INTO user_chat_messages (id, user_id, role, content, engine_label, model_id, suggested_css, page_context, created_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, user.id, role, content, engineLabel, modelId, suggestedCss, pageContext, createdAtMs]
      );
      saved.push({
        id,
        role,
        content,
        engineLabel,
        modelId,
        suggestedCss: suggestedCss || undefined,
        pageContext,
        createdAtMs,
      });
    }
    res.json({ saved });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal menyimpan riwayat chat AI.',
    });
  }
});

app.delete('/api/chat-messages', async (req, res) => {
  try {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;
    await dbRun('DELETE FROM user_chat_messages WHERE user_id = ?', [user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal membersihkan riwayat chat AI.',
    });
  }
});

// ==================== BLOGGER URL / QUERY / SEO SUBMIT ROUTES ====================

// 1. Fetch XML from URL (bypassing browser CORS)
app.post('/api/fetch-xml', async (req, res) => {
  try {
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    if (!rawUrl) {
      res.status(400).json({ error: 'Masukkan URL file XML atau alamat blog terlebih dahulu.' });
      return;
    }

    const normalizedUrl = normalizeXmlSourceUrl(rawUrl);
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(normalizedUrl);
    } catch {
      res.status(400).json({ error: 'Format URL tidak valid. Pastikan diawali https:// atau http://' });
      return;
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      res.status(400).json({ error: 'Hanya protokol HTTP dan HTTPS yang didukung.' });
      return;
    }

    if (isBlockedHostname(parsedUrl.hostname)) {
      res.status(403).json({ error: 'Akses ke alamat jaringan lokal tidak diizinkan.' });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(parsedUrl.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TemaLokaPreviewer/1.0)',
        Accept: 'application/xml, text/xml, text/html, text/plain;q=0.9, */*;q=0.8',
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      res.status(502).json({
        error: `Gagal mengunduh dari URL (${response.status} ${response.statusText}). Pastikan tautan bersifat publik.`,
      });
      return;
    }

    const text = await response.text();
    const contentType = response.headers.get('content-type') || '';

    const looksLikeBloggerXml =
      text.includes('<b:skin') ||
      text.includes('<b:section') ||
      text.includes('xmlns:b=') ||
      (text.trimStart().startsWith('<?xml') && !text.includes('<!DOCTYPE html><html'));

    if (looksLikeBloggerXml) {
      res.json({
        xml: text,
        sourceUrl: parsedUrl.toString(),
        contentType,
        convertedFromLiveSite: false,
      });
      return;
    }

    if (text.includes('<html') || text.includes('<body') || contentType.includes('text/html')) {
      const convertedXml = convertLiveBlogHtmlToXml(text, parsedUrl.toString());
      const visualPreviewHtml = buildSafeVisualIframeHtml(text, parsedUrl.toString());
      res.json({
        xml: convertedXml,
        visualPreviewHtml,
        sourceUrl: parsedUrl.toString(),
        contentType,
        convertedFromLiveSite: true,
      });
      return;
    }

    res.status(422).json({
      error: 'Konten dari URL tersebut tidak dikenali sebagai template XML Blogger atau halaman web.',
    });
  } catch (err) {
    const message = err instanceof Error && err.name === 'AbortError'
      ? 'Waktu pengambilan URL habis (timeout 15 detik).'
      : err instanceof Error
        ? err.message
        : 'Terjadi kesalahan saat mengambil URL.';
    res.status(500).json({ error: message });
  }
});

const GENERIC_SIGNATURE_TOKENS = new Set([
  'widget', 'widget-content', 'section', 'blog', 'header', 'footer', 'main', 'sidebar',
  'post', 'posts', 'post-outer', 'post-title', 'post-body', 'post-meta', 'post-footer',
  'clear', 'clearfix', 'container', 'wrapper', 'content', 'title', 'description',
  'html', 'label', 'popularposts', 'pagelist', 'attribution', 'featuredpost', 'blogsearch',
  'hfeed', 'hentry', 'entry-title', 'entry-content', 'status-msg-wrap', 'jump-link',
  'active', 'selected', 'hidden', 'show', 'open', 'item', 'list', 'nav', 'menu', 'btn',
  'blog-posts', 'date-header', 'comments', 'comment', 'feed-links', 'quickedit',
  'navbar', 'no-items', 'widget-item-control', 'item-thumbnail', 'item-title',
]);

function buildSafeVisualIframeHtml(html: string, sourceUrl: string): string {
  let originBase = sourceUrl;
  try {
    const u = new URL(sourceUrl);
    originBase = `${u.origin}/`;
  } catch {
    // keep sourceUrl fallback
  }

  let safe = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<noscript\b[^>]*>|<\/noscript>/gi, '')
    .replace(/<meta\b[^>]*http-equiv=["']?(?:X-Frame-Options|Content-Security-Policy|refresh)["']?[^>]*>/gi, '')
    .replace(/<link\b[^>]*rel=["']?(?:prefetch|prerender|modulepreload|dns-prefetch|preconnect)["']?[^>]*>/gi, '')
    .replace(/\s+autoplay(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  const isolationHeadTags = [
    `<meta http-equiv="Content-Security-Policy" content="script-src 'none'; connect-src 'none'; object-src 'none'; worker-src 'none'; frame-src 'none';" />`,
    `<base href="${originBase.replace(/"/g, '&quot;')}" target="_blank" />`,
  ].join('\n');

  if (/<head\b[^>]*>/i.test(safe)) {
    safe = safe.replace(/<head\b[^>]*>/i, (m) => `${m}\n${isolationHeadTags}`);
  } else {
    safe = `${isolationHeadTags}\n${safe}`;
  }
  return safe;
}

function extractLiveBlogFingerprint(html: string, sourceUrl: string) {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const blogTitle = (titleMatch?.[1] || '').replace(/\s+/g, ' ').trim();

  const metaDescMatch =
    /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i.exec(html) ||
    /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i.exec(html);
  const metaDescription = (metaDescMatch?.[1] || '').trim();

  const canonicalMatch =
    /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']*)["'][^>]*>/i.exec(html) ||
    /<link[^>]+href=["']([^"']*)["'][^>]*rel=["']canonical["'][^>]*>/i.exec(html);
  const canonicalUrl = (canonicalMatch?.[1] || '').trim();

  const blogIdMatch =
    /(?:blogId['":\s=]+['"]?|blogger\.com\/feeds\/)(\d{12,24})/i.exec(html);
  const blogId = blogIdMatch?.[1] || '';

  const isBloggerPowered =
    /blogger\.com\/static|blogspot\.com|_WidgetManager|widget-content|data-version=/i.test(html);

  const styleBlocks: string[] = [];
  const styleBlockRegex = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let m: RegExpExecArray | null;
  while ((m = styleBlockRegex.exec(html)) !== null) {
    if (m[1]) styleBlocks.push(m[1]);
  }
  const combinedCss = styleBlocks.join('\n');
  const skinNameMatch = /(?:Template Name|Theme Name|Blogger Template Style[\s\S]{0,120}?Name)\s*:\s*([^\n\r*]+)/i.exec(
    combinedCss
  );
  const skinThemeName = (skinNameMatch?.[1] || '').trim();

  const sectionMatches: Array<{ id: string; index: number }> = [];
  const secTagRegex = /<(?:div|section|header|footer|aside|main)\b([^>]*\bclass=["'][^"']*\bsection\b[^"']*["'][^>]*)>/gi;
  while ((m = secTagRegex.exec(html)) !== null) {
    const idM = /\bid=["']([^"']+)["']/i.exec(m[1]);
    if (idM?.[1]) {
      sectionMatches.push({ id: idM[1], index: m.index });
    }
  }
  const sectionIds = Array.from(new Set(sectionMatches.map((s) => s.id)));

  const widgets: Array<{ id: string; type: string }> = [];
  const widgetPlacements: Array<{ sectionId: string; widgetId: string; widgetType: string }> = [];
  const seenWidgetIds = new Set<string>();
  const widgetTagRegex = /<div\b([^>]*\bclass=["'][^"']*\bwidget\b[^"']*["'][^>]*)>/gi;
  while ((m = widgetTagRegex.exec(html)) !== null) {
    const attrs = m[1];
    const idM = /\bid=["']([^"']+)["']/i.exec(attrs);
    const classM = /\bclass=["']([^"']+)["']/i.exec(attrs);
    const wId = idM?.[1] || '';
    if (!wId || seenWidgetIds.has(wId)) continue;
    seenWidgetIds.add(wId);
    const classes = (classM?.[1] || '').split(/\s+/).filter(Boolean);
    const widgetIdx = classes.findIndex((c) => c.toLowerCase() === 'widget');
    const wType =
      widgetIdx >= 0 && classes[widgetIdx + 1]
        ? classes[widgetIdx + 1]
        : classes.find((c) => c !== 'widget') || 'Unknown';
    widgets.push({ id: wId, type: wType });

    let parentSec = '';
    for (let i = sectionMatches.length - 1; i >= 0; i--) {
      if (sectionMatches[i].index < m.index) {
        parentSec = sectionMatches[i].id;
        break;
      }
    }
    widgetPlacements.push({ sectionId: parentSec, widgetId: wId, widgetType: wType });
  }

  const cssVarNames = new Set<string>();
  const cssVarRegex = /(--[a-zA-Z0-9_-]{2,})\s*:/g;
  while ((m = cssVarRegex.exec(html)) !== null) {
    if (cssVarNames.size >= 80) break;
    cssVarNames.add(m[1]);
  }

  const sigCounts = new Map<string, number>();
  const selectorRegex = /(?:^|[\s,}])([.#][a-zA-Z_-][a-zA-Z0-9_-]{2,})/g;
  while ((m = selectorRegex.exec(combinedCss)) !== null) {
    const tok = m[1].slice(1).toLowerCase();
    if (!GENERIC_SIGNATURE_TOKENS.has(tok)) {
      sigCounts.set(tok, (sigCounts.get(tok) || 0) + 1);
    }
  }
  const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  if (bodyMatch) {
    const attrTokRegex = /\b(?:id|class)\s*=\s*["']([^"']+)["']/gi;
    while ((m = attrTokRegex.exec(bodyMatch[1])) !== null) {
      for (const part of m[1].split(/\s+/)) {
        const cleanTok = part.trim().toLowerCase();
        if (
          cleanTok.length >= 3 &&
          !GENERIC_SIGNATURE_TOKENS.has(cleanTok) &&
          !cleanTok.includes(':')
        ) {
          sigCounts.set(cleanTok, (sigCounts.get(cleanTok) || 0) + 1);
        }
      }
    }
  }
  const themeSignatureTokens = Array.from(sigCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 120)
    .map(([tok]) => tok);

  const fontSet = new Set<string>();
  const fontCssRegex = /font-family\s*:\s*([^;}{]+)/gi;
  while ((m = fontCssRegex.exec(combinedCss)) !== null) {
    const primary = m[1].split(',')[0].replace(/["']/g, '').trim().toLowerCase();
    if (primary && !['sans-serif', 'serif', 'monospace', 'system-ui', 'inherit'].includes(primary)) {
      fontSet.add(primary);
    }
  }
  const gfRegex = /fonts\.googleapis\.com\/css2?\?[^"'\s>]+/gi;
  while ((m = gfRegex.exec(html)) !== null) {
    const famMatches = m[0].matchAll(/family=([^:&]+)/gi);
    for (const fm of famMatches) {
      try {
        fontSet.add(decodeURIComponent(fm[1].replace(/\+/g, ' ')).split(':')[0].toLowerCase().trim());
      } catch {
        // ignore
      }
    }
  }

  const footerMatch =
    /<footer\b[^>]*>([\s\S]{0,1200})<\/footer>/i.exec(html) ||
    /<div\b[^>]*id=["']footer[^"']*["'][^>]*>([\s\S]{0,1200})<\/div>/i.exec(html);
  const footerText = footerMatch
    ? footerMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)
    : '';

  const gaIds = Array.from(
    new Set(html.match(/\b(?:G-[A-Z0-9]{6,12}|UA-\d{4,10}-\d{1,4}|GTM-[A-Z0-9]{5,10})\b/g) || [])
  );
  const adsenseClients = Array.from(
    new Set(html.match(/\bca-pub-\d{10,20}\b/g) || [])
  );
  const gscMatch =
    /<meta[^>]+name=["']google-site-verification["'][^>]*content=["']([^"']+)["']/i.exec(html);

  const generatorMatch = /<meta[^>]+name=["']generator["'][^>]*content=["']([^"']+)["']/i.exec(html);

  return {
    sourceUrl,
    blogTitle,
    metaDescription,
    canonicalUrl,
    blogId,
    isBloggerPowered,
    generator: generatorMatch?.[1] || '',
    skinThemeName,
    footerText,
    sectionIds,
    widgets,
    widgetPlacements,
    cssVarNames: Array.from(cssVarNames),
    themeSignatureTokens,
    fontFamilies: Array.from(fontSet),
    gaIds,
    adsenseClients,
    gscVerification: gscMatch?.[1] || '',
  };
}

app.post('/api/compare-blogspot-url', async (req, res) => {
  try {
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    if (!rawUrl) {
      res.status(400).json({ error: 'Masukkan alamat URL Blogspot terlebih dahulu.' });
      return;
    }

    const withProtocol = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(withProtocol);
    } catch {
      res.status(400).json({ error: 'Format URL blog tidak valid.' });
      return;
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      res.status(400).json({ error: 'Hanya protokol HTTP dan HTTPS yang didukung.' });
      return;
    }

    if (isBlockedHostname(parsedUrl.hostname)) {
      res.status(403).json({ error: 'Akses ke alamat jaringan lokal tidak diizinkan.' });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(parsedUrl.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TemaLokaVerifier/1.0)',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      res.status(502).json({
        error: `Gagal membuka URL blog (${response.status} ${response.statusText}). Pastikan blog bersifat publik.`,
      });
      return;
    }

    const html = await response.text();
    const fingerprint = extractLiveBlogFingerprint(html, parsedUrl.toString());
    const visualPreviewHtml = buildSafeVisualIframeHtml(html, parsedUrl.toString());
    res.json({ fingerprint, visualPreviewHtml });
  } catch (err) {
    const message =
      err instanceof Error && err.name === 'AbortError'
        ? 'Waktu pemeriksaan URL blog habis (timeout 15 detik).'
        : err instanceof Error
          ? err.message
          : 'Gagal memeriksa alamat Blogspot.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/test-query-url', async (req, res) => {
  try {
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    if (!rawUrl) {
      res.status(400).json({ error: 'Masukkan URL lengkap beserta Query String terlebih dahulu.' });
      return;
    }
    if (rawUrl.length > 2048) {
      res.status(400).json({ error: 'URL uji terlalu panjang (maksimal 2048 karakter).' });
      return;
    }

    const withProtocol = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    let currentUrl: URL;
    try {
      currentUrl = new URL(withProtocol);
    } catch {
      res.status(400).json({ error: 'Format URL atau Query String tidak valid.' });
      return;
    }

    if (!['http:', 'https:'].includes(currentUrl.protocol)) {
      res.status(400).json({ error: 'Hanya protokol HTTP dan HTTPS yang diizinkan.' });
      return;
    }
    if (isBlockedHostname(currentUrl.hostname)) {
      res.status(403).json({ error: 'Akses ke alamat jaringan lokal atau privat tidak diizinkan.' });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const t0 = Date.now();
    let response: Response | null = null;
    let redirects = 0;

    try {
      while (redirects <= 2) {
        response = await fetch(currentUrl.toString(), {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; TemaLokaQueryTester/1.0)',
            Accept: 'application/json,text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
          },
        });

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          if (!location) break;
          const nextUrl = new URL(location, currentUrl);
          if (!['http:', 'https:'].includes(nextUrl.protocol) || isBlockedHostname(nextUrl.hostname)) {
            res.status(403).json({
              error: 'Redirect menuju protokol atau alamat jaringan yang tidak diizinkan.',
            });
            return;
          }
          currentUrl = nextUrl;
          redirects++;
          continue;
        }
        break;
      }
    } finally {
      clearTimeout(timeout);
    }

    if (!response) {
      res.status(502).json({ error: 'Tidak ada respons dari server tujuan.' });
      return;
    }

    const latencyMs = Date.now() - t0;
    const contentType = response.headers.get('content-type') || 'unknown';

    const reader = response.body?.getReader();
    let totalBytes = 0;
    const chunks: Uint8Array[] = [];
    const maxPreviewBytes = 256 * 1024;
    if (reader) {
      while (totalBytes < maxPreviewBytes) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        chunks.push(value);
        totalBytes += value.byteLength;
      }
      if (totalBytes >= maxPreviewBytes) {
        await reader.cancel().catch(() => {});
      }
    }
    const merged = new Uint8Array(Math.min(totalBytes, maxPreviewBytes));
    let offset = 0;
    for (const c of chunks) {
      const sliceLen = Math.min(c.byteLength, merged.byteLength - offset);
      if (sliceLen <= 0) break;
      merged.set(c.subarray(0, sliceLen), offset);
      offset += sliceLen;
    }
    const bodyText = new TextDecoder('utf-8', { fatal: false }).decode(merged);

    const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(bodyText);
    const pageTitle = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim().slice(0, 160) : null;

    let jsonSummary: string | null = null;
    if (/json/i.test(contentType) || bodyText.trim().startsWith('{') || bodyText.trim().startsWith('[')) {
      try {
        const parsedJson = JSON.parse(bodyText);
        if (Array.isArray(parsedJson)) {
          jsonSummary = `Array JSON (${parsedJson.length} item)`;
        } else if (parsedJson && typeof parsedJson === 'object') {
          const keys = Object.keys(parsedJson as Record<string, unknown>);
          const feedObj = (parsedJson as Record<string, unknown>).feed as
            | { entry?: unknown[]; openSearch$totalResults?: { $t?: string } }
            | undefined;
          if (feedObj && Array.isArray(feedObj.entry)) {
            jsonSummary = `Blogger JSON Feed: ${feedObj.entry.length} entri tampil${
              feedObj.openSearch$totalResults?.$t
                ? ` (Total: ${feedObj.openSearch$totalResults.$t})`
                : ''
            }`;
          } else {
            jsonSummary = `Objek JSON (${keys.slice(0, 6).join(', ')})`;
          }
        }
      } catch {
        // Non-strict JSON
      }
    }

    const queryParams = Array.from(currentUrl.searchParams.entries()).map(([key, value]) => ({
      key,
      value,
    }));

    res.json({
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      finalUrl: currentUrl.toString(),
      redirected: redirects > 0,
      contentType,
      latencyMs,
      byteSize: totalBytes,
      queryParams,
      pageTitle,
      jsonSummary,
      bodySnippet: bodyText.slice(0, 1600),
    });
  } catch (err) {
    const message =
      err instanceof Error && err.name === 'AbortError'
        ? 'Waktu uji query URL habis (timeout 12 detik).'
        : err instanceof Error
          ? err.message
          : 'Gagal menguji URL dan Query String.';
    res.status(500).json({ error: message });
  }
});

function escapeXmlEntity(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

app.post('/api/seo/submit-url', async (req, res) => {
  try {
    const rawBlogUrl = typeof req.body?.blogUrl === 'string' ? req.body.blogUrl.trim() : '';
    const rawArticleUrl = typeof req.body?.articleUrl === 'string' ? req.body.articleUrl.trim() : '';
    const indexNowKey = typeof req.body?.indexNowKey === 'string' ? req.body.indexNowKey.trim() : '';

    if (!rawBlogUrl) {
      res.status(400).json({ error: 'Masukkan URL blog publik terlebih dahulu.' });
      return;
    }

    const withProtocol = /^https?:\/\//i.test(rawBlogUrl) ? rawBlogUrl : `https://${rawBlogUrl}`;
    let parsedBlogUrl: URL;
    try {
      parsedBlogUrl = new URL(withProtocol);
    } catch {
      res.status(400).json({ error: 'Format URL blog tidak valid.' });
      return;
    }

    if (!['http:', 'https:'].includes(parsedBlogUrl.protocol)) {
      res.status(400).json({ error: 'Hanya protokol HTTP/HTTPS publik yang diizinkan.' });
      return;
    }
    if (isBlockedHostname(parsedBlogUrl.hostname)) {
      res.status(403).json({
        error: 'URL jaringan lokal/internal tidak diperbolehkan. Gunakan URL blog publik.',
      });
      return;
    }

    let targetUrl = `${parsedBlogUrl.origin}/`;
    if (rawArticleUrl) {
      const artWithProto = /^https?:\/\//i.test(rawArticleUrl)
        ? rawArticleUrl
        : `https://${rawArticleUrl}`;
      try {
        const parsedArt = new URL(artWithProto);
        if (
          ['http:', 'https:'].includes(parsedArt.protocol) &&
          !isBlockedHostname(parsedArt.hostname)
        ) {
          targetUrl = parsedArt.toString();
        }
      } catch {
        // Fallback
      }
    }

    const blogOrigin = parsedBlogUrl.origin;
    const blogHomeUrl = `${blogOrigin}/`;
    const sitemapUrl = `${blogOrigin}/sitemap.xml`;
    const robotsUrl = `${blogOrigin}/robots.txt`;
    const atomFeedUrl = `${blogOrigin}/feeds/posts/default`;
    const rssFeedUrl = `${blogOrigin}/feeds/posts/default?alt=rss`;

    const timedFetch = async (
      url: string,
      init: RequestInit = {},
      timeoutMs = 10000
    ): Promise<Response> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(url, { ...init, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    };

    interface ExternalSubmitResult {
      id: string;
      serviceName: string;
      endpointUrl: string;
      method: 'GET' | 'POST';
      ok: boolean;
      statusCode: number | null;
      latencyMs: number;
      summary: string;
    }

    let blogStatus: number | null = null;
    let sitemapStatus: number | null = null;
    let robotsStatus: number | null = null;
    let sitemapUrlCount = 0;
    let hasGoogleVerificationMeta = false;
    let liveTitle = parsedBlogUrl.hostname;

    const liveVerifyStart = Date.now();
    const [blogRes, sitemapRes, robotsRes] = await Promise.allSettled([
      timedFetch(blogHomeUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TemaLokaSeoChecker/1.0)',
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        },
      }),
      timedFetch(sitemapUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TemaLokaSeoChecker/1.0)',
          Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.8',
        },
      }),
      timedFetch(robotsUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TemaLokaSeoChecker/1.0)',
        },
      }),
    ]);

    if (blogRes.status === 'fulfilled') {
      blogStatus = blogRes.value.status;
      if (blogRes.value.ok) {
        const html = await blogRes.value.text();
        const titleM = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
        if (titleM?.[1]) liveTitle = titleM[1].replace(/\s+/g, ' ').trim();
        hasGoogleVerificationMeta =
          /name=["']google-site-verification["']/i.test(html);
      }
    }
    if (sitemapRes.status === 'fulfilled') {
      sitemapStatus = sitemapRes.value.status;
      if (sitemapRes.value.ok) {
        const smText = await sitemapRes.value.text();
        sitemapUrlCount = (smText.match(/<loc>/gi) || []).length;
      }
    }
    if (robotsRes.status === 'fulfilled') {
      robotsStatus = robotsRes.value.status;
    }

    const results: ExternalSubmitResult[] = [];

    results.push({
      id: 'live-verify',
      serviceName: 'Verifikasi Publik Live Blog & Sitemap XML',
      endpointUrl: sitemapUrl,
      method: 'GET',
      ok: Boolean(blogStatus && blogStatus < 400 && sitemapStatus && sitemapStatus < 400),
      statusCode: sitemapStatus ?? blogStatus,
      latencyMs: Date.now() - liveVerifyStart,
      summary: `Blog HTTP ${blogStatus ?? 'Gagal'} · Sitemap.xml HTTP ${sitemapStatus ?? 'Gagal'} (${sitemapUrlCount} URL ditemukan) · robots.txt HTTP ${robotsStatus ?? 'Gagal'}${hasGoogleVerificationMeta ? ' · Meta GSC terpasang' : ''}`,
    });

    const webSubStart = Date.now();
    try {
      const wsResp = await timedFetch('https://pubsubhubbub.appspot.com/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          'hub.mode': 'publish',
          'hub.url': atomFeedUrl,
        }).toString(),
      });
      const wsBody = await wsResp.text();
      results.push({
        id: 'google-websub',
        serviceName: 'Google WebSub / PubSubHubbub Hub',
        endpointUrl: 'https://pubsubhubbub.appspot.com/',
        method: 'POST',
        ok: wsResp.ok,
        statusCode: wsResp.status,
        latencyMs: Date.now() - webSubStart,
        summary: wsResp.ok
          ? `Notifikasi pembaruan feed (${atomFeedUrl}) diterima hub Google resmi (HTTP ${wsResp.status}).`
          : `Hub mengembalikan HTTP ${wsResp.status}: ${wsBody.slice(0, 140)}`,
      });
    } catch (e) {
      results.push({
        id: 'google-websub',
        serviceName: 'Google WebSub / PubSubHubbub Hub',
        endpointUrl: 'https://pubsubhubbub.appspot.com/',
        method: 'POST',
        ok: false,
        statusCode: null,
        latencyMs: Date.now() - webSubStart,
        summary: e instanceof Error ? e.message : 'Gagal menghubungi pubsubhubbub.appspot.com.',
      });
    }

    const pingStart = Date.now();
    try {
      const xmlRpcPayload = `<?xml version="1.0"?>
<methodCall>
  <methodName>weblogUpdates.extendedPing</methodName>
  <params>
    <param><value>${escapeXmlEntity(liveTitle)}</value></param>
    <param><value>${escapeXmlEntity(blogHomeUrl)}</value></param>
    <param><value>${escapeXmlEntity(targetUrl)}</value></param>
    <param><value>${escapeXmlEntity(rssFeedUrl)}</value></param>
  </params>
</methodCall>`;
      const pingResp = await timedFetch('https://rpc.pingomatic.com/', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'User-Agent': 'TemaLokaSeoSubmitter/1.0',
        },
        body: xmlRpcPayload,
      });
      const pingBody = await pingResp.text();
      const flError = /<name>flerror<\/name>\s*<value>\s*<boolean>1<\/boolean>/i.test(pingBody);
      const msgMatch = /<name>message<\/name>\s*<value>\s*(?:<string>)?([^<]+)/i.exec(pingBody);
      results.push({
        id: 'pingomatic',
        serviceName: 'Ping-O-Matic RPC (Agregator Blog Eksternal)',
        endpointUrl: 'https://rpc.pingomatic.com/',
        method: 'POST',
        ok: pingResp.ok && !flError,
        statusCode: pingResp.status,
        latencyMs: Date.now() - pingStart,
        summary: msgMatch?.[1]?.trim() || `Respon HTTP ${pingResp.status} dari rpc.pingomatic.com`,
      });
    } catch (e) {
      results.push({
        id: 'pingomatic',
        serviceName: 'Ping-O-Matic RPC (Agregator Blog Eksternal)',
        endpointUrl: 'https://rpc.pingomatic.com/',
        method: 'POST',
        ok: false,
        statusCode: null,
        latencyMs: Date.now() - pingStart,
        summary: e instanceof Error ? e.message : 'Gagal menghubungi rpc.pingomatic.com.',
      });
    }

    const wbStart = Date.now();
    const wbEndpoint = `https://web.archive.org/save/${targetUrl}`;
    try {
      const wbResp = await timedFetch(
        wbEndpoint,
        {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; TemaLokaSeoSubmitter/1.0)',
          },
        },
        12000
      );
      const contentLoc = wbResp.headers.get('content-location') || wbResp.headers.get('location') || '';
      results.push({
        id: 'wayback-save',
        serviceName: 'Internet Archive (Wayback Machine Save)',
        endpointUrl: wbEndpoint,
        method: 'GET',
        ok: wbResp.ok || wbResp.status === 302,
        statusCode: wbResp.status,
        latencyMs: Date.now() - wbStart,
        summary:
          wbResp.ok || wbResp.status === 302
            ? `Permintaan arsip halaman dikirim ke web.archive.org (HTTP ${wbResp.status}${contentLoc ? ` · ${contentLoc}` : ''}).`
            : `web.archive.org merespons HTTP ${wbResp.status}.`,
      });
    } catch (e) {
      results.push({
        id: 'wayback-save',
        serviceName: 'Internet Archive (Wayback Machine Save)',
        endpointUrl: wbEndpoint,
        method: 'GET',
        ok: false,
        statusCode: null,
        latencyMs: Date.now() - wbStart,
        summary: e instanceof Error ? e.message : 'Timeout atau gagal menghubungi web.archive.org.',
      });
    }

    if (indexNowKey) {
      const idxEndpoints = [
        { id: 'indexnow-global', name: 'IndexNow Global Hub', url: 'https://api.indexnow.org/indexnow' },
        { id: 'indexnow-bing', name: 'Microsoft Bing IndexNow', url: 'https://www.bing.com/indexnow' },
        { id: 'indexnow-yandex', name: 'Yandex IndexNow', url: 'https://yandex.com/indexnow' },
      ];
      const payload = {
        host: parsedBlogUrl.hostname,
        key: indexNowKey,
        keyLocation: `${blogOrigin}/${indexNowKey}.txt`,
        urlList: Array.from(new Set([targetUrl, blogHomeUrl])),
      };

      await Promise.all(
        idxEndpoints.map(async (ep) => {
          const st = Date.now();
          try {
            const resp = await timedFetch(ep.url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json; charset=utf-8' },
              body: JSON.stringify(payload),
            });
            const bodyTxt = await resp.text();
            results.push({
              id: ep.id,
              serviceName: ep.name,
              endpointUrl: ep.url,
              method: 'POST',
              ok: resp.ok || resp.status === 202,
              statusCode: resp.status,
              latencyMs: Date.now() - st,
              summary:
                resp.ok || resp.status === 202
                  ? `Diterima oleh ${ep.name} (HTTP ${resp.status}).`
                  : `HTTP ${resp.status}: ${(bodyTxt || 'Pastikan file kunci <key>.txt dapat diakses publik pada root domain').slice(0, 160)}`,
            });
          } catch (e) {
            results.push({
              id: ep.id,
              serviceName: ep.name,
              endpointUrl: ep.url,
              method: 'POST',
              ok: false,
              statusCode: null,
              latencyMs: Date.now() - st,
              summary: e instanceof Error ? e.message : `Gagal menghubungi ${ep.url}.`,
            });
          }
        })
      );
    }

    res.json({
      blogOrigin,
      targetUrl,
      sitemapUrl,
      atomFeedUrl,
      rssFeedUrl,
      liveVerify: {
        blogStatus,
        sitemapStatus,
        robotsStatus,
        sitemapUrlCount,
        hasGoogleVerificationMeta,
        liveTitle,
      },
      results,
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal memproses pengiriman URL ke layanan eksternal.',
    });
  }
});

// ==================== UNIFIED AI ROUTES (FREELLMAPI + GEMINI) ====================

app.post('/api/ai/quota-status', async (req, res) => {
  const verified = await resolveAiExecutionRequest(req, res, { consumeQuota: false });
  if (!verified) return;
  res.json({
    quota: verified.quota,
    model: verified.engine === 'freellm' ? verified.freellmModel : verified.geminiModel,
  });
});

app.post('/api/ai/generate-theme', async (req, res) => {
  try {
    const verified = await resolveAiExecutionRequest(req, res);
    if (!verified) return;

    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    const currentVariables = Array.isArray(req.body?.currentVariables) ? req.body.currentVariables : [];

    if (!prompt) {
      res.status(400).json({ error: 'Tuliskan deskripsi tema atau nuansa yang diinginkan.' });
      return;
    }

    const varListText = currentVariables
      .slice(0, 60)
      .map((v: { name?: string; description?: string; type?: string; value?: string }) =>
        `- ${v.name} (${v.type || 'string'}): "${v.description || ''}" = ${v.value || ''}`
      )
      .join('\n');

    const userPrompt = `Rancang tema Blogspot berdasarkan permintaan pengguna berikut:
"${prompt}"

Variabel XML yang tersedia di template saat ini:
${varListText || '(Tidak ada variabel XML khusus, gunakan palet global dan customCss)'}

Aturan desain wajib:
1. Pastikan rasio kontras teks terhadap latar belakang memenuhi WCAG AA (minimal 4.5:1).
2. Pilih kombinasi 1 font judul (headingFont) dan 1 font isi (bodyFont) dari Google Fonts seperti: Plus Jakarta Sans, DM Sans, Outfit, Bricolage Grotesque, Playfair Display, Fraunces, Lora, Manrope, JetBrains Mono.
3. Kembalikan JSON valid berisi:
   - themeName: string
   - rationale: string (Bahasa Indonesia)
   - colors: { background, surface, primary, heading, text, mutedText, link, headerBg, headerText, border } (semua hex #RRGGBB)
   - fonts: { headingFont, bodyFont, baseFontSize, lineHeight, headingWeight, borderRadius }
   - variableUpdates: [{ name, value }]
   - customCss: string (tanpa tag <style>)`;

    if (verified.engine === 'freellm') {
      const llmRes = await callFreeLlmJson<Record<string, unknown>>({
        systemInstruction:
          'Anda adalah desainer UI/UX dan pakar template XML Blogger/Blogspot profesional.',
        userPrompt,
        requestedModel: verified.freellmModel,
      });
      res.json({
        ...llmRes.data,
        modelUsed: llmRes.modelUsed,
        providerUsed: llmRes.providerUsed,
      });
      return;
    }

    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: verified.geminiModel,
      contents: userPrompt,
      config: {
        systemInstruction: 'Anda adalah desainer UI/UX dan pakar template XML Blogger/Blogspot profesional. Jawab selalu dalam JSON terstruktur sesuai skema.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            themeName: { type: Type.STRING },
            rationale: { type: Type.STRING },
            colors: {
              type: Type.OBJECT,
              properties: {
                background: { type: Type.STRING },
                surface: { type: Type.STRING },
                primary: { type: Type.STRING },
                heading: { type: Type.STRING },
                text: { type: Type.STRING },
                mutedText: { type: Type.STRING },
                link: { type: Type.STRING },
                headerBg: { type: Type.STRING },
                headerText: { type: Type.STRING },
                border: { type: Type.STRING },
              },
              required: ['background', 'surface', 'primary', 'heading', 'text', 'mutedText', 'link', 'headerBg', 'headerText', 'border'],
            },
            fonts: {
              type: Type.OBJECT,
              properties: {
                headingFont: { type: Type.STRING },
                bodyFont: { type: Type.STRING },
                baseFontSize: { type: Type.NUMBER },
                lineHeight: { type: Type.NUMBER },
                headingWeight: { type: Type.NUMBER },
                borderRadius: { type: Type.NUMBER },
              },
              required: ['headingFont', 'bodyFont', 'baseFontSize', 'lineHeight', 'headingWeight', 'borderRadius'],
            },
            variableUpdates: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  value: { type: Type.STRING },
                },
                required: ['name', 'value'],
              },
            },
            customCss: { type: Type.STRING },
          },
          required: ['themeName', 'rationale', 'colors', 'fonts', 'variableUpdates', 'customCss'],
        },
      },
    });

    const data = JSON.parse((response.text ?? '{}').trim());
    res.json({ ...data, modelUsed: verified.geminiModel, quota: verified.quota });
  } catch (err) {
    console.error('AI generate-theme error:', err);
    const formatted = getGeminiErrorResponse(err, 'Gagal menghasilkan tema AI.');
    res.status(formatted.status).json({ error: formatted.message });
  }
});

app.post('/api/ai/custom-css', async (req, res) => {
  try {
    const verified = await resolveAiExecutionRequest(req, res);
    if (!verified) return;

    const instruction = typeof req.body?.instruction === 'string' ? req.body.instruction.trim() : '';
    const currentCustomCss = typeof req.body?.currentCustomCss === 'string' ? req.body.currentCustomCss : '';
    const templateSummary = typeof req.body?.templateSummary === 'string' ? req.body.templateSummary : '';

    if (!instruction) {
      res.status(400).json({ error: 'Masukkan instruksi modifikasi tampilan terlebih dahulu.' });
      return;
    }

    const userPrompt = `Instruksi pengguna untuk memodifikasi tampilan template Blogspot:
"${instruction}"

Konteks struktur template saat ini:
${templateSummary}

CSS kustom yang sudah ada sebelumnya:
${currentCustomCss || '(Kosong)'}

Hasilkan JSON: { "css": string (tanpa <style>), "explanation": string Bahasa Indonesia }.`;

    if (verified.engine === 'freellm') {
      const llmRes = await callFreeLlmJson<Record<string, unknown>>({
        systemInstruction: 'Anda adalah front-end engineer spesialis tema Blogger/Blogspot.',
        userPrompt,
        requestedModel: verified.freellmModel,
      });
      res.json({
        ...llmRes.data,
        modelUsed: llmRes.modelUsed,
        providerUsed: llmRes.providerUsed,
      });
      return;
    }

    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: verified.geminiModel,
      contents: userPrompt,
      config: {
        systemInstruction: 'Anda adalah front-end engineer spesialis tema Blogger/Blogspot. Kembalikan JSON valid.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            css: { type: Type.STRING },
            explanation: { type: Type.STRING },
          },
          required: ['css', 'explanation'],
        },
      },
    });

    const data = JSON.parse((response.text ?? '{}').trim());
    res.json({ ...data, modelUsed: verified.geminiModel, quota: verified.quota });
  } catch (err) {
    console.error('AI custom-css error:', err);
    const formatted = getGeminiErrorResponse(err, 'Gagal membuat CSS kustom dengan AI.');
    res.status(formatted.status).json({ error: formatted.message });
  }
});

app.post('/api/ai/sample-content', async (req, res) => {
  try {
    const verified = await resolveAiExecutionRequest(req, res);
    if (!verified) return;

    const topic = typeof req.body?.topic === 'string' ? req.body.topic.trim() : '';
    if (!topic) {
      res.status(400).json({ error: 'Masukkan topik blog untuk membuat konten sampel.' });
      return;
    }

    const userPrompt = `Buat konten pratinjau blog Blogspot realistis dalam Bahasa Indonesia untuk topik "${topic}".
Kembalikan JSON dengan field:
- blogTitle, blogDescription, authorName, authorBio
- navLinks: [{ label, category }] (4 item)
- labels: [{ name, count }] (5 item)
- posts: 4 item [{ title, snippet, bodyHtml, category, readTime, date }]`;

    if (verified.engine === 'freellm') {
      const llmRes = await callFreeLlmJson<Record<string, unknown>>({
        systemInstruction: 'Anda adalah editor media dan penulis blog profesional berbahasa Indonesia.',
        userPrompt,
        requestedModel: verified.freellmModel,
      });
      res.json({
        ...llmRes.data,
        modelUsed: llmRes.modelUsed,
        providerUsed: llmRes.providerUsed,
      });
      return;
    }

    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: verified.geminiModel,
      contents: userPrompt,
      config: {
        systemInstruction: 'Anda adalah editor media dan penulis blog profesional berbahasa Indonesia.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            blogTitle: { type: Type.STRING },
            blogDescription: { type: Type.STRING },
            authorName: { type: Type.STRING },
            authorBio: { type: Type.STRING },
            navLinks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING },
                  category: { type: Type.STRING },
                },
                required: ['label'],
              },
            },
            labels: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  count: { type: Type.NUMBER },
                },
                required: ['name', 'count'],
              },
            },
            posts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  snippet: { type: Type.STRING },
                  bodyHtml: { type: Type.STRING },
                  category: { type: Type.STRING },
                  readTime: { type: Type.STRING },
                  date: { type: Type.STRING },
                },
                required: ['title', 'snippet', 'bodyHtml', 'category', 'readTime', 'date'],
              },
            },
          },
          required: ['blogTitle', 'blogDescription', 'authorName', 'authorBio', 'navLinks', 'labels', 'posts'],
        },
      },
    });

    const data = JSON.parse((response.text ?? '{}').trim());
    res.json({ ...data, modelUsed: verified.geminiModel, quota: verified.quota });
  } catch (err) {
    console.error('AI sample-content error:', err);
    const formatted = getGeminiErrorResponse(err, 'Gagal membuat konten sampel dengan AI.');
    res.status(formatted.status).json({ error: formatted.message });
  }
});

app.post('/api/ai/diagnose-xml', async (req, res) => {
  try {
    const verified = await resolveAiExecutionRequest(req, res);
    if (!verified) return;

    const xmlSnippet = typeof req.body?.xmlSnippet === 'string' ? req.body.xmlSnippet.slice(0, 24000) : '';
    const stats = req.body?.stats || {};

    if (!xmlSnippet) {
      res.status(400).json({ error: 'Tidak ada kode XML untuk dianalisis.' });
      return;
    }

    const userPrompt = `Audit struktur dan kualitas template XML Blogger berikut.
Statistik: Variables=${stats.variables ?? 0}, b:section=${stats.sections ?? 0}, b:widget=${stats.widgets ?? 0}, Viewport=${stats.hasViewportMeta ? 'Ada' : 'Tidak ada'}, b:skin=${stats.hasSkin ? 'Ada' : 'Tidak ada'}.
Cuplikan XML:
${xmlSnippet}

Kembalikan JSON: { "summary": string, "items": [{ "category": string, "severity": "good"|"warning"|"fixable", "title": string, "detail": string }], "suggestedCssFix": string }`;

    if (verified.engine === 'freellm') {
      const llmRes = await callFreeLlmJson<Record<string, unknown>>({
        systemInstruction: 'Anda adalah arsitek template Blogger/Blogspot yang fokus pada performa, responsivitas, dan keterbacaan.',
        userPrompt,
        requestedModel: verified.freellmModel,
      });
      res.json({
        ...llmRes.data,
        modelUsed: llmRes.modelUsed,
        providerUsed: llmRes.providerUsed,
      });
      return;
    }

    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: verified.geminiModel,
      contents: userPrompt,
      config: {
        systemInstruction: 'Anda adalah arsitek template Blogger/Blogspot yang fokus pada performa, responsivitas, dan keterbacaan.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  category: { type: Type.STRING },
                  severity: { type: Type.STRING },
                  title: { type: Type.STRING },
                  detail: { type: Type.STRING },
                },
                required: ['category', 'severity', 'title', 'detail'],
              },
            },
            suggestedCssFix: { type: Type.STRING },
          },
          required: ['summary', 'items', 'suggestedCssFix'],
        },
      },
    });

    const data = JSON.parse((response.text ?? '{}').trim());
    res.json({ ...data, modelUsed: verified.geminiModel, quota: verified.quota });
  } catch (err) {
    console.error('AI diagnose-xml error:', err);
    const formatted = getGeminiErrorResponse(err, 'Gagal menganalisis template XML.');
    res.status(formatted.status).json({ error: formatted.message });
  }
});

app.post('/api/ai/detect-ai-signature', async (req, res) => {
  try {
    const verified = await resolveAiExecutionRequest(req, res);
    if (!verified) return;

    const xmlExcerpt =
      typeof req.body?.xmlExcerpt === 'string' ? req.body.xmlExcerpt.slice(0, 22000) : '';
    const staticSummary =
      typeof req.body?.staticSummary === 'string' ? req.body.staticSummary.slice(0, 2000) : '';

    if (!xmlExcerpt.trim()) {
      res.status(400).json({ error: 'Tidak ada cuplikan template XML untuk dianalisis.' });
      return;
    }

    const userPrompt = `Periksa apakah template XML ini dibuat/ditandatangani oleh AI.
Ringkasan pemindaian awal: ${staticSummary || 'Belum ada.'}
Cuplikan XML:
${xmlExcerpt}

Kembalikan JSON: { "isAiSigned": boolean, "confidenceScore": number, "verdictLabel": string, "detectedTools": string[], "reasoning": string, "extraSignatures": [{ "snippet": string, "reason": string, "suspectedTool": string, "zone": string }] }`;

    if (verified.engine === 'freellm') {
      const llmRes = await callFreeLlmJson<Record<string, unknown>>({
        systemInstruction: 'Anda adalah analis forensik kode XML Blogger yang objektif.',
        userPrompt,
        requestedModel: verified.freellmModel,
      });
      res.json({
        ...llmRes.data,
        modelUsed: llmRes.modelUsed,
        providerUsed: llmRes.providerUsed,
      });
      return;
    }

    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: verified.geminiModel,
      contents: userPrompt,
      config: {
        systemInstruction:
          'Anda adalah analis forensik kode XML Blogger yang objektif. Hanya kutip snippet yang benar-benar muncul pada cuplikan XML yang diberikan.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isAiSigned: { type: Type.BOOLEAN },
            confidenceScore: { type: Type.NUMBER },
            verdictLabel: { type: Type.STRING },
            detectedTools: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            reasoning: { type: Type.STRING },
            extraSignatures: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  snippet: { type: Type.STRING },
                  reason: { type: Type.STRING },
                  suspectedTool: { type: Type.STRING },
                  zone: { type: Type.STRING },
                },
                required: ['snippet', 'reason', 'suspectedTool', 'zone'],
              },
            },
          },
          required: [
            'isAiSigned',
            'confidenceScore',
            'verdictLabel',
            'detectedTools',
            'reasoning',
            'extraSignatures',
          ],
        },
      },
    });

    const data = JSON.parse((response.text ?? '{}').trim());
    res.json({ ...data, modelUsed: verified.geminiModel, quota: verified.quota });
  } catch (err) {
    console.error('AI detect-ai-signature error:', err);
    const formatted = getGeminiErrorResponse(err, 'Gagal menjalankan analisis forensik tanda tangan AI.');
    res.status(formatted.status).json({ error: formatted.message });
  }
});

app.post('/api/ai/feature-audit', async (req, res) => {
  try {
    const verified = await resolveAiExecutionRequest(req, res);
    if (!verified) return;

    const page = typeof req.body?.page === 'string' ? req.body.page.slice(0, 32) : 'preview';
    const contextSummary =
      typeof req.body?.contextSummary === 'string' ? req.body.contextSummary.slice(0, 12000) : '';

    if (!contextSummary.trim()) {
      res.status(400).json({ error: 'Ringkasan konteks template tidak tersedia.' });
      return;
    }

    const userPrompt = `Anda adalah asisten pakar TemaLoka untuk tab "${page}".
Berikan ringkasan audit singkat, 3-4 poin temuan & saran perbaikan konkret Bahasa Indonesia, dan opsional CSS perbaikan responsif.
Konteks Template:
${contextSummary}
Kembalikan JSON: { "summary": string, "highlights": string[], "suggestedCss": string }`;

    if (verified.engine === 'freellm') {
      const llmRes = await callFreeLlmJson<{
        summary?: string;
        highlights?: string[];
        suggestedCss?: string;
      }>({
        systemInstruction: 'Anda adalah konsultan teknis template Blogger XML (Blogspot).',
        userPrompt,
        requestedModel: verified.freellmModel,
      });
      res.json({
        page,
        engineLabel: `${llmRes.providerUsed} (${llmRes.modelUsed})`,
        summary: llmRes.data.summary || 'Analisis FreeLLMAPI selesai.',
        highlights: Array.isArray(llmRes.data.highlights) ? llmRes.data.highlights : [],
        suggestedCss:
          typeof llmRes.data.suggestedCss === 'string' && llmRes.data.suggestedCss.trim()
            ? llmRes.data.suggestedCss.trim()
            : undefined,
      });
      return;
    }

    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: verified.geminiModel,
      contents: userPrompt,
      config: {
        systemInstruction:
          'Anda adalah konsultan teknis template Blogger XML (Blogspot). Jawab ringkas, akurat, dalam JSON valid.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            highlights: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            suggestedCss: { type: Type.STRING },
          },
          required: ['summary', 'highlights'],
        },
      },
    });

    const data = JSON.parse((response.text ?? '{}').trim());
    res.json({
      page,
      engineLabel: `Gemini (${verified.geminiModel})`,
      summary: data.summary || 'Analisis Gemini selesai.',
      highlights: Array.isArray(data.highlights) ? data.highlights : [],
      suggestedCss: typeof data.suggestedCss === 'string' && data.suggestedCss.trim() ? data.suggestedCss.trim() : undefined,
      quota: verified.quota,
    });
  } catch (err) {
    console.error('AI feature-audit error:', err);
    const formatted = getGeminiErrorResponse(err, 'Gagal menjalankan audit fitur dengan AI.');
    res.status(formatted.status).json({ error: formatted.message });
  }
});

app.post('/api/ai/chat', async (req, res) => {
  try {
    const verified = await resolveAiExecutionRequest(req, res);
    if (!verified) return;

    const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 8000) : '';
    const activePage = typeof req.body?.activePage === 'string' ? req.body.activePage.slice(0, 32) : 'preview';
    const templateContext =
      typeof req.body?.templateContext === 'string' ? req.body.templateContext.slice(0, 80000) : '';
    const rawHistory = Array.isArray(req.body?.history) ? req.body.history : [];
    const rawAttachedParts = Array.isArray(req.body?.attachedParts) ? req.body.attachedParts : [];

    if (!message) {
      res.status(400).json({ error: 'Tuliskan pertanyaan atau perintah untuk AI terlebih dahulu.' });
      return;
    }

    const MAX_ATTACHED_TOTAL_CHARS = 1_500_000;
    let totalAttachedChars = 0;
    const attachedBlocks: string[] = [];
    for (let i = 0; i < rawAttachedParts.length && i < 60; i++) {
      const part = rawAttachedParts[i] as {
        index?: number;
        total?: number;
        filename?: string;
        title?: string;
        lineCount?: number;
        byteSize?: number;
        content?: string;
      };
      if (!part || typeof part.content !== 'string' || !part.content) continue;
      if (totalAttachedChars + part.content.length > MAX_ATTACHED_TOTAL_CHARS) {
        res.status(413).json({
          error: 'Total lampiran bagian XML melebihi batas sekali kirim (~1.5 MB teks). Pilih sebagian bagian XML lalu kirim bertahap.',
        });
        return;
      }
      totalAttachedChars += part.content.length;
      const partIdx = typeof part.index === 'number' ? part.index : i + 1;
      const partTot = typeof part.total === 'number' ? part.total : rawAttachedParts.length;
      const fileLabel = typeof part.filename === 'string' ? part.filename.slice(0, 140) : `bagian-${partIdx}.xml`;
      const titleLabel = typeof part.title === 'string' ? part.title.slice(0, 140) : `Bagian #${partIdx}`;
      const lineInfo = typeof part.lineCount === 'number' ? `${part.lineCount} baris` : '';
      const kbInfo = typeof part.byteSize === 'number' ? `${(part.byteSize / 1024).toFixed(1)} KB` : '';
      const metaParen = [lineInfo, kbInfo].filter(Boolean).join(', ');
      attachedBlocks.push(
        `--- BAGIAN #${partIdx}/${partTot} | ${fileLabel} | ${titleLabel}${metaParen ? ` (${metaParen})` : ''} ---\n${part.content}\n--- AKHIR BAGIAN #${partIdx}/${partTot} ---`
      );
    }

    const attachedSection =
      attachedBlocks.length > 0
        ? `\n\n=== LAMPIRAN BAGIAN XML UTUH (${attachedBlocks.length} BAGIAN) ===\n${attachedBlocks.join('\n\n')}\n=== AKHIR LAMPIRAN ===`
        : '';

    const systemInstruction =
      'Anda adalah Asisten AI resmi di dalam studio TemaLoka (editor & inspector template XML Blogspot/Blogger). ' +
      'Jawab dalam Bahasa Indonesia yang jelas, terstruktur, dan langsung merujuk ke detail template XML aktif (nama section, widget, variable, CSS, JS, parameter URL, SEO/AdSense, atau error XML) bila tersedia. ' +
      'Jika pengguna meminta perbaikan CSS atau gaya tampilan, sertakan kode CSS bersih di dalam blok ```css ... ``` (tanpa tag <style>) agar bisa diterapkan dengan satu klik.';

    if (verified.engine === 'freellm') {
      const llmHistory = rawHistory
        .slice(-8)
        .map((item: { role?: string; content?: string }) => ({
          role: (item?.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
          content: typeof item?.content === 'string' ? item.content.slice(0, 2000) : '',
        }))
        .filter((h: { content: string }) => Boolean(h.content));

      const llmRes = await callFreeLlmChat({
        systemInstruction,
        history: llmHistory,
        requestedModel: verified.freellmModel,
        userPrompt: `Tab aktif: ${activePage}\nKonteks template XML:\n${templateContext.slice(0, 18000)}${attachedSection.slice(0, 32000)}\n\nPertanyaan Pengguna:\n${message}`,
      });

      const cssMatch = /```css\s*([\s\S]*?)```/i.exec(llmRes.text);
      res.json({
        reply: llmRes.text,
        suggestedCss: cssMatch?.[1]?.trim() || undefined,
        engineLabel: `${llmRes.providerUsed} (${llmRes.modelUsed})`,
        modelId: llmRes.modelUsed,
      });
      return;
    }

    const historyLines = rawHistory
      .slice(-10)
      .map((item: { role?: string; content?: string }) => {
        const roleLabel = item?.role === 'assistant' ? 'Asisten' : 'Pengguna';
        const text = typeof item?.content === 'string' ? item.content.slice(0, 1500) : '';
        return text ? `${roleLabel}: ${text}` : '';
      })
      .filter(Boolean)
      .join('\n\n');

    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: verified.geminiModel,
      contents: `Tab aktif pengguna saat ini: ${activePage}

Ringkasan & konteks template XML Blogger yang sedang dibuka:
${templateContext || '(Belum ada konteks XML khusus)'}${attachedSection}

${historyLines ? `Riwayat percakapan sebelumnya:\n${historyLines}\n\n` : ''}Pertanyaan / Perintah Terbaru Pengguna:
${message}`,
      config: {
        systemInstruction,
      },
    });

    const reply = (response.text ?? '').trim() || 'Maaf, tidak ada jawaban teks yang dihasilkan.';
    const cssMatch = /```css\s*([\s\S]*?)```/i.exec(reply);
    const suggestedCss = cssMatch?.[1]?.trim() || undefined;

    res.json({
      reply,
      suggestedCss,
      engineLabel: `Gemini (${verified.geminiModel})`,
      modelId: verified.geminiModel,
      quota: verified.quota,
    });
  } catch (err) {
    console.error('AI chat error:', err);
    const formatted = getGeminiErrorResponse(err, 'Gagal memproses pesan Chat AI.');
    res.status(formatted.status).json({ error: formatted.message });
  }
});

// ==================== DYNAMIC ADS.TXT, ROBOTS.TXT & SITEMAP.XML (FROM D1) ====================

interface AdsTxtCacheEntry {
  content: string;
  expiresAt: number;
}

let adsTxtCache: AdsTxtCacheEntry | null = null;
const ADS_TXT_CACHE_TTL_MS = 10_000;

function extractPubDigitsFromPublisherId(raw: string): string {
  const digits = raw.replace(/\D+/g, '');
  if (digits.length >= 10 && digits.length <= 24) {
    return `pub-${digits}`;
  }
  return '';
}

async function resolveDynamicAdsTxt(): Promise<string> {
  if (adsTxtCache && adsTxtCache.expiresAt > Date.now()) {
    return adsTxtCache.content;
  }

  const fallbackDisabled = '# ads.txt belum dikonfigurasi di Panel Admin (/?admin).\n';
  try {
    const cfg = await getSiteAdsenseConfig();
    const rawAdsTxt = (cfg.adsTxtContent || '').replace(/\r\n?/g, '\n').trim();
    const rawPubId = (cfg.publisherId || '').trim();

    let resolved = fallbackDisabled;
    if (!cfg.adsenseEnabled) {
      resolved = '# AdSense saat ini dinonaktifkan oleh admin di Pengaturan Admin (/?admin).\n';
    } else if (rawAdsTxt) {
      resolved = `${rawAdsTxt}\n`;
    } else {
      const pubToken = extractPubDigitsFromPublisherId(rawPubId);
      if (pubToken) {
        resolved = `google.com, ${pubToken}, DIRECT, f08c47fec0942fa0\n`;
      }
    }

    adsTxtCache = {
      content: resolved,
      expiresAt: Date.now() + ADS_TXT_CACHE_TTL_MS,
    };
    return resolved;
  } catch {
    return adsTxtCache?.content ?? fallbackDisabled;
  }
}

app.get('/ads.txt', async (_req, res) => {
  const content = await resolveDynamicAdsTxt();
  res.setHeader('Cache-Control', 'public, max-age=15');
  res.type('text/plain; charset=utf-8').send(content);
});

app.get('/robots.txt', async (req, res) => {
  try {
    const seo = await getSiteSeoConfig();
    const origin =
      seo.canonicalOrigin ||
      `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
    let txt = (seo.robotsTxtContent || 'User-agent: *\nAllow: /\n').trim();
    if (seo.sitemapEnabled && !/sitemap:/i.test(txt)) {
      txt = `${txt}\nSitemap: ${origin.replace(/\/+$/, '')}/sitemap.xml\n`;
    } else {
      txt = `${txt}\n`;
    }
    res.setHeader('Cache-Control', 'public, max-age=30');
    res.type('text/plain; charset=utf-8').send(txt);
  } catch {
    res.type('text/plain; charset=utf-8').send('User-agent: *\nAllow: /\n');
  }
});

app.get('/sitemap.xml', async (req, res) => {
  try {
    const seo = await getSiteSeoConfig();
    if (!seo.sitemapEnabled) {
      res.status(404).type('text/plain').send('Sitemap dinonaktifkan oleh admin.');
      return;
    }
    const origin = (
      seo.canonicalOrigin || `${req.protocol}://${req.get('host') || 'localhost:3000'}`
    ).replace(/\/+$/, '');
    const lastmod = new Date().toISOString().slice(0, 10);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${escapeXmlEntity(origin)}/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>\n`;
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.type('application/xml; charset=utf-8').send(xml);
  } catch {
    res.status(500).type('text/plain').send('Gagal menghasilkan sitemap.xml.');
  }
});

async function startServer() {
  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: !hmrDisabled,
        ws: hmrDisabled ? false : { server: httpServer },
      },
      appType: 'spa',
    });

    if (hmrDisabled) {
      app.get('/@vite/client', async (_req, res, next) => {
        try {
          const result = await vite.transformRequest('/@vite/client');
          if (!result) return next();
          const code = result.code
            .replace(
              'transport.connect(createHMRHandler(handleMessage));',
              '/* HMR WebSocket disabled */'
            )
            .replace(
              'else throw new SendBeforeConnectError("send was called before connect");',
              'else return; /* HMR disabled */'
            )
            .replace(
              'else throw new SendBeforeConnectError("invoke was called before connect");',
              'else return; /* HMR disabled */'
            );
          res.type('application/javascript').send(code);
        } catch (err) {
          next(err);
        }
      });

      app.get('/@vite-plugin-pwa/pwa-entry-point-loaded', (_req, res) => {
        res
          .type('application/javascript')
          .send(
            'export default function registerDevSW() {\n  /* HMR disabled: service worker is registered via virtual:pwa-register */\n}\n'
          );
      });
    }

    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`TemaLoka server running at http://0.0.0.0:${PORT} [DB=${getActiveDbMode()}]`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
