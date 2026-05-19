import type { Category, Lab, Test, UiStrings, Lang } from '../models/types';

const warn = (msg: string) => console.warn(`[dataLoader] ${msg}`);

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) {
      warn(`Failed to load ${url}: ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    warn(`Error loading ${url}: ${(err as Error).message}`);
    return null;
  }
}

function isArray<T>(v: unknown): v is T[] {
  return Array.isArray(v);
}

function validateLabs(raw: unknown): Lab[] {
  if (!isArray<Lab>(raw)) {
    warn('labs.json is not an array');
    return [];
  }
  return raw.filter(
    (lab) =>
      lab &&
      typeof lab.id === 'string' &&
      Array.isArray(lab.coords) &&
      lab.coords.length === 2 &&
      Number.isFinite(Number(lab.coords[0])) &&
      Number.isFinite(Number(lab.coords[1])),
  );
}

function validateCategories(raw: unknown): Category[] {
  if (!isArray<Category>(raw)) {
    warn('categories.json is not an array');
    return [];
  }
  return raw.filter((cat) => cat && typeof cat.id === 'string');
}

function validateTests(raw: unknown): Test[] {
  if (!isArray<Test>(raw)) {
    warn('tests.json is not an array');
    return [];
  }
  return raw.filter(
    (t) =>
      t &&
      typeof t.id === 'string' &&
      typeof t.categoryId === 'string' &&
      Array.isArray(t.tags) &&
      (t.labs === null || Array.isArray(t.labs)),
  );
}

function validateUiStrings(raw: unknown): UiStrings {
  if (!raw || typeof raw !== 'object') {
    warn('i18n json is invalid');
    return {} as UiStrings;
  }
  return raw as UiStrings;
}

export const dataLoader = {
  async getLabs(): Promise<Lab[]> {
    const raw = await fetchJson<Lab[]>('/data/labs.json');
    return validateLabs(raw);
  },
  async getCategories(): Promise<Category[]> {
    const raw = await fetchJson<Category[]>('/data/categories.json');
    return validateCategories(raw);
  },
  async getTests(): Promise<Test[]> {
    const raw = await fetchJson<Test[]>('/data/tests.json');
    return validateTests(raw);
  },
  async getUiStrings(lang: Lang): Promise<UiStrings> {
    const raw = await fetchJson<UiStrings>(`/i18n/${lang}.json`);
    return validateUiStrings(raw);
  },
};
