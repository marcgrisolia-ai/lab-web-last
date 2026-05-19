import type { AppState, Lang } from '../models/types';

export const LANG_KEY = 'lab_customer_lang_v2';
export const STATE_KEY = 'lab_customer_state_v2';
export const MAPW_KEY = 'lab_customer_mapw_v3';
export const MAPH_KEY = 'lab_customer_maph_v3';

export const DEFAULT_MAP_W = 360;
export const DEFAULT_MAP_H = 72;
export const MAP_W_MIN = 160;
export const MAP_W_MAX = 760;
export const MAP_H_MIN = 72;
export const MAP_H_MAX = 360;

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

function loadLang(): Lang {
  const v = localStorage.getItem(LANG_KEY);
  return v === 'en' || v === 'es' || v === 'fr' || v === 'ca' ? v : 'es';
}

function loadNumber(key: string, fallback: number, min: number, max: number): number {
  const v = parseFloat(localStorage.getItem(key) || '');
  return Number.isFinite(v) ? clamp(v, min, max) : fallback;
}

function loadState(): AppState {
  let rawState: Partial<AppState> = {};
  try {
    const raw = localStorage.getItem(STATE_KEY);
    rawState = raw ? (JSON.parse(raw) as Partial<AppState>) : {};
  } catch {
    rawState = {};
  }
  return {
    lang: loadLang(),
    selectedCategoryId: rawState.selectedCategoryId ?? null,
    selectedTestId: rawState.selectedTestId ?? null,
    selectedLabId: rawState.selectedLabId ?? null,
    searchQuery: rawState.searchQuery ?? '',
    testPage: Number.isFinite(rawState.testPage) ? (rawState.testPage as number) : 0,
    mapW: loadNumber(MAPW_KEY, DEFAULT_MAP_W, MAP_W_MIN, MAP_W_MAX),
    mapH: loadNumber(MAPH_KEY, DEFAULT_MAP_H, MAP_H_MIN, MAP_H_MAX),
  };
}

function persistState(state: AppState): void {
  localStorage.setItem(LANG_KEY, state.lang);
  localStorage.setItem(MAPW_KEY, String(state.mapW));
  localStorage.setItem(MAPH_KEY, String(state.mapH));
  localStorage.setItem(
    STATE_KEY,
    JSON.stringify({
      selectedCategoryId: state.selectedCategoryId,
      selectedTestId: state.selectedTestId,
      selectedLabId: state.selectedLabId,
      searchQuery: state.searchQuery,
      testPage: state.testPage,
    }),
  );
}

export type Listener = (state: AppState) => void;

export function createStore() {
  let state = loadState();
  const listeners = new Set<Listener>();

  const getState = () => state;
  const setState = (patch: Partial<AppState>) => {
    state = { ...state, ...patch };
    persistState(state);
    listeners.forEach((cb) => cb(state));
  };
  const subscribe = (cb: Listener) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  };

  return { getState, setState, subscribe };
}
