// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * UseAppState.ts — the single state hook every surface uses.
 *
 * One fetch on mount, then everything else arrives over the port. Mutations
 * round-trip through the service worker and replace the state wholesale, so
 * there is never a stale local copy.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { bridge } from '@Shared/Bridge/ExtensionBridge';
import type { StreamEvent, UiState } from '@Shared/Protocol';
import type { Settings, TaskKey } from '@Shared/Types';
import type { ToastItem, ToastLevel } from '../Components/Toast';

export interface AppStateApi {
  state: UiState | null;
  loading: boolean;
  error: string | null;
  toasts: ToastItem[];
  dismissToast: (id: string) => void;
  toast: (level: ToastLevel, message: string) => void;
  saveSettings: (next: Settings) => Promise<void>;
  patchSettings: (mutate: (draft: Settings) => void) => Promise<void>;
  refreshProfile: () => Promise<void>;
  startRun: (only?: TaskKey[]) => Promise<void>;
  cancelRun: () => Promise<void>;
  clearHistory: () => Promise<void>;
  clearLogs: () => Promise<void>;
  setToken: (token: string) => Promise<boolean>;
  resetSettings: () => Promise<void>;
}

export function useAppState(): AppStateApi {
  const [state, setState] = useState<UiState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const toast = useCallback((level: ToastLevel, message: string) => {
    counter.current += 1;
    const id = `t${counter.current}`;
    setToasts((current) => [...current.slice(-2), { id, level, message }]);
    setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 3600);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  useEffect(() => {
    let alive = true;

    void bridge.send<UiState>({ type: 'state/get' }).then((result) => {
      if (!alive) return;
      if (result.ok) setState(result.value);
      else setError(result.error.message);
      setLoading(false);
    });

    const off = bridge.subscribe((event: StreamEvent) => {
      if (event.type === 'hello' || event.type === 'state') {
        setState(event.state);
        setLoading(false);
        return;
      }
      if (event.type === 'toast') {
        toast(event.level, event.message);
        return;
      }
      setState((current) => {
        if (!current) return current;
        if (event.type === 'run') return { ...current, run: event.run };
        if (event.type === 'profile') return { ...current, profile: event.profile };
        if (event.type === 'log') return { ...current, logs: [...current.logs.slice(-199), event.entry] };
        return current;
      });
    });

    return () => {
      alive = false;
      off();
    };
  }, [toast]);

  const saveSettings = useCallback(
    async (next: Settings) => {
      const result = await bridge.send<UiState>({ type: 'settings/save', settings: next });
      if (result.ok) setState(result.value);
      else toast('error', result.error.message);
    },
    [toast],
  );

  const patchSettings = useCallback(
    async (mutate: (draft: Settings) => void) => {
      if (!state) return;
      const draft = structuredClone(state.settings);
      mutate(draft);
      await saveSettings(draft);
    },
    [state, saveSettings],
  );

  const refreshProfile = useCallback(async () => {
    const result = await bridge.send({ type: 'profile/refresh' });
    if (!result.ok) toast('error', result.error.message);
    else toast('success', 'Profile refreshed');
  }, [toast]);

  const startRun = useCallback(
    async (only?: TaskKey[]) => {
      const result = await bridge.send({ type: 'run/start', trigger: 'manual', only });
      if (!result.ok) toast('error', result.error.message);
    },
    [toast],
  );

  const cancelRun = useCallback(async () => {
    await bridge.send({ type: 'run/cancel' });
  }, []);

  const clearHistory = useCallback(async () => {
    await bridge.send({ type: 'history/clear' });
    toast('success', 'History cleared');
  }, [toast]);

  const clearLogs = useCallback(async () => {
    await bridge.send({ type: 'logs/clear' });
  }, []);

  const setToken = useCallback(
    async (token: string) => {
      const result = await bridge.send<{ valid: boolean; message: string }>({ type: 'token/set', token });
      if (!result.ok) {
        toast('error', result.error.message);
        return false;
      }
      toast(result.value.valid ? 'success' : 'warn', result.value.message);
      return result.value.valid;
    },
    [toast],
  );

  const resetSettings = useCallback(async () => {
    const result = await bridge.send<UiState>({ type: 'settings/reset' });
    if (result.ok) setState(result.value);
    toast('success', 'Settings restored to defaults');
  }, [toast]);

  return useMemo(
    () => ({
      state,
      loading,
      error,
      toasts,
      dismissToast,
      toast,
      saveSettings,
      patchSettings,
      refreshProfile,
      startRun,
      cancelRun,
      clearHistory,
      clearLogs,
      setToken,
      resetSettings,
    }),
    [
      state,
      loading,
      error,
      toasts,
      dismissToast,
      toast,
      saveSettings,
      patchSettings,
      refreshProfile,
      startRun,
      cancelRun,
      clearHistory,
      clearLogs,
      setToken,
      resetSettings,
    ],
  );
}
