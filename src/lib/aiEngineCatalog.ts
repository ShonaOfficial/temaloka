export type AiEngineMode = 'local' | 'freellm' | 'gemini';

export type CallableGeminiModelId = 'gemini-3.1-flash-lite';

export type GeminiModelId =
  | CallableGeminiModelId
  | 'gemini-4-hydrogen'
  | 'gemini-4-neon'
  | 'gemini-4-carbon';

export interface GeminiModelOption {
  id: GeminiModelId;
  label: string;
  shortLabel: string;
  tier: 'standard' | 'pro';
  requiresPro: boolean;
  badge: string;
  description: string;
  disabledNotice?: string;
}

export interface FreeLlmModelOption {
  id: string;
  label: string;
  shortLabel: string;
  badge: string;
  description: string;
}

export const FREELLM_MODELS: FreeLlmModelOption[] = [
  {
    id: 'auto',
    label: 'FreeLLMAPI Auto (Smart Failover)',
    shortLabel: 'Auto Router',
    badge: 'Rekomendasi',
    description:
      'Memilih provider tercepat & tersedia secara otomatis (Groq, Cerebras, OpenRouter, Mistral, NIM, Cloudflare AI, Gemini Compat) dengan auto-failover.',
  },
  {
    id: 'auto:fastest',
    label: 'FreeLLMAPI Auto: Fastest (Low Latency)',
    shortLabel: 'Fastest',
    badge: 'Kilat',
    description: 'Prioritas respons tercepat untuk edit CSS instan, chat cepat, & validasi XML.',
  },
  {
    id: 'auto:smartest',
    label: 'FreeLLMAPI Auto: Smartest (Deep Reasoning)',
    shortLabel: 'Smartest',
    badge: 'Analisis',
    description: 'Prioritas model berkapasitas penalaran tinggi untuk audit XML, SEO, & refactoring kode.',
  },
  {
    id: 'llama-3.3-70b-versatile',
    label: 'Llama 3.3 70B Versatile',
    shortLabel: 'Llama 3.3 70B',
    badge: '70B',
    description: 'Model serbaguna 70B untuk memahami struktur HTML/XML Blogger dan menulis CSS responsif.',
  },
  {
    id: 'qwen-2.5-coder-32b',
    label: 'Qwen 2.5 Coder 32B',
    shortLabel: 'Qwen Coder 32B',
    badge: 'Kode XML',
    description: 'Dioptimalkan khusus untuk parsing XML, sintaks Blogger <b:if>, dan JavaScript.',
  },
  {
    id: 'deepseek-r1-distill-llama-70b',
    label: 'DeepSeek R1 Distill 70B',
    shortLabel: 'DeepSeek R1',
    badge: 'Reasoning',
    description: 'Penalaran bertahap untuk debugging error XML & optimasi struktur DOM.',
  },
  {
    id: 'mistral-small-latest',
    label: 'Mistral Small Latest',
    shortLabel: 'Mistral Small',
    badge: 'Cepat',
    description: 'Ringkas dan stabil untuk konten sampel Bahasa Indonesia dan saran SEO.',
  },
  {
    id: 'llama-3.1-8b-instant',
    label: 'Llama 3.1 8B Instant',
    shortLabel: 'Llama 8B',
    badge: 'Ringan',
    description: 'Sangat cepat dan hemat kuota upstream untuk tugas CSS dan chat ringan.',
  },
];

export const GEMINI_MODELS: GeminiModelOption[] = [
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite',
    shortLabel: 'Flash Lite',
    tier: 'standard',
    requiresPro: false,
    badge: 'Standar · Aktif',
    description:
      'Mesin Gemini standar yang cepat dan ringan untuk Chat AI, merancang tema, CSS, audit SEO/AdSense, & diagnosa XML.',
  },
  {
    id: 'gemini-4-hydrogen',
    label: 'Gemini 4 Hydrogen',
    shortLabel: '4 Hydrogen',
    tier: 'pro',
    requiresPro: true,
    badge: 'Pro · Berbayar',
    disabledNotice: 'Butuh akun Gemini yang Pro',
    description:
      'Model seri Gemini 4 berbayar; memerlukan akun & API key Gemini Pro agar aktif.',
  },
  {
    id: 'gemini-4-neon',
    label: 'Gemini 4 Neon',
    shortLabel: '4 Neon',
    tier: 'pro',
    requiresPro: true,
    badge: 'Pro · Berbayar',
    disabledNotice: 'Butuh akun Gemini yang Pro',
    description:
      'Penalaran kompleks untuk refactoring kode XML lanjutan & arsitektur template.',
  },
  {
    id: 'gemini-4-carbon',
    label: 'Gemini 4 Carbon',
    shortLabel: '4 Carbon',
    tier: 'pro',
    requiresPro: true,
    badge: 'Pro · Berbayar',
    disabledNotice: 'Butuh akun Gemini yang Pro',
    description:
      'Audit mendalam untuk debugging akar masalah, keamanan, dan optimasi tingkat lanjut.',
  },
];

export const DAILY_GEMINI_QUOTA_LIMIT = 25;

export function isCallableGeminiModel(modelId: string): modelId is CallableGeminiModelId {
  return modelId === 'gemini-3.1-flash-lite';
}

export function getGeminiModelOption(modelId: string): GeminiModelOption {
  return (
    GEMINI_MODELS.find((m) => m.id === modelId) || GEMINI_MODELS[0]
  );
}

export function getFreeLlmModelOption(modelId: string): FreeLlmModelOption {
  return (
    FREELLM_MODELS.find((m) => m.id === modelId) || FREELLM_MODELS[0]
  );
}
