import type { Category, Lab, Test } from '../models/types';

const API_BASE = import.meta.env.BASE_URL === '/lab-web-last/' ? '' : import.meta.env.VITE_API_BASE || '';

function requireApiBase(): string {
  if (!API_BASE) {
    throw new Error('VITE_API_BASE is not configured');
  }
  return API_BASE;
}

export function hasPublicApiBase(): boolean {
  return !!API_BASE;
}

function extractArray<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data as T[];
    if (Array.isArray(obj.tests)) return obj.tests as T[];
    if (Array.isArray(obj.standards)) return obj.standards as T[];
    if (Array.isArray(obj.items)) return obj.items as T[];
  }
  return [];
}

export async function fetchTests(): Promise<Test[]> {
  const res = await fetch(`${requireApiBase()}/public/tests`);
  if (!res.ok) throw new Error(`fetchTests failed: ${res.status}`);
  const payload = (await res.json()) as unknown;
  return extractArray<Test>(payload);
}

export async function fetchStandards(): Promise<unknown[]> {
  const res = await fetch(`${requireApiBase()}/public/standards`);
  if (!res.ok) throw new Error(`fetchStandards failed: ${res.status}`);
  const payload = (await res.json()) as unknown;
  return extractArray<unknown>(payload);
}

export type PublicContentPayload = {
  labs: Lab[];
  categories: Category[];
  tests: Test[];
  standards: unknown[];
};

export async function fetchPublicContent(): Promise<PublicContentPayload> {
  const res = await fetch(`${requireApiBase()}/public/content`);
  if (!res.ok) throw new Error(`fetchPublicContent failed: ${res.status}`);
  const payload = (await res.json()) as unknown;
  if (!payload || typeof payload !== 'object') {
    throw new Error('fetchPublicContent failed: invalid payload');
  }
  const obj = payload as Record<string, unknown>;
  return {
    labs: extractArray<Lab>(obj.labs),
    categories: extractArray<Category>(obj.categories),
    tests: extractArray<Test>(obj.tests),
    standards: extractArray<unknown>(obj.standards),
  };
}
