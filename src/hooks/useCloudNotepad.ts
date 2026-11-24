import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthAndAi } from '../contexts/AuthAndAiContext';

export type NoteTag = 'umum' | 'xml' | 'css' | 'url' | 'ide';

export const NOTE_TAG_LABELS: Record<NoteTag, string> = {
  umum: 'Umum',
  xml: 'XML',
  css: 'CSS',
  url: 'URL / Query',
  ide: 'Ide',
};

export const MAX_NOTE_TITLE_LENGTH = 160;
export const MAX_NOTE_CONTENT_LENGTH = 50000;
export const MAX_NOTE_TEMPLATE_HINT_LENGTH = 120;

export interface CloudNotepadNote {
  id: string;
  title: string;
  content: string;
  tag: NoteTag;
  pinned: boolean;
  templateHint: string;
  createdAtMs: number;
  updatedAtMs: number;
  cloudSyncedAtMs: number | null;
  inCloud: boolean;
  dirty: boolean;
}

interface StoredDraftMap {
  [noteId: string]: CloudNotepadNote;
}

const DRAFT_STORAGE_PREFIX = 'temaloka_notepad_drafts_v1:';

function getStorageKey(uid: string | null | undefined): string {
  return `${DRAFT_STORAGE_PREFIX}${uid || 'guest'}`;
}

