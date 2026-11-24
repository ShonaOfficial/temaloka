import OpenAI from 'openai';
import type {
  FreeLlmAdminConfigView,
  FreeLlmPublicStatus,
  FreeLlmRoutingStrategy,
  FreeLlmUpdatePayload,
} from '../types/admin';
import {
  dbGet,
  dbRun,
  decryptSecretPayload,
  encryptSecretPayload,
  maskSecret,
} from './d1Database';
import { getEffectiveGeminiApiKey } from './googleCloudService';

export interface StoredFreeLlmSecrets {
  enabled: boolean;
  baseUrl: string;
  defaultModel: string;
  routingStrategy: FreeLlmRoutingStrategy;
  timeoutMs: number;
  maxTokens: number;
  temperature: number;
  allowForGuests: boolean;
  gatewayToken: string;
  groqApiKey: string;
  cerebrasApiKey: string;
  openRouterApiKey: string;
  mistralApiKey: string;
  nvidiaApiKey: string;
  cloudflareAiAccountId: string;
  cloudflareAiToken: string;
  geminiCompatApiKey: string;
  updatedAtMs: number;
}

const SECRET_KEY = 'freellm_credentials';

function defaultFreeLlmSecrets(): StoredFreeLlmSecrets {
  return {
    enabled: true,
    baseUrl: (process.env.FREELLMAPI_BASE_URL || '').trim(),
    defaultModel: (process.env.FREELLMAPI_MODEL || 'auto').trim(),
    routingStrategy: 'auto',
    timeoutMs: 25000,
    maxTokens: 2048,
    temperature: 0.4,
    allowForGuests: true,
    gatewayToken: (process.env.FREELLMAPI_API_KEY || '').trim(),
    groqApiKey: (process.env.GROQ_API_KEY || '').trim(),
    cerebrasApiKey: (process.env.CEREBRAS_API_KEY || '').trim(),
    openRouterApiKey: (process.env.OPENROUTER_API_KEY || '').trim(),
    mistralApiKey: (process.env.MISTRAL_API_KEY || '').trim(),
    nvidiaApiKey: (process.env.NVIDIA_API_KEY || '').trim(),
    cloudflareAiAccountId: (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim(),
    cloudflareAiToken: (process.env.CLOUDFLARE_AI_TOKEN || '').trim(),
    geminiCompatApiKey: '',
    updatedAtMs: 0,
  };
}

export async function loadFreeLlmConfig(): Promise<StoredFreeLlmSecrets> {
  const base = defaultFreeLlmSecrets();
  try {
    const row = await dbGet<{ encrypted_json: string }>(
      'SELECT encrypted_json FROM server_secrets WHERE key = ?',
      [SECRET_KEY]
    );
    if (!row?.encrypted_json) return base;
    const dec = decryptSecretPayload<Partial<StoredFreeLlmSecrets>>(row.encrypted_json);
    if (!dec) return base;
    return {
      ...base,
      enabled: typeof dec.enabled === 'boolean' ? dec.enabled : base.enabled,
      baseUrl: typeof dec.baseUrl === 'string' ? dec.baseUrl : base.baseUrl,
      defaultModel: typeof dec.defaultModel === 'string' && dec.defaultModel.trim() ? dec.defaultModel : base.defaultModel,
      routingStrategy:
        dec.routingStrategy === 'auto:fastest' ||
        dec.routingStrategy === 'auto:smartest' ||
        dec.routingStrategy === 'balanced'
          ? dec.routingStrategy
          : 'auto',
      timeoutMs: typeof dec.timeoutMs === 'number' && dec.timeoutMs >= 3000 ? dec.timeoutMs : base.timeoutMs,
      maxTokens: typeof dec.maxTokens === 'number' && dec.maxTokens >= 256 ? dec.maxTokens : base.maxTokens,
      temperature: typeof dec.temperature === 'number' ? Math.min(1.5, Math.max(0, dec.temperature)) : base.temperature,
      allowForGuests: typeof dec.allowForGuests === 'boolean' ? dec.allowForGuests : true,
      gatewayToken: typeof dec.gatewayToken === 'string' ? dec.gatewayToken : base.gatewayToken,
      groqApiKey: typeof dec.groqApiKey === 'string' ? dec.groqApiKey : base.groqApiKey,
      cerebrasApiKey: typeof dec.cerebrasApiKey === 'string' ? dec.cerebrasApiKey : base.cerebrasApiKey,
      openRouterApiKey: typeof dec.openRouterApiKey === 'string' ? dec.openRouterApiKey : base.openRouterApiKey,
      mistralApiKey: typeof dec.mistralApiKey === 'string' ? dec.mistralApiKey : base.mistralApiKey,
      nvidiaApiKey: typeof dec.nvidiaApiKey === 'string' ? dec.nvidiaApiKey : base.nvidiaApiKey,
      cloudflareAiAccountId:
        typeof dec.cloudflareAiAccountId === 'string' ? dec.cloudflareAiAccountId : base.cloudflareAiAccountId,
      cloudflareAiToken:
        typeof dec.cloudflareAiToken === 'string' ? dec.cloudflareAiToken : base.cloudflareAiToken,
      geminiCompatApiKey: typeof dec.geminiCompatApiKey === 'string' ? dec.geminiCompatApiKey : '',
      updatedAtMs: typeof dec.updatedAtMs === 'number' ? dec.updatedAtMs : 0,
    };
  } catch {
    return base;
  }
}

export async function saveFreeLlmConfig(patch: FreeLlmUpdatePayload): Promise<FreeLlmAdminConfigView> {
  const cur = await loadFreeLlmConfig();
  const cleanUrl = patch.baseUrl.trim().replace(/\/+$/, '');
  if (cleanUrl) {
    let parsed: URL;
    try {
      parsed = new URL(cleanUrl);
    } catch {
      throw new Error('Format Base URL FreeLLMAPI tidak valid.');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Base URL FreeLLMAPI harus memakai protokol HTTP/HTTPS.');
    }
    if (parsed.hostname === '169.254.169.254') {
      throw new Error('Alamat metadata internal tidak diizinkan.');
    }
  }

  const next: StoredFreeLlmSecrets = {
    enabled: Boolean(patch.enabled),
    baseUrl: cleanUrl,
    defaultModel: (patch.defaultModel || 'auto').trim().slice(0, 120),
    routingStrategy: patch.routingStrategy || 'auto',
    timeoutMs: Math.min(60000, Math.max(3000, Number(patch.timeoutMs) || 25000)),
    maxTokens: Math.min(8192, Math.max(256, Number(patch.maxTokens) || 2048)),
    temperature: Math.min(1.5, Math.max(0, Number(patch.temperature) || 0.4)),
    allowForGuests: Boolean(patch.allowForGuests),
    gatewayToken: patch.clearGatewayToken
      ? ''
      : typeof patch.gatewayToken === 'string' && patch.gatewayToken.trim()
        ? patch.gatewayToken.trim()
        : cur.gatewayToken,
    groqApiKey:
      typeof patch.groqApiKey === 'string' && patch.groqApiKey.trim()
        ? patch.groqApiKey.trim()
        : cur.groqApiKey,
    cerebrasApiKey:
      typeof patch.cerebrasApiKey === 'string' && patch.cerebrasApiKey.trim()
        ? patch.cerebrasApiKey.trim()
        : cur.cerebrasApiKey,
    openRouterApiKey:
      typeof patch.openRouterApiKey === 'string' && patch.openRouterApiKey.trim()
        ? patch.openRouterApiKey.trim()
        : cur.openRouterApiKey,
    mistralApiKey:
      typeof patch.mistralApiKey === 'string' && patch.mistralApiKey.trim()
        ? patch.mistralApiKey.trim()
        : cur.mistralApiKey,
    nvidiaApiKey:
      typeof patch.nvidiaApiKey === 'string' && patch.nvidiaApiKey.trim()
        ? patch.nvidiaApiKey.trim()
        : cur.nvidiaApiKey,
    cloudflareAiAccountId:
      typeof patch.cloudflareAiAccountId === 'string'
        ? patch.cloudflareAiAccountId.trim()
        : cur.cloudflareAiAccountId,
    cloudflareAiToken:
      typeof patch.cloudflareAiToken === 'string' && patch.cloudflareAiToken.trim()
        ? patch.cloudflareAiToken.trim()
        : cur.cloudflareAiToken,
    geminiCompatApiKey:
      typeof patch.geminiCompatApiKey === 'string' && patch.geminiCompatApiKey.trim()
        ? patch.geminiCompatApiKey.trim()
        : cur.geminiCompatApiKey,
    updatedAtMs: Date.now(),
  };

  await dbRun(
    `INSERT INTO server_secrets (key, encrypted_json, updated_at_ms)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET encrypted_json=excluded.encrypted_json, updated_at_ms=excluded.updated_at_ms`,
    [SECRET_KEY, encryptSecretPayload(next), next.updatedAtMs]
  );

  return toFreeLlmAdminView(next);
}

export function toFreeLlmAdminView(c: StoredFreeLlmSecrets): FreeLlmAdminConfigView {
  return {
    enabled: c.enabled,
    baseUrl: c.baseUrl,
    defaultModel: c.defaultModel,
    routingStrategy: c.routingStrategy,
    timeoutMs: c.timeoutMs,
    maxTokens: c.maxTokens,
    temperature: c.temperature,
    allowForGuests: c.allowForGuests,
    hasGatewayToken: Boolean(c.gatewayToken),
    gatewayTokenMasked: maskSecret(c.gatewayToken),
    hasGroqKey: Boolean(c.groqApiKey),
    hasCerebrasKey: Boolean(c.cerebrasApiKey),
    hasOpenRouterKey: Boolean(c.openRouterApiKey),
    hasMistralKey: Boolean(c.mistralApiKey),
    hasNvidiaKey: Boolean(c.nvidiaApiKey),
    hasCloudflareAiKey: Boolean(c.cloudflareAiToken && c.cloudflareAiAccountId),
    cloudflareAiAccountId: c.cloudflareAiAccountId,
    hasGeminiCompatKey: Boolean(c.geminiCompatApiKey || getEffectiveGeminiApiKey()),
    updatedAtMs: c.updatedAtMs,
  };
}

export function getFreeLlmPublicStatus(c: StoredFreeLlmSecrets): FreeLlmPublicStatus {
  const configuredProviders: string[] = [];
  if (c.baseUrl) configuredProviders.push('FreeLLMAPI Gateway');
  if (c.groqApiKey) configuredProviders.push('Groq');
  if (c.cerebrasApiKey) configuredProviders.push('Cerebras');
  if (c.openRouterApiKey) configuredProviders.push('OpenRouter');
  if (c.mistralApiKey) configuredProviders.push('Mistral');
  if (c.nvidiaApiKey) configuredProviders.push('NVIDIA NIM');
  if (c.cloudflareAiToken && c.cloudflareAiAccountId) configuredProviders.push('Cloudflare AI');
  if (c.geminiCompatApiKey || getEffectiveGeminiApiKey()) configuredProviders.push('Gemini OpenAI-Compat');

  return {
    enabled: c.enabled,
    defaultModel: c.defaultModel || 'auto',
    routingStrategy: c.routingStrategy,
    allowForGuests: c.allowForGuests,
    configuredProviders,
  };
}

interface ProviderCandidate {
  id: string;
  label: string;
  baseURL: string;
  apiKey: string;
  model: string;
  priority: number;
}

function buildProviderCandidates(
  cfg: StoredFreeLlmSecrets,
  requestedModel?: string
): ProviderCandidate[] {
  const strategy =
    requestedModel && requestedModel.startsWith('auto')
      ? requestedModel
      : cfg.routingStrategy || 'auto';
  const explicitModel =
    requestedModel && !requestedModel.startsWith('auto') ? requestedModel : '';

  const list: ProviderCandidate[] = [];

  if (cfg.baseUrl.trim()) {
    list.push({
      id: 'freellmapi-gateway',
      label: 'FreeLLMAPI Gateway',
      baseURL: cfg.baseUrl.trim(),
      apiKey: cfg.gatewayToken.trim() || 'freellmapi-internal',
      model: requestedModel || cfg.defaultModel || 'auto',
      priority: 1,
    });
  }

  if (cfg.groqApiKey) {
    list.push({
      id: 'groq',
      label: 'FreeLLMAPI · Groq',
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey: cfg.groqApiKey,
      model:
        explicitModel ||
        (strategy === 'auto:fastest' ? 'llama-3.1-8b-instant' : 'llama-3.3-70b-versatile'),
      priority: strategy === 'auto:fastest' ? 2 : 3,
    });
  }

  if (cfg.cerebrasApiKey) {
    list.push({
      id: 'cerebras',
      label: 'FreeLLMAPI · Cerebras',
      baseURL: 'https://api.cerebras.ai/v1',
      apiKey: cfg.cerebrasApiKey,
      model: explicitModel || 'llama3.3-70b',
      priority: strategy === 'auto:fastest' ? 2 : 4,
    });
  }

  if (cfg.openRouterApiKey) {
    list.push({
      id: 'openrouter',
      label: 'FreeLLMAPI · OpenRouter',
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: cfg.openRouterApiKey,
      model: explicitModel || 'meta-llama/llama-3.3-70b-instruct:free',
      priority: strategy === 'auto:smartest' ? 2 : 5,
    });
  }

  if (cfg.mistralApiKey) {
    list.push({
      id: 'mistral',
      label: 'FreeLLMAPI · Mistral',
      baseURL: 'https://api.mistral.ai/v1',
      apiKey: cfg.mistralApiKey,
      model: explicitModel || 'mistral-small-latest',
      priority: 6,
    });
  }

  if (cfg.nvidiaApiKey) {
    list.push({
      id: 'nvidia',
      label: 'FreeLLMAPI · NVIDIA NIM',
      baseURL: 'https://integrate.api.nvidia.com/v1',
      apiKey: cfg.nvidiaApiKey,
      model: explicitModel || 'meta/llama-3.3-70b-instruct',
      priority: strategy === 'auto:smartest' ? 3 : 7,
    });
  }

  if (cfg.cloudflareAiAccountId && cfg.cloudflareAiToken) {
    list.push({
      id: 'cloudflare-ai',
      label: 'FreeLLMAPI · Cloudflare Workers AI',
      baseURL: `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cfg.cloudflareAiAccountId)}/ai/v1`,
      apiKey: cfg.cloudflareAiToken,
      model: explicitModel || '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      priority: 8,
    });
  }

  const geminiKey = cfg.geminiCompatApiKey || getEffectiveGeminiApiKey();
  if (geminiKey) {
    list.push({
      id: 'gemini-openai-compat',
      label: 'FreeLLMAPI · Internal Web Failover',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      apiKey: geminiKey,
      model: 'gemini-2.5-flash',
      priority: 15,
    });
  }

  return list.sort((a, b) => a.priority - b.priority);
}

export async function callFreeLlmChat(options: {
  systemInstruction: string;
  userPrompt: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  requestedModel?: string;
  jsonMode?: boolean;
}): Promise<{
  text: string;
  providerUsed: string;
  modelUsed: string;
}> {
  const cfg = await loadFreeLlmConfig();
  if (!cfg.enabled) {
    throw new Error('Mesin FreeLLMAPI internal sedang dinonaktifkan di Panel Admin.');
  }

  const candidates = buildProviderCandidates(cfg, options.requestedModel);
  if (candidates.length === 0) {
    throw new Error(
      'Belum ada gateway atau provider API key FreeLLMAPI yang terkonfigurasi. Atur di Panel Admin (/?admin -> FreeLLMAPI & AI).'
    );
  }

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: options.systemInstruction },
  ];

  if (Array.isArray(options.history)) {
    for (const h of options.history.slice(-8)) {
      if (!h?.content) continue;
      messages.push({
        role: h.role === 'assistant' ? 'assistant' : 'user',
        content: h.content.slice(0, 4000),
      });
    }
  }
  messages.push({ role: 'user', content: options.userPrompt });

  const errors: string[] = [];

  for (const cand of candidates) {
    try {
      const client = new OpenAI({
        baseURL: cand.baseURL,
        apiKey: cand.apiKey,
        timeout: cfg.timeoutMs,
        maxRetries: 0,
      });

      const completion = await client.chat.completions.create({
        model: cand.model,
        messages,
        temperature: cfg.temperature,
        max_tokens: cfg.maxTokens,
        ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      });

      const content = completion.choices?.[0]?.message?.content?.trim();
      if (!content) {
        errors.push(`${cand.label}: respons kosong`);
        continue;
      }

      return {
        text: content,
        providerUsed: cand.label,
        modelUsed: completion.model || cand.model,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${cand.label}: ${msg.slice(0, 140)}`);
    }
  }

  throw new Error(`Semua provider FreeLLMAPI gagal merespons (${errors.slice(0, 2).join(' | ')})`);
}

export async function callFreeLlmJson<T>(options: {
  systemInstruction: string;
  userPrompt: string;
  requestedModel?: string;
}): Promise<{ data: T; providerUsed: string; modelUsed: string }> {
  const res = await callFreeLlmChat({
    systemInstruction: `${options.systemInstruction}\nKembalikan HANYA JSON valid tanpa teks pembuka atau penutup markdown.`,
    userPrompt: options.userPrompt,
    requestedModel: options.requestedModel,
    jsonMode: true,
  });

  const stripped = res.text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  try {
    const data = JSON.parse(stripped) as T;
    return { data, providerUsed: res.providerUsed, modelUsed: res.modelUsed };
  } catch {
    const objMatch = /\{[\s\S]*\}/.exec(stripped);
    if (objMatch) {
      const data = JSON.parse(objMatch[0]) as T;
      return { data, providerUsed: res.providerUsed, modelUsed: res.modelUsed };
    }
    throw new Error('Respons JSON FreeLLMAPI tidak dapat diurai.');
  }
}

export async function testFreeLlmGateway(): Promise<{
  ok: boolean;
  latencyMs: number;
  providerUsed: string;
  modelUsed: string;
  message: string;
}> {
  const t0 = Date.now();
  try {
    const res = await callFreeLlmChat({
      systemInstruction: 'Jawab singkat maksimal 8 kata dalam bahasa Indonesia.',
      userPrompt: 'Balas: FreeLLMAPI TemaLoka aktif dan siap.',
    });
    return {
      ok: true,
      latencyMs: Date.now() - t0,
      providerUsed: res.providerUsed,
      modelUsed: res.modelUsed,
      message: `${res.providerUsed} (${res.modelUsed}): "${res.text.slice(0, 120)}"`,
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - t0,
      providerUsed: '-',
      modelUsed: '-',
      message: err instanceof Error ? err.message : 'Gagal terhubung ke FreeLLMAPI.',
    };
  }
}
