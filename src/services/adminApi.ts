import type { Test } from '../models/types';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000';
const ADMIN_API_BASE = import.meta.env.VITE_ADMIN_API_BASE || '';
const ADMIN_API_KEY = import.meta.env.VITE_ADMIN_API_KEY || '';

function buildAdminHeaders(sourceLang?: string): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Admin-Key': ADMIN_API_KEY,
  };
  if (sourceLang) headers['X-Source-Lang'] = sourceLang;
  return headers;
}

async function requestAdmin<T>(
  path: string,
  payload: unknown,
  opts: { method?: 'PUT' | 'POST'; sourceLang?: string } = {},
): Promise<T> {
  if (!ADMIN_API_KEY) {
    throw new Error('Missing VITE_ADMIN_API_KEY in frontend env');
  }
  const base = ADMIN_API_BASE || `${API_BASE}/admin`;
  const res = await fetch(`${base}${path}`, {
    method: opts.method || 'PUT',
    headers: buildAdminHeaders(opts.sourceLang),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let detail = '';
    try {
      const json = (await res.json()) as { detail?: unknown };
      detail = typeof json.detail === 'string' ? json.detail : '';
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(`Admin request failed (${res.status})${detail ? `: ${detail}` : ''}`);
  }
  return (await res.json()) as T;
}

export function hasAdminApiKey(): boolean {
  return !!ADMIN_API_KEY;
}

export async function updateAdminTest(
  testId: string,
  patch: Partial<Test>,
  sourceLang: string,
): Promise<Test> {
  return requestAdmin<Test>(`/tests/${encodeURIComponent(testId)}`, patch, {
    method: 'PUT',
    sourceLang,
  });
}

export async function createAdminTest(payload: Test, sourceLang: string): Promise<Test> {
  return requestAdmin<Test>('/tests', payload, {
    method: 'POST',
    sourceLang,
  });
}
