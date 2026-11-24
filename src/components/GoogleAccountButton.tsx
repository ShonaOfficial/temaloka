import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  Ban,
  ChevronDown,
  Cpu,
  CreditCard,
  Crown,
  Eye,
  EyeOff,
  Loader2,
  LogIn,
  LogOut,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
  UserPlus,
  X,
  Zap,
} from 'lucide-react';
import { useAuthAndAi } from '../contexts/AuthAndAiContext';
import { getFreeLlmModelOption, getGeminiModelOption } from '../lib/aiEngineCatalog';

interface GoogleAccountButtonProps {
  isOfflineMode?: boolean;
  onOpenAdminPanel?: () => void;
  onOpenUpgradeModal?: () => void;
  showUpgradeButton?: boolean;
  isAdFree?: boolean;
  activeProPlanName?: string | null;
}

export const GoogleAccountButton: React.FC<GoogleAccountButtonProps> = ({
  isOfflineMode = false,
  onOpenAdminPanel,
  onOpenUpgradeModal,
  showUpgradeButton = false,
  isAdFree = false,
  activeProPlanName = null,
}) => {
  const {
    user,
    authReady,
    isSigningIn,
    isAdmin,
    userTier,
    lastAuthError,
    clearLastAuthError,
    authModalOpen,
    openAuthModal,
    closeAuthModal,
    signInWithEmail,
    registerAccount,
    signOutAccount,
    engineMode,
    setEngineMode,
    geminiModel,
    freellmModel,
    quota,
  } = useAuthAndAi();

  const [menuOpen, setMenuOpen] = useState(false);
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [menuOpen]);

  useEffect(() => {
    if (!authModalOpen) {
      setFormError(null);
      setShowPassword(false);
      setShowConfirmPassword(false);
      return;
    }
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeAuthModal();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [authModalOpen, closeAuthModal]);

  const switchTab = (nextTab: 'login' | 'register') => {
    setAuthTab(nextTab);
    setFormError(null);
    clearLastAuthError();
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    clearLastAuthError();

    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setFormError('Masukkan alamat email yang valid.');
      return;
    }
    if (password.length < 6) {
      setFormError('Password minimal 6 karakter.');
      return;
    }

    if (authTab === 'register') {
      if (password !== confirmPassword) {
        setFormError('Konfirmasi password tidak cocok.');
        return;
      }
      const ok = await registerAccount(cleanEmail, displayName.trim(), password);
      if (ok) {
        setPassword('');
        setConfirmPassword('');
      }
    } else {
      const ok = await signInWithEmail(cleanEmail, password);
      if (ok) {
        setPassword('');
      }
    }
  };

  if (!authReady) {
    return <div className="h-9 w-20 sm:w-24 rounded-lg bg-slate-100 animate-pulse shrink-0" />;
  }

  const activeGeminiMeta = getGeminiModelOption(geminiModel);
  const activeFreeLlmMeta = getFreeLlmModelOption(freellmModel);
  const shortName = user
    ? (user.displayName || user.email || 'Akun').split(' ')[0].slice(0, 14)
    : 'Masuk';
  const pct = Math.min(100, Math.round((quota.usedCount / Math.max(1, quota.dailyLimit)) * 100));

  return (
    <div ref={containerRef} className="relative shrink-0">
      {!user ? (
        <button
          type="button"
          onClick={openAuthModal}
          disabled={isSigningIn}
          title={
            isOfflineMode
              ? 'Masuk Akun TemaLoka'
              : 'Masuk / Daftar Akun TemaLoka untuk sinkronisasi cloud & paket Pro'
          }
          className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 min-h-[38px] sm:min-h-[34px] text-xs font-medium text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <LogIn className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span>Masuk</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          title={`Akun ${shortName} (${userTier.toUpperCase()})`}
          className="flex items-center gap-1.5 px-2 py-1 min-h-[38px] sm:min-h-[34px] text-xs font-medium text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <span
            className={`w-5 h-5 rounded-full text-white flex items-center justify-center text-[10px] font-bold shrink-0 ${
              isAdmin ? 'bg-emerald-600' : userTier === 'pro' ? 'bg-amber-600' : 'bg-blue-600'
            }`}
          >
            {isAdmin ? (
              <ShieldCheck className="w-3 h-3" />
            ) : userTier === 'pro' ? (
              <Crown className="w-3 h-3" />
            ) : (
              <UserIcon className="w-3 h-3" />
            )}
          </span>
          <span className="hidden md:inline max-w-[90px] truncate">{shortName}</span>
          <span
            className={`px-1.5 py-0.5 text-[10px] font-mono font-semibold uppercase rounded border ${
              isAdmin
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : userTier === 'pro'
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : 'bg-white border-slate-200 text-slate-700'
            }`}
          >
            {isAdmin ? 'ADMIN' : userTier === 'pro' ? 'PRO' : 'FREE'}
          </span>
          <ChevronDown className="w-3 h-3 text-slate-400" />
        </button>
      )}

      {menuOpen && user && (
        <div className="fixed left-3 right-3 top-14 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-1.5 sm:w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-3.5 space-y-3 text-xs max-h-[calc(100dvh-4.5rem)] overflow-y-auto">
          <div className="flex items-center gap-2.5 pb-2.5 border-b border-slate-100">
            <div
              className={`w-9 h-9 rounded-full text-white flex items-center justify-center shrink-0 ${
                isAdmin ? 'bg-emerald-600' : userTier === 'pro' ? 'bg-amber-600' : 'bg-blue-600'
              }`}
            >
              {isAdmin ? <ShieldCheck className="w-4 h-4" /> : <UserIcon className="w-4 h-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold text-slate-900 truncate">{user.displayName}</span>
                <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase rounded bg-slate-100 text-slate-700">
                  {isAdmin
                    ? 'ADMIN'
                    : userTier === 'pro'
                      ? activeProPlanName || 'PREMIUM'
                      : 'FREE'}
                </span>
                {isAdFree && !isAdmin && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-emerald-50 border border-emerald-200 text-emerald-800">
                    <Ban className="w-2.5 h-2.5" />
                    Bebas Iklan
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-500 truncate">{user.email}</div>
              {user.featureOverrides && Object.keys(user.featureOverrides).length > 0 && (
                <div className="text-[10px] text-blue-700 mt-0.5">
                  {Object.keys(user.featureOverrides).length} pengaturan akses fitur khusus aktif
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-slate-700">Kuota Harian Gemini</span>
              <span className="font-mono font-bold text-slate-900 tabular-nums">
                {quota.remaining}/{quota.dailyLimit}
              </span>
            </div>
            <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  pct >= 90 ? 'bg-rose-600' : pct >= 70 ? 'bg-amber-500' : 'bg-blue-600'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Mesin AI:{' '}
              <strong>
                {engineMode === 'freellm'
                  ? `FreeLLMAPI (${activeFreeLlmMeta.shortLabel})`
                  : engineMode === 'gemini'
                    ? activeGeminiMeta.label
                    : 'AI Lokal'}
              </strong>
            </p>
          </div>

          <div className="grid grid-cols-3 gap-1.5 pt-0.5">
            <button
              type="button"
              onClick={() => {
                setEngineMode('local');
                setMenuOpen(false);
              }}
              className={`flex items-center justify-center gap-1 py-2 min-h-[38px] px-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                engineMode === 'local'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Cpu className="w-3.5 h-3.5 shrink-0" />
              <span>Lokal</span>
            </button>
            <button
              type="button"
              disabled={isOfflineMode}
              onClick={() => {
                setEngineMode('freellm');
                setMenuOpen(false);
              }}
              className={`flex items-center justify-center gap-1 py-2 min-h-[38px] px-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer disabled:opacity-50 ${
                engineMode === 'freellm' && !isOfflineMode
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Zap className="w-3.5 h-3.5 shrink-0" />
              <span>FreeLLM</span>
            </button>
            <button
              type="button"
              disabled={isOfflineMode}
              onClick={() => {
                setEngineMode('gemini');
                setMenuOpen(false);
              }}
              className={`flex items-center justify-center gap-1 py-2 min-h-[38px] px-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer disabled:opacity-50 ${
                engineMode === 'gemini' && !isOfflineMode
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>Gemini</span>
            </button>
          </div>

          {!isAdmin && showUpgradeButton && onOpenUpgradeModal && (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onOpenUpgradeModal();
              }}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 min-h-[40px] px-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-semibold cursor-pointer"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Upgrade Pro &amp; Bebas Iklan</span>
            </button>
          )}

          {isAdmin && onOpenAdminPanel && (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onOpenAdminPanel();
              }}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 min-h-[40px] px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Buka Panel Admin</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              void signOutAccount();
            }}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 min-h-[40px] px-3 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-[11px] font-semibold cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar Akun</span>
          </button>
        </div>
      )}

      {/* Email/Password Login & Register Modal (portaled to document.body to avoid header containing-block clipping) */}
      {authModalOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="temaloka-auth-modal-title"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeAuthModal();
            }}
            className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4"
          >
            <div className="w-full sm:max-w-md max-h-[92dvh] flex flex-col bg-white rounded-t-2xl sm:rounded-xl border border-slate-200 shadow-2xl overflow-hidden">
              <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50 shrink-0">
                <div className="min-w-0">
                  <h3
                    id="temaloka-auth-modal-title"
                    className="text-sm font-bold text-slate-900 truncate"
                  >
                    Akun TemaLoka
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Simpan catatan Cloud, riwayat Chat AI, &amp; akses paket Pro Anda.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeAuthModal}
                  aria-label="Tutup modal akun"
                  className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
                <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100 border border-slate-200">
                  <button
                    type="button"
                    onClick={() => switchTab('login')}
                    className={`py-2 min-h-[38px] text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      authTab === 'login' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Masuk Akun
                  </button>
                  <button
                    type="button"
                    onClick={() => switchTab('register')}
                    className={`py-2 min-h-[38px] text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      authTab === 'register' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Daftar Baru (Free)
                  </button>
                </div>

                {(formError || lastAuthError) && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                    <span className="leading-snug">{formError || lastAuthError}</span>
                  </div>
                )}

                <form onSubmit={(e) => void handleAuthSubmit(e)} className="space-y-3 text-xs">
                  {authTab === 'register' && (
                    <div className="space-y-1">
                      <label htmlFor="auth-display-name" className="block font-semibold text-slate-700">
                        Nama Tampilan
                      </label>
                      <input
                        id="auth-display-name"
                        type="text"
                        autoComplete="name"
                        value={displayName}
                        onChange={(e) => {
                          setDisplayName(e.target.value);
                          setFormError(null);
                        }}
                        placeholder="Misal: Ahmad Blogger"
                        className="w-full px-3 py-2.5 min-h-[42px] rounded-lg border border-slate-300 bg-white text-slate-900 text-sm sm:text-xs focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      />
                    </div>
                  )}

                  <div className="space-y-1">
                    <label htmlFor="auth-email" className="block font-semibold text-slate-700">
                      Email
                    </label>
                    <input
                      id="auth-email"
                      type="email"
                      required
                      autoComplete="email"
                      inputMode="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setFormError(null);
                        clearLastAuthError();
                      }}
                      placeholder="nama@email.com"
                      className="w-full px-3 py-2.5 min-h-[42px] rounded-lg border border-slate-300 bg-white text-slate-900 text-sm sm:text-xs focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="auth-password" className="block font-semibold text-slate-700">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        id="auth-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        autoComplete={authTab === 'login' ? 'current-password' : 'new-password'}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setFormError(null);
                          clearLastAuthError();
                        }}
                        placeholder="Minimal 6 karakter"
                        className="w-full pl-3 pr-11 py-2.5 min-h-[42px] rounded-lg border border-slate-300 bg-white text-slate-900 text-sm sm:text-xs focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                        className="absolute inset-y-0 right-0 px-3 flex items-center justify-center text-slate-500 hover:text-slate-800 cursor-pointer"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {authTab === 'register' && (
                    <div className="space-y-1">
                      <label htmlFor="auth-confirm-password" className="block font-semibold text-slate-700">
                        Konfirmasi Password
                      </label>
                      <div className="relative">
                        <input
                          id="auth-confirm-password"
                          type={showConfirmPassword ? 'text' : 'password'}
                          required
                          minLength={6}
                          autoComplete="new-password"
                          value={confirmPassword}
                          onChange={(e) => {
                            setConfirmPassword(e.target.value);
                            setFormError(null);
                          }}
                          placeholder="Ketik ulang password"
                          className="w-full pl-3 pr-11 py-2.5 min-h-[42px] rounded-lg border border-slate-300 bg-white text-slate-900 text-sm sm:text-xs focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword((v) => !v)}
                          aria-label={
                            showConfirmPassword ? 'Sembunyikan konfirmasi password' : 'Lihat konfirmasi password'
                          }
                          className="absolute inset-y-0 right-0 px-3 flex items-center justify-center text-slate-500 hover:text-slate-800 cursor-pointer"
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSigningIn}
                    className="w-full py-2.5 min-h-[44px] rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-semibold flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isSigningIn ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : authTab === 'register' ? (
                      <UserPlus className="w-4 h-4" />
                    ) : (
                      <LogIn className="w-4 h-4" />
                    )}
                    <span>
                      {isSigningIn
                        ? 'Memproses...'
                        : authTab === 'register'
                          ? 'Buat Akun Baru'
                          : 'Masuk'}
                    </span>
                  </button>
                </form>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