export function createSafeNoteId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `note_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function normalizeTag(value: unknown): NoteTag {
  if (
    value === 'umum' ||
    value === 'xml' ||
    value === 'css' ||
    value === 'url' ||
    value === 'ide'
  ) {
    return value;
  }
  return 'umum';
}

function loadDraftsForAccount(uid: string | null | undefined): StoredDraftMap {
  try {
    const raw = localStorage.getItem(getStorageKey(uid));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const result: StoredDraftMap = {};
    for (const [id, val] of Object.entries(parsed as Record<string, unknown>)) {
      if (!val || typeof val !== 'object' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
        continue;
      }
      const item = val as Partial<CloudNotepadNote>;
      result[id] = {
        id,
        title: typeof item.title === 'string' ? item.title.slice(0, MAX_NOTE_TITLE_LENGTH) : 'Catatan Tanpa Judul',
        content: typeof item.content === 'string' ? item.content.slice(0, MAX_NOTE_CONTENT_LENGTH) : '',
        tag: normalizeTag(item.tag),
        pinned: Boolean(item.pinned),
        templateHint:
          typeof item.templateHint === 'string'
            ? item.templateHint.slice(0, MAX_NOTE_TEMPLATE_HINT_LENGTH)
            : '',
        createdAtMs: typeof item.createdAtMs === 'number' ? item.createdAtMs : Date.now(),
        updatedAtMs: typeof item.updatedAtMs === 'number' ? item.updatedAtMs : Date.now(),
        cloudSyncedAtMs: typeof item.cloudSyncedAtMs === 'number' ? item.cloudSyncedAtMs : null,
        inCloud: Boolean(item.inCloud),
        dirty: item.dirty !== undefined ? Boolean(item.dirty) : true,
      };
    }
    return result;
  } catch {
    return {};
  }
}

function saveDraftsForAccount(uid: string | null | undefined, map: StoredDraftMap): void {
  try {
    localStorage.setItem(getStorageKey(uid), JSON.stringify(map));
  } catch {
    // Ignore localStorage quota overflow
  }
}

function buildInitialDraftNote(templateHint = ''): CloudNotepadNote {
  const now = Date.now();
  return {
    id: createSafeNoteId(),
    title: 'Catatan Baru',
    content: '',
    tag: 'umum',
    pinned: false,
    templateHint: templateHint.slice(0, MAX_NOTE_TEMPLATE_HINT_LENGTH),
    createdAtMs: now,
    updatedAtMs: now,
    cloudSyncedAtMs: null,
    inCloud: false,
    dirty: true,
  };
}

export function useCloudNotepad(options?: {
  activeTemplateTitle?: string;
  isOfflineMode?: boolean;
}) {
  const {
    user,
    sessionToken,
    authReady,
    openAuthModal,
    onNotify,
  } = useAuthAndAi();

  const activeTemplateTitle = options?.activeTemplateTitle || '';
  const isOfflineMode = Boolean(options?.isOfflineMode);
  const accountUid = user?.id || null;

  const [cloudNotesMap, setCloudNotesMap] = useState<Record<string, CloudNotepadNote>>({});
  const [draftsMap, setDraftsMap] = useState<StoredDraftMap>(() =>
    loadDraftsForAccount(null)
  );
  const [selectedNoteId, setSelectedNoteId] = useState<string>('');
  const [savingNoteIds, setSavingNoteIds] = useState<Record<string, boolean>>({});
  const [deletingNoteIds, setDeletingNoteIds] = useState<Record<string, boolean>>({});
  const [cloudLoading, setCloudLoading] = useState(false);

  useEffect(() => {
    const loaded = loadDraftsForAccount(accountUid);
    setDraftsMap(loaded);
    setCloudNotesMap({});
    const firstId = Object.keys(loaded)[0] || '';
    setSelectedNoteId(firstId);
  }, [accountUid]);

  useEffect(() => {
    saveDraftsForAccount(accountUid, draftsMap);
  }, [accountUid, draftsMap]);

  // Fetch notes from Cloudflare D1 when authenticated
  useEffect(() => {
    if (!authReady || !user || !sessionToken || isOfflineMode) {
      if (!user) setCloudNotesMap({});
      setCloudLoading(false);
      return;
    }

    let cancelled = false;
    setCloudLoading(true);
    fetch('/api/notes', {
      headers: { Authorization: `Bearer ${sessionToken}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: {
        notes?: Array<{
          id: string;
          title: string;
          content: string;
          tag: string;
          pinned: boolean;
          templateHint: string;
          createdAtMs: number;
          updatedAtMs: number;
        }>;
      } | null) => {
        if (cancelled || !data?.notes) return;
        const nextCloud: Record<string, CloudNotepadNote> = {};
        for (const n of data.notes) {
          nextCloud[n.id] = {
            id: n.id,
            title: (n.title || 'Catatan Tanpa Judul').slice(0, MAX_NOTE_TITLE_LENGTH),
            content: (n.content || '').slice(0, MAX_NOTE_CONTENT_LENGTH),
            tag: normalizeTag(n.tag),
            pinned: Boolean(n.pinned),
            templateHint: (n.templateHint || '').slice(0, MAX_NOTE_TEMPLATE_HINT_LENGTH),
            createdAtMs: n.createdAtMs,
            updatedAtMs: n.updatedAtMs,
            cloudSyncedAtMs: n.updatedAtMs,
            inCloud: true,
            dirty: false,
          };
        }
        setCloudNotesMap(nextCloud);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setCloudLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authReady, user?.id, sessionToken, isOfflineMode]);

  const notes = useMemo<CloudNotepadNote[]>(() => {
    const merged: Record<string, CloudNotepadNote> = { ...cloudNotesMap };

    for (const [id, draft] of Object.entries(draftsMap)) {
      const cloudMatch = cloudNotesMap[id];
      if (!cloudMatch) {
        merged[id] = {
          ...draft,
          inCloud: false,
          dirty: true,
        };
      } else if (draft.dirty) {
        merged[id] = {
          ...draft,
          inCloud: true,
          cloudSyncedAtMs: cloudMatch.cloudSyncedAtMs,
          createdAtMs: cloudMatch.createdAtMs,
          dirty: true,
        };
      } else {
        merged[id] = cloudMatch;
      }
    }

    return Object.values(merged).sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updatedAtMs - a.updatedAtMs;
    });
  }, [cloudNotesMap, draftsMap]);

  useEffect(() => {
    if (notes.length === 0) {
      if (selectedNoteId) setSelectedNoteId('');
      return;
    }
    const exists = notes.some((n) => n.id === selectedNoteId);
    if (!exists) {
      setSelectedNoteId(notes[0].id);
    }
  }, [notes, selectedNoteId]);

  const activeNote = useMemo(
    () => notes.find((n) => n.id === selectedNoteId) || null,
    [notes, selectedNoteId]
  );

  const cloudCount = useMemo(
    () => notes.filter((n) => n.inCloud).length,
    [notes]
  );

  const dirtyCount = useMemo(
    () => notes.filter((n) => n.dirty).length,
    [notes]
  );

  const createNewNote = useCallback(
    (prefill?: { title?: string; content?: string; tag?: NoteTag }) => {
      const fresh = buildInitialDraftNote(activeTemplateTitle);
      if (prefill?.title) {
        fresh.title = prefill.title.slice(0, MAX_NOTE_TITLE_LENGTH);
      }
      if (prefill?.content !== undefined) {
        fresh.content = prefill.content.slice(0, MAX_NOTE_CONTENT_LENGTH);
      }
      if (prefill?.tag) {
        fresh.tag = prefill.tag;
      }
      setDraftsMap((prev) => ({
        ...prev,
        [fresh.id]: fresh,
      }));
      setSelectedNoteId(fresh.id);
      return fresh.id;
    },
    [activeTemplateTitle]
  );

  const updateDraftNote = useCallback(
    (
      noteId: string,
      patch: Partial<Pick<CloudNotepadNote, 'title' | 'content' | 'tag' | 'pinned' | 'templateHint'>>
    ) => {
      const existing = notes.find((n) => n.id === noteId);
      if (!existing) return;

      const nextNote: CloudNotepadNote = {
        ...existing,
        ...patch,
        title:
          patch.title !== undefined
            ? patch.title.slice(0, MAX_NOTE_TITLE_LENGTH)
            : existing.title,
        content:
          patch.content !== undefined
            ? patch.content.slice(0, MAX_NOTE_CONTENT_LENGTH)
            : existing.content,
        tag: patch.tag !== undefined ? normalizeTag(patch.tag) : existing.tag,
        templateHint:
          patch.templateHint !== undefined
            ? patch.templateHint.slice(0, MAX_NOTE_TEMPLATE_HINT_LENGTH)
            : existing.templateHint,
        updatedAtMs: Date.now(),
        dirty: true,
      };

      setDraftsMap((prev) => ({
        ...prev,
        [noteId]: nextNote,
      }));
    },
    [notes]
  );

  const saveNoteToCloud = useCallback(
    async (noteId: string): Promise<boolean> => {
      const targetNote = notes.find((n) => n.id === noteId);
      if (!targetNote) return false;

      if (isOfflineMode) {
        onNotify?.(
          'Mode Offline aktif. Catatan disimpan sebagai draft lokal — aktifkan Mode Online untuk simpan ke Cloud.',
          'info'
        );
        return false;
      }

      if (!user || !sessionToken) {
        openAuthModal();
        onNotify?.(
          'Catatan aman sebagai draft lokal. Masuk akun TemaLoka untuk menyinkronkan ke Cloud.',
          'info'
        );
        return false;
      }

      const safeId = /^[a-zA-Z0-9_-]{1,128}$/.test(targetNote.id)
        ? targetNote.id
        : createSafeNoteId();
      const normalizedTitle =
        targetNote.title.trim().slice(0, MAX_NOTE_TITLE_LENGTH) || 'Catatan Tanpa Judul';
      const normalizedContent = targetNote.content.slice(0, MAX_NOTE_CONTENT_LENGTH);
      const normalizedTag = normalizeTag(targetNote.tag);
      const normalizedHint = (
        targetNote.templateHint ||
        activeTemplateTitle ||
        ''
      ).slice(0, MAX_NOTE_TEMPLATE_HINT_LENGTH);

      setSavingNoteIds((prev) => ({ ...prev, [noteId]: true }));

      try {
        const res = await fetch(`/api/notes/${encodeURIComponent(safeId)}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({
            title: normalizedTitle,
            content: normalizedContent,
            tag: normalizedTag,
            pinned: Boolean(targetNote.pinned),
            templateHint: normalizedHint,
          }),
        });
        const data = (await res.json()) as {
          note?: {
            id: string;
            title: string;
            content: string;
            tag: string;
            pinned: boolean;
            templateHint: string;
            createdAtMs: number;
            updatedAtMs: number;
          };
          error?: string;
        };
        if (!res.ok || !data.note) {
          throw new Error(data.error || 'Gagal menyimpan catatan ke Cloud.');
        }

        const savedNote: CloudNotepadNote = {
          id: data.note.id,
          title: data.note.title,
          content: data.note.content,
          tag: normalizeTag(data.note.tag),
          pinned: data.note.pinned,
          templateHint: data.note.templateHint,
          createdAtMs: data.note.createdAtMs,
          updatedAtMs: data.note.updatedAtMs,
          cloudSyncedAtMs: data.note.updatedAtMs,
          inCloud: true,
          dirty: false,
        };

        setCloudNotesMap((prev) => ({ ...prev, [safeId]: savedNote }));
        setDraftsMap((prev) => {
          const next = { ...prev };
          delete next[noteId];
          delete next[safeId];
          return next;
        });

        setSelectedNoteId(safeId);
        onNotify?.(
          `Catatan "${normalizedTitle}" tersimpan di Cloud (${user.email}).`,
          'success'
        );
        return true;
      } catch (err) {
        onNotify?.(
          err instanceof Error
            ? `Gagal menyimpan catatan ke Cloud: ${err.message}`
            : 'Gagal menyimpan catatan ke Cloud.',
          'error'
        );
        return false;
      } finally {
        setSavingNoteIds((prev) => {
          const next = { ...prev };
          delete next[noteId];
          return next;
        });
      }
    },
    [
      activeTemplateTitle,
      isOfflineMode,
      notes,
      onNotify,
      openAuthModal,
      sessionToken,
      user,
    ]
  );

  const discardLocalChanges = useCallback(
    (noteId: string) => {
      if (!cloudNotesMap[noteId]) return;
      setDraftsMap((prev) => {
        const next = { ...prev };
        delete next[noteId];
        return next;
      });
      onNotify?.('Perubahan lokal dibatalkan, dikembalikan ke versi Cloud.', 'info');
    },
    [cloudNotesMap, onNotify]
  );

  const deleteNote = useCallback(
    async (noteId: string): Promise<boolean> => {
      const target = notes.find((n) => n.id === noteId);
      if (!target) return false;

      if (target.inCloud && user && sessionToken) {
        setDeletingNoteIds((prev) => ({ ...prev, [noteId]: true }));
        try {
          await fetch(`/api/notes/${encodeURIComponent(noteId)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${sessionToken}` },
          });
          setCloudNotesMap((prev) => {
            const next = { ...prev };
            delete next[noteId];
            return next;
          });
        } catch {
          onNotify?.('Gagal menghapus catatan dari Cloud.', 'error');
        } finally {
          setDeletingNoteIds((prev) => {
            const next = { ...prev };
            delete next[noteId];
            return next;
          });
        }
      }

      setDraftsMap((prev) => {
        const next = { ...prev };
        delete next[noteId];
        return next;
      });

      onNotify?.(`Catatan "${target.title || 'Tanpa Judul'}" dihapus.`, 'info');
      return true;
    },
    [notes, onNotify, sessionToken, user]
  );

  return {
    user,
    notes,
    activeNote,
    selectedNoteId,
    setSelectedNoteId,
    cloudLoading,
    cloudCount,
    dirtyCount,
    savingNoteIds,
    deletingNoteIds,
    createNewNote,
    updateDraftNote,
    saveNoteToCloud,
    discardLocalChanges,
    deleteNote,
  };
}
