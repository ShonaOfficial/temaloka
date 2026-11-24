import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  DAILY_GEMINI_QUOTA_LIMIT,
  isCallableGeminiModel,
  type AiEngineMode,
  type CallableGeminiModelId,
} from '../lib/aiEngineCatalog';
import type {
  AuthUserSession,
  FreeLlmPublicStatus,
  UserAccountTier,
} from '../types/admin';

export interface QuotaStatus {
  dateKey: string;
  usedCount: number;
  dailyLimit: number;
  remaining: number;
}

export interface AiChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  engineLabel: string;
  modelId: string;
  suggestedCss?: string;
  pageContext: string;
  createdAtMs: number;
}

export interface GeminiXmlPartAttachment {
  id: string;
  index: number;
  total: number;
  filename: string;
  title: string;
  byteSize: number;
  lineCount: number;
  content: string;
}

interface AuthAndAiContextValue {
  user: AuthUserSession | null;
  sessionToken: string | null;
  authReady: boolean;
  isSigningIn: boolean;
  isAdmin: boolean;
  userTier: UserAccountTier;
  lastAuthError: string | null;
  clearLastAuthError: () => void;
  authModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  signInWithEmail: (email: string, password: string) => Promise<boolean>;
  registerAccount: (email: string, displayName: string, password: string) => Promise<boolean>;
  signInAsAdmin: (email: string, password: string) => Promise<boolean>;
  claimAdminAccount: (input: { email: string; displayName: string; password: string }) => Promise<boolean>;
  updateAdminAccount: (input: {
    currentPassword: string;
    newEmail: string;
    newDisplayName: string;
    newPassword?: string;
  }) => Promise<boolean>;
  signOutAccount: () => Promise<void>;
  /** Legacy compatibility helper: opens the sign-in modal and resolves false until signed in. */
  signInWithGoogle: () => Promise<boolean>;
  signOutGoogle: () => Promise<void>;
  engineMode: AiEngineMode;
  setEngineMode: (mode: AiEngineMode) => void;
  geminiModel: CallableGeminiModelId;
  setGeminiModel: (model: string) => void;
  freellmModel: string;
  setFreeLlmModel: (model: string) => void;
  freellmStatus: FreeLlmPublicStatus;
  setFreeLlmStatus: (status: FreeLlmPublicStatus) => void;
  quota: QuotaStatus;
  chatMessages: AiChatMessageItem[];
  isChatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  toggleChatOpen: () => void;
  attachedXmlParts: GeminiXmlPartAttachment[];
  attachXmlPartsToGemini: (
    parts: GeminiXmlPartAttachment[],
    options?: { replace?: boolean; openChat?: boolean; switchToGemini?: boolean }
  ) => void;
  removeAttachedXmlPart: (partId: string) => void;
  clearAttachedXmlParts: () => void;
  appendChatMessages: (
    userMsg: Omit<AiChatMessageItem, 'id' | 'createdAtMs'>,
    assistantMsg: Omit<AiChatMessageItem, 'id' | 'createdAtMs'>
  ) => Promise<void>;
  clearChatMessages: () => Promise<void>;
  authorizedGeminiFetch: <T = Record<string, unknown>>(
    endpoint: string,
    payload: Record<string, unknown>,
    options?: {
      overrideModel?: CallableGeminiModelId | string;
      overrideEngine?: 'freellm' | 'gemini';
    }
  ) => Promise<T>;
  onNotify?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const LOCAL_PREF_KEY = 'temaloka_hybrid_ai_prefs_v2';
const LOCAL_CHAT_KEY = 'temaloka_local_ai_chat_v1';

function getUtcDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadLocalPrefs(): {
  engineMode: AiEngineMode;
  geminiModel: CallableGeminiModelId;
  freellmModel: string;
} {
  try {
    const raw = localStorage.getItem(LOCAL_PREF_KEY);
    if (!raw) {
      return {
        engineMode: 'freellm',
        geminiModel: 'gemini-3.1-flash-lite',
        freellmModel: 'auto',
      };
    }
    const parsed = JSON.parse(raw) as {
      engineMode?: string;
      geminiModel?: string;
      freellmModel?: string;
    };
    const mode: AiEngineMode =
      parsed.engineMode === 'gemini' || parsed.engineMode === 'local'
        ? parsed.engineMode
        : 'freellm';
    return {
      engineMode: mode,
      geminiModel: isCallableGeminiModel(parsed.geminiModel || '')
        ? (parsed.geminiModel as CallableGeminiModelId)
        : 'gemini-3.1-flash-lite',
      freellmModel:
        typeof parsed.freellmModel === 'string' && parsed.freellmModel.trim()
          ? parsed.freellmModel.trim()
          : 'auto',
    };
  } catch {
    return {
      engineMode: 'freellm',
      geminiModel: 'gemini-3.1-flash-lite',
      freellmModel: 'auto',
    };
  }
}

function loadLocalChat(): AiChatMessageItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_CHAT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(-40) : [];
  } catch {
    return [];
  }
}

