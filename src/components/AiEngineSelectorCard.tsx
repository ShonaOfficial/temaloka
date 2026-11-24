import React from 'react';
import {
  CheckCircle2,
  Cpu,
  Info,
  Lock,
  LogIn,
  Settings2,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useAuthAndAi } from '../contexts/AuthAndAiContext';
import {
  FREELLM_MODELS,
  GEMINI_MODELS,
  getFreeLlmModelOption,
} from '../lib/aiEngineCatalog';
import type { OfflineAiController } from '../hooks/useOfflineAiRuntime';

interface AiEngineSelectorCardProps {
  offlineAi: OfflineAiController;
  isOfflineMode?: boolean;
  onOpenLocalSettings?: () => void;
  compact?: boolean;
}

export const AiEngineSelectorCard: React.FC<AiEngineSelectorCardProps> = ({
  offlineAi,
  isOfflineMode = false,
  onOpenLocalSettings,
  compact = false,
}) => {
  const {
    user,
    isSigningIn,
    openAuthModal,
    engineMode,
    setEngineMode,
    geminiModel,
    setGeminiModel,
    freellmModel,
    setFreeLlmModel,
    freellmStatus,
    quota,
    onNotify,
  } = useAuthAndAi();

  const effectiveMode = isOfflineMode ? 'local' : engineMode;
  const activeFreeLlm = getFreeLlmModelOption(freellmModel);
  const freellmGuestBlocked =
    !freellmStatus.allowForGuests && !user;

  return (
    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/90 space-y-2.5">
      {/* 3-Mode Switcher */}
      <div className="grid grid-cols-3 gap-1 p-1 bg-white border border-slate-200 rounded-lg">
        <button
          type="button"
          onClick={() => setEngineMode('local')}
          className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
            effectiveMode === 'local'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Cpu className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">AI Lokal</span>
        </button>

        <button
          type="button"
          disabled={isOfflineMode}
          onClick={() => setEngineMode('freellm')}
          title={
            isOfflineMode
              ? 'FreeLLMAPI dinonaktifkan saat Mode Offline aktif'
              : 'Pilih mesin internal FreeLLMAPI (multi-provider gratis & cepat)'
          }
          className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-md text-[11px] font-semibold transition-colors ${
            isOfflineMode
              ? 'text-slate-300 cursor-not-allowed'
              : effectiveMode === 'freellm'
                ? 'bg-emerald-600 text-white cursor-pointer'
                : 'text-slate-600 hover:text-slate-900 cursor-pointer'
          }`}
        >
          <Zap className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">FreeLLM</span>
        </button>

        <button
          type="button"
          disabled={isOfflineMode}
          onClick={() => setEngineMode('gemini')}
          title={
            isOfflineMode
              ? 'Gemini Cloud dinonaktifkan saat Mode Offline aktif'
              : 'Pilih mesin Google Gemini (Wajib Login Akun)'
          }
          className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-md text-[11px] font-semibold transition-colors ${
            isOfflineMode
              ? 'text-slate-300 cursor-not-allowed'
              : effectiveMode === 'gemini'
                ? 'bg-blue-600 text-white cursor-pointer'
                : 'text-slate-600 hover:text-slate-900 cursor-pointer'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Gemini</span>
        </button>
      </div>

      {/* Mode 1: Local AI */}
      {effectiveMode === 'local' && (
        <div className="p-2.5 rounded-lg bg-white border border-slate-200 space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="font-semibold text-slate-900 truncate">
              Runtime: {offlineAi.activeMeta.shortName}
            </span>
            <button
              type="button"
              onClick={() =>
                onOpenLocalSettings ? onOpenLocalSettings() : offlineAi.openSettings()
              }
              className="flex items-center gap-1 text-blue-700 font-semibold hover:underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Settings2 className="w-3 h-3" />
              <span>Atur Engine</span>
            </button>
          </div>
          {!compact && (
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Diproses 100% di perangkat/browser Anda (Ollama, LM Studio, llama.cpp, WebLLM, atau Mesin Lokal Bawaan) tanpa memakai kuota server.
            </p>
          )}
        </div>
      )}

      {/* Mode 2: FreeLLMAPI Internal Engine */}
      {effectiveMode === 'freellm' && !isOfflineMode && (
        <div className="space-y-2">
          <div className="p-2.5 rounded-lg bg-emerald-50/80 border border-emerald-200 space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="font-semibold text-emerald-950 truncate">
                FreeLLMAPI · {activeFreeLlm.shortLabel}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-white border border-emerald-200 text-emerald-800 font-mono text-[10px] font-semibold shrink-0">
                {freellmStatus.enabled ? 'Aktif' : 'Nonaktif'}
              </span>
            </div>
            <p className="text-[10px] text-emerald-900 leading-relaxed">
              {freellmStatus.configuredProviders.length > 0
                ? `Provider siap: ${freellmStatus.configuredProviders.join(', ')} (auto-failover, tanpa kuota Gemini).`
                : 'Gateway internal FreeLLMAPI aktif dengan failover otomatis ke runtime bawaan TemaLoka.'}
            </p>
          </div>

          {freellmGuestBlocked && (
            <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 space-y-1.5">
              <div className="text-[11px] font-semibold text-amber-950">
                Masuk Akun untuk Memakai FreeLLMAPI
              </div>
              <button
                type="button"
                onClick={() => openAuthModal()}
                disabled={isSigningIn}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold rounded-lg cursor-pointer"
              >
                <LogIn className="w-3 h-3" />
                <span>Masuk / Daftar Akun</span>
              </button>
            </div>
          )}

          {/* FreeLLM Model Picker */}
          <div className="space-y-1.5">
            {FREELLM_MODELS.map((model) => {
              const isSelected = freellmModel === model.id;
              return (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => {
                    setFreeLlmModel(model.id);
                    onNotify?.(`Model FreeLLMAPI diubah ke ${model.label}.`, 'success');
                  }}
                  className={`w-full text-left p-2.5 rounded-lg border transition-colors cursor-pointer space-y-1 ${
                    isSelected
                      ? 'border-emerald-600 bg-emerald-50/70'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isSelected ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      ) : (
                        <Zap className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                      <span className="text-xs font-semibold text-slate-900 truncate">
                        {model.label}
                      </span>
                    </div>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${
                        isSelected
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {model.badge}
                    </span>
                  </div>
                  {!compact && (
                    <p className="text-[10px] text-slate-600 leading-relaxed">
                      {model.description}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Mode 3: Gemini Cloud */}
      {effectiveMode === 'gemini' && !isOfflineMode && (
        <div className="space-y-2">
          {!user ? (
            <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 space-y-2">
              <div className="text-[11px] font-semibold text-amber-950">
                Masuk Akun diperlukan untuk memakai Gemini Cloud
              </div>
              <p className="text-[10px] text-amber-900 leading-relaxed">
                Masuk atau daftar akun TemaLoka agar riwayat chat, pilihan mesin, dan kuota harian ({quota.dailyLimit} permintaan/hari) tercatat untuk akun Anda.
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => openAuthModal()}
                  disabled={isSigningIn}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold rounded-lg cursor-pointer disabled:opacity-60"
                >
                  <LogIn className="w-3 h-3" />
                  <span>{isSigningIn ? 'Menghubungkan...' : 'Masuk / Daftar Akun'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEngineMode('freellm')}
                  className="px-2.5 py-1.5 bg-emerald-50 border border-emerald-300 text-emerald-900 text-[11px] font-medium rounded-lg hover:bg-emerald-100/70 cursor-pointer"
                >
                  Pakai FreeLLMAPI
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-[11px]">
              <span className="text-slate-600 truncate">
                Akun: <strong className="text-slate-900">{user.email}</strong>
              </span>
              <span className="font-mono font-semibold text-blue-700 shrink-0 tabular-nums">
                Sisa {quota.remaining}/{quota.dailyLimit}
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            {GEMINI_MODELS.map((model) => {
              const isSelected = !model.requiresPro && geminiModel === model.id;
              if (model.requiresPro) {
                return (
                  <button
                    key={model.id}
                    type="button"
                    disabled
                    aria-disabled="true"
                    title={model.disabledNotice || 'Butuh akun Gemini yang Pro'}
                    onClick={() =>
                      onNotify?.('Mesin ini membutuhkan akun Gemini yang Pro.', 'info')
                    }
                    className="w-full text-left p-2.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-400 opacity-85 cursor-not-allowed select-none space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="text-xs font-semibold text-slate-400 truncate">
                          {model.label}
                        </span>
                      </div>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-medium text-slate-400 shrink-0">
                        {model.badge}
                      </span>
                    </div>
                    <div className="text-[11px] font-semibold text-amber-300/80">
                      {model.disabledNotice || 'Butuh akun Gemini yang Pro'}
                    </div>
                    {!compact && (
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        {model.description}
                      </p>
                    )}
                  </button>
                );
              }

              return (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => {
                    setGeminiModel(model.id);
                    onNotify?.(`Mesin AI aktif diubah ke ${model.label}.`, 'success');
                  }}
                  className={`w-full text-left p-2.5 rounded-lg border transition-colors cursor-pointer space-y-1 ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50/70'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isSelected ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                      <span className="text-xs font-semibold text-slate-900 truncate">
                        {model.label}
                      </span>
                    </div>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {model.badge}
                    </span>
                  </div>
                  {!compact && (
                    <p className="text-[10px] text-slate-600 leading-relaxed">
                      {model.description}
                    </p>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-start gap-1.5 p-2 rounded-lg bg-slate-100 border border-slate-200 text-[10px] text-slate-600 leading-relaxed">
            <Info className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
            <span>
              Kuota Gemini Cloud di web ini dijaga per akun ({quota.dailyLimit}/hari). Gunakan <strong>FreeLLMAPI</strong> atau <strong>AI Lokal</strong> untuk pemakaian tanpa kuota Gemini.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