const DEFAULT_FREELLM_STATUS: FreeLlmPublicStatus = {
  enabled: true,
  defaultModel: 'auto',
  routingStrategy: 'auto',
  allowForGuests: true,
  configuredProviders: [],
};

const AuthAndAiContext = createContext<AuthAndAiContextValue | null>(null);

export const AuthAndAiProvider: React.FC<{
  children: React.ReactNode;
  onNotify?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}> = ({ children, onNotify }) => {
  const initialPrefs = useMemo(() => loadLocalPrefs(), []);

  // Session Bearer token lives strictly in React state memory (never localStorage/sessionStorage)
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUserSession | null>(null);
  const [authReady, setAuthReady] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [lastAuthError, setLastAuthError] = useState<string | null>(null);

  const [engineMode, setEngineModeState] = useState<AiEngineMode>(initialPrefs.engineMode);
  const [geminiModel, setGeminiModelState] = useState<CallableGeminiModelId>(
    initialPrefs.geminiModel
  );
  const [freellmModel, setFreeLlmModelState] = useState<string>(initialPrefs.freellmModel);
  const [freellmStatus, setFreeLlmStatus] = useState<FreeLlmPublicStatus>(DEFAULT_FREELLM_STATUS);

  const [quota, setQuota] = useState<QuotaStatus>(() => ({
    dateKey: getUtcDateKey(),
    usedCount: 0,
    dailyLimit: DAILY_GEMINI_QUOTA_LIMIT,
    remaining: DAILY_GEMINI_QUOTA_LIMIT,
  }));

  const [remoteChatMessages, setRemoteChatMessages] = useState<AiChatMessageItem[]>([]);
  const [localChatMessages, setLocalChatMessages] = useState<AiChatMessageItem[]>(loadLocalChat);
  const [isChatOpen, setChatOpen] = useState(false);
  const [attachedXmlParts, setAttachedXmlParts] = useState<GeminiXmlPartAttachment[]>([]);

  const tokenRef = useRef<string | null>(sessionToken);
  tokenRef.current = sessionToken;

  useEffect(() => {
    try {
      localStorage.setItem(
        LOCAL_PREF_KEY,
        JSON.stringify({ engineMode, geminiModel, freellmModel })
      );
    } catch {
      // ignore
    }
  }, [engineMode, geminiModel, freellmModel]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_CHAT_KEY, JSON.stringify(localChatMessages.slice(-40)));
    } catch {
      // ignore
    }
  }, [localChatMessages]);

  // Fetch initial FreeLLM public status on mount
  useEffect(() => {
    let active = true;
    fetch('/api/ai/freellm/models')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { status?: FreeLlmPublicStatus } | null) => {
        if (active && data?.status) {
          setFreeLlmStatus(data.status);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Load user chat messages & quota from Cloudflare D1 when authenticated
  useEffect(() => {
    if (!user || !sessionToken) {
      setRemoteChatMessages([]);
      setQuota({
        dateKey: getUtcDateKey(),
        usedCount: 0,
        dailyLimit: DAILY_GEMINI_QUOTA_LIMIT,
        remaining: DAILY_GEMINI_QUOTA_LIMIT,
      });
      return;
    }

    let cancelled = false;
    fetch('/api/chat-messages', {
      headers: { Authorization: `Bearer ${sessionToken}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { messages?: AiChatMessageItem[] } | null) => {
        if (!cancelled && Array.isArray(data?.messages)) {
          setRemoteChatMessages(data.messages);
        }
      })
      .catch(() => {});

    fetch('/api/ai/quota-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ engine: 'gemini', model: geminiModel }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { quota?: QuotaStatus } | null) => {
        if (!cancelled && data?.quota) {
          setQuota(data.quota);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [user?.id, sessionToken, geminiModel]);

  const persistUserPref = useCallback(
    async (patch: {
      preferredMode?: AiEngineMode;
      preferredGeminiModel?: CallableGeminiModelId;
      preferredFreeLlmModel?: string;
    }) => {
      if (!tokenRef.current || !user) return;
      try {
        await fetch('/api/auth/preferences', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenRef.current}`,
          },
          body: JSON.stringify(patch),
        });
      } catch {
        // ignore offline hiccup
      }
    },
    [user]
  );

  const setEngineMode = useCallback(
    (mode: AiEngineMode) => {
      setEngineModeState(mode);
      void persistUserPref({ preferredMode: mode });
    },
    [persistUserPref]
  );

  const setGeminiModel = useCallback(
    (model: string) => {
      if (!isCallableGeminiModel(model)) {
        onNotify?.('Model ini membutuhkan akun Gemini yang Pro.', 'info');
        return;
      }
      setGeminiModelState(model);
      setEngineModeState('gemini');
      void persistUserPref({ preferredMode: 'gemini', preferredGeminiModel: model });
    },
    [onNotify, persistUserPref]
  );

  const setFreeLlmModel = useCallback(
    (model: string) => {
      const clean = model.trim() || 'auto';
      setFreeLlmModelState(clean);
      setEngineModeState('freellm');
      void persistUserPref({ preferredMode: 'freellm', preferredFreeLlmModel: clean });
    },
    [persistUserPref]
  );

  const applyAuthSession = useCallback(
    (token: string, nextUser: AuthUserSession, serverQuota?: QuotaStatus) => {
      setSessionToken(token);
      setUser(nextUser);
      setAuthReady(true);
      if (serverQuota) setQuota(serverQuota);
      if (
        nextUser.preferredMode === 'local' ||
        nextUser.preferredMode === 'freellm' ||
        nextUser.preferredMode === 'gemini'
      ) {
        setEngineModeState(nextUser.preferredMode);
      }
      if (nextUser.preferredFreeLlmModel) {
        setFreeLlmModelState(nextUser.preferredFreeLlmModel);
      }
      setLastAuthError(null);
      setAuthModalOpen(false);
    },
    []
  );

  const clearLastAuthError = useCallback(() => {
    setLastAuthError(null);
  }, []);

  const signInWithEmail = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      setIsSigningIn(true);
      setLastAuthError(null);
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = (await res.json()) as {
          token?: string;
          user?: AuthUserSession;
          quota?: QuotaStatus;
          error?: string;
        };
        if (!res.ok || !data.token || !data.user) {
          throw new Error(data.error || 'Email atau password salah.');
        }
        applyAuthSession(data.token, data.user, data.quota);
        onNotify?.(`Berhasil masuk sebagai ${data.user.displayName} (${data.user.email}).`, 'success');
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Gagal masuk ke akun TemaLoka.';
        setLastAuthError(msg);
        onNotify?.(msg, 'error');
        return false;
      } finally {
        setIsSigningIn(false);
      }
    },
    [applyAuthSession, onNotify]
  );

  const registerAccount = useCallback(
    async (email: string, displayName: string, password: string): Promise<boolean> => {
      setIsSigningIn(true);
      setLastAuthError(null);
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, displayName, password }),
        });
        const data = (await res.json()) as {
          token?: string;
          user?: AuthUserSession;
          quota?: QuotaStatus;
          error?: string;
        };
        if (!res.ok || !data.token || !data.user) {
          throw new Error(data.error || 'Gagal mendaftar akun baru.');
        }
        applyAuthSession(data.token, data.user, data.quota);
        onNotify?.(`Akun "${data.user.displayName}" berhasil dibuat.`, 'success');
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Gagal mendaftar akun.';
        setLastAuthError(msg);
        onNotify?.(msg, 'error');
        return false;
      } finally {
        setIsSigningIn(false);
      }
    },
    [applyAuthSession, onNotify]
  );

  const signInAsAdmin = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      setIsSigningIn(true);
      setLastAuthError(null);
      try {
        const res = await fetch('/api/admin/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = (await res.json()) as {
          token?: string;
          user?: AuthUserSession;
          error?: string;
        };
        if (!res.ok || !data.token || !data.user) {
          throw new Error(data.error || 'Email atau password Admin salah.');
        }
        applyAuthSession(data.token, data.user);
        onNotify?.(`Login Admin berhasil (${data.user.email}).`, 'success');
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Login Admin gagal.';
        setLastAuthError(msg);
        onNotify?.(msg, 'error');
        return false;
      } finally {
        setIsSigningIn(false);
      }
    },
    [applyAuthSession, onNotify]
  );

  const claimAdminAccount = useCallback(
    async (input: { email: string; displayName: string; password: string }): Promise<boolean> => {
      setIsSigningIn(true);
      setLastAuthError(null);
      try {
        const res = await fetch('/api/admin/auth/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        const data = (await res.json()) as {
          token?: string;
          user?: AuthUserSession;
          error?: string;
        };
        if (!res.ok || !data.token || !data.user) {
          throw new Error(data.error || 'Gagal membuat password Admin awal.');
        }
        applyAuthSession(data.token, data.user);
        onNotify?.(`Akun Admin (${data.user.email}) berhasil diamankan.`, 'success');
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Gagal klaim akun Admin.';
        setLastAuthError(msg);
        onNotify?.(msg, 'error');
        return false;
      } finally {
        setIsSigningIn(false);
      }
    },
    [applyAuthSession, onNotify]
  );

  const updateAdminAccount = useCallback(
    async (input: {
      currentPassword: string;
      newEmail: string;
      newDisplayName: string;
      newPassword?: string;
    }): Promise<boolean> => {
      if (!tokenRef.current) {
        const msg = 'Sesi Admin tidak ditemukan. Masuk ulang terlebih dahulu.';
        setLastAuthError(msg);
        onNotify?.(msg, 'error');
        return false;
      }
      setIsSigningIn(true);
      setLastAuthError(null);
      try {
        const res = await fetch('/api/admin/account/update', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenRef.current}`,
          },
          body: JSON.stringify(input),
        });
        const data = (await res.json()) as {
          token?: string;
          user?: AuthUserSession;
          error?: string;
        };
        if (!res.ok || !data.token || !data.user) {
          throw new Error(data.error || 'Gagal memperbarui akun Admin.');
        }
        applyAuthSession(data.token, data.user);
        onNotify?.(`Akun Admin (${data.user.email}) berhasil diperbarui.`, 'success');
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Gagal memperbarui akun Admin.';
        setLastAuthError(msg);
        onNotify?.(msg, 'error');
        return false;
      } finally {
        setIsSigningIn(false);
      }
    },
    [applyAuthSession, onNotify]
  );

  const signOutAccount = useCallback(async () => {
    setSessionToken(null);
    setUser(null);
    setRemoteChatMessages([]);
    if (engineMode === 'gemini') {
      setEngineModeState('freellm');
    }
    onNotify?.('Anda telah keluar dari akun. Mode AI dialihkan ke FreeLLMAPI / Lokal.', 'info');
  }, [engineMode, onNotify]);

  const signInWithGoogle = useCallback(async (): Promise<boolean> => {
    setAuthModalOpen(true);
    return false;
  }, []);

  const authorizedGeminiFetch = useCallback(
    async <T = Record<string, unknown>>(
      endpoint: string,
      payload: Record<string, unknown>,
      options?: {
        overrideModel?: CallableGeminiModelId | string;
        overrideEngine?: 'freellm' | 'gemini';
      }
    ): Promise<T> => {
      const activeEngine: 'freellm' | 'gemini' =
        options?.overrideEngine || (engineMode === 'freellm' ? 'freellm' : 'gemini');
      const selectedModel =
        options?.overrideModel ||
        (activeEngine === 'freellm' ? freellmModel : geminiModel);

      if (activeEngine === 'gemini' && !tokenRef.current) {
        setAuthModalOpen(true);
        throw new Error(
          'Masuk akun terlebih dahulu untuk memakai Gemini Cloud (atau pilih FreeLLMAPI / AI Lokal).'
        );
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (tokenRef.current) {
        headers.Authorization = `Bearer ${tokenRef.current}`;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...payload,
          engine: activeEngine,
          model: selectedModel,
        }),
      });

      const data = (await res.json()) as T & {
        error?: string;
        code?: string;
        quota?: QuotaStatus;
      };

      if (data?.quota) {
        setQuota(data.quota);
      }

      if (!res.ok) {
        if (res.status === 401 && activeEngine === 'gemini') {
          setAuthModalOpen(true);
        }
        throw new Error(data?.error || `Permintaan AI gagal (HTTP ${res.status}).`);
      }

      return data;
    },
    [engineMode, freellmModel, geminiModel]
  );

  const appendChatMessages = useCallback(
    async (
      userMsg: Omit<AiChatMessageItem, 'id' | 'createdAtMs'>,
      assistantMsg: Omit<AiChatMessageItem, 'id' | 'createdAtMs'>
    ) => {
      const now = Date.now();
      if (!user || !tokenRef.current) {
        setLocalChatMessages((prev) => [
          ...prev.slice(-38),
          { ...userMsg, id: `local-u-${now}`, createdAtMs: now },
          { ...assistantMsg, id: `local-a-${now + 1}`, createdAtMs: now + 1 },
        ]);
        return;
      }

      try {
        const res = await fetch('/api/chat-messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenRef.current}`,
          },
          body: JSON.stringify({
            messages: [
              { ...userMsg, createdAtMs: now },
              { ...assistantMsg, createdAtMs: now + 1 },
            ],
          }),
        });
        const data = (await res.json()) as { saved?: AiChatMessageItem[] };
        if (res.ok && Array.isArray(data.saved) && data.saved.length > 0) {
          setRemoteChatMessages((prev) => [...prev, ...data.saved!]);
          return;
        }
      } catch {
        // Fallback to optimistic state
      }
      setRemoteChatMessages((prev) => [
        ...prev,
        { ...userMsg, id: `tmp-u-${now}`, createdAtMs: now },
        { ...assistantMsg, id: `tmp-a-${now + 1}`, createdAtMs: now + 1 },
      ]);
    },
    [user]
  );

  const clearChatMessages = useCallback(async () => {
    if (!user || !tokenRef.current) {
      setLocalChatMessages([]);
      onNotify?.('Riwayat Chat AI lokal dibersihkan.', 'info');
      return;
    }
    try {
      await fetch('/api/chat-messages', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenRef.current}` },
      });
      setRemoteChatMessages([]);
      onNotify?.('Riwayat Chat AI akun Anda berhasil dibersihkan.', 'info');
    } catch {
      onNotify?.('Gagal membersihkan riwayat chat di server.', 'error');
    }
  }, [onNotify, user]);

  const toggleChatOpen = useCallback(() => {
    setChatOpen((v) => !v);
  }, []);

  const attachXmlPartsToGemini = useCallback(
    (
      parts: GeminiXmlPartAttachment[],
      options?: { replace?: boolean; openChat?: boolean; switchToGemini?: boolean }
    ) => {
      const valid = parts.filter((p) => p && typeof p.content === 'string' && p.content.length > 0);
      if (valid.length === 0) return;

      setAttachedXmlParts((prev) => {
        if (options?.replace) return valid;
        const byId = new Map<string, GeminiXmlPartAttachment>();
        for (const item of prev) byId.set(item.id, item);
        for (const item of valid) byId.set(item.id, item);
        return Array.from(byId.values()).sort((a, b) => a.index - b.index);
      });

      if (options?.switchToGemini !== false) {
        const nextMode: AiEngineMode = user ? 'gemini' : 'freellm';
        setEngineModeState(nextMode);
        void persistUserPref({ preferredMode: nextMode });
      }
      if (options?.openChat !== false) {
        setChatOpen(true);
      }
    },
    [persistUserPref, user]
  );

  const removeAttachedXmlPart = useCallback((partId: string) => {
    setAttachedXmlParts((prev) => prev.filter((p) => p.id !== partId));
  }, []);

  const clearAttachedXmlParts = useCallback(() => {
    setAttachedXmlParts([]);
  }, []);

  const chatMessages = user ? remoteChatMessages : localChatMessages;
  const isAdmin = user?.role === 'admin';
  const userTier: UserAccountTier = user ? user.tier : 'free';

  const value: AuthAndAiContextValue = {
    user,
    sessionToken,
    authReady,
    isSigningIn,
    isAdmin,
    userTier,
    lastAuthError,
    clearLastAuthError,
    authModalOpen,
    openAuthModal: () => {
      setLastAuthError(null);
      setAuthModalOpen(true);
    },
    closeAuthModal: () => {
      setLastAuthError(null);
      setAuthModalOpen(false);
    },
    signInWithEmail,
    registerAccount,
    signInAsAdmin,
    claimAdminAccount,
    updateAdminAccount,
    signOutAccount,
    signInWithGoogle,
    signOutGoogle: signOutAccount,
    engineMode,
    setEngineMode,
    geminiModel,
    setGeminiModel,
    freellmModel,
    setFreeLlmModel,
    freellmStatus,
    setFreeLlmStatus,
    quota,
    chatMessages,
    isChatOpen,
    setChatOpen,
    toggleChatOpen,
    attachedXmlParts,
    attachXmlPartsToGemini,
    removeAttachedXmlPart,
    clearAttachedXmlParts,
    appendChatMessages,
    clearChatMessages,
    authorizedGeminiFetch,
    onNotify,
  };

  return (
    <AuthAndAiContext.Provider value={value}>
      {children}
    </AuthAndAiContext.Provider>
  );
};

export function useAuthAndAi(): AuthAndAiContextValue {
  const ctx = useContext(AuthAndAiContext);
  if (!ctx) {
    throw new Error('useAuthAndAi must be used inside AuthAndAiProvider.');
  }
  return ctx;
}
