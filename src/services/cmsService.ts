import type { Category, Lab, Test } from '../models/types';

const CMS_PROVIDER = import.meta.env.VITE_CMS_PROVIDER || '';
const CMS_URL = import.meta.env.VITE_CMS_URL || '';
const CMS_TOKEN = import.meta.env.VITE_CMS_TOKEN || '';
const CMS_CACHE_TTL_MS = Number(import.meta.env.VITE_CMS_CACHE_TTL_MS || 300000);

const cacheKey = (key: string) => `lab_cms_${key}`;

function getCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(cacheKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; data: T };
    if (Date.now() - parsed.ts > CMS_CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function setCache<T>(key: string, data: T): void {
  try {
    localStorage.setItem(cacheKey(key), JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // ignore
  }
}

async function fetchDirectus<T>(collection: string, fields: string[]): Promise<T[] | null> {
  if (!CMS_URL) return null;
  const url = new URL(`/items/${collection}`, CMS_URL);
  url.searchParams.set('limit', '-1');
  url.searchParams.set('fields', fields.join(','));
  const headers: Record<string, string> = {};
  if (CMS_TOKEN) headers.Authorization = `Bearer ${CMS_TOKEN}`;
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) return null;
  const json = (await res.json()) as { data: T[] };
  return json.data;
}

function toText(en?: string, es?: string, fr?: string, ca?: string) {
  return { en, es, fr, ca };
}

function normalizeRefStdId(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return /^to[\s_-]*define$/i.test(raw) ? 'Internal Method' : raw;
}

type DirectusLabRow = {
  id: unknown;
  color?: unknown;
  coords_lat?: unknown;
  coords_lng?: unknown;
  img?: unknown;
  name_en?: unknown;
  name_es?: unknown;
  name_fr?: unknown;
  name_ca?: unknown;
  address_en?: unknown;
  address_es?: unknown;
  address_fr?: unknown;
  address_ca?: unknown;
  desc_en?: unknown;
  desc_es?: unknown;
  desc_fr?: unknown;
  desc_ca?: unknown;
  overview_en?: unknown;
  overview_es?: unknown;
  overview_fr?: unknown;
  overview_ca?: unknown;
  location_en?: unknown;
  location_es?: unknown;
  location_fr?: unknown;
  location_ca?: unknown;
};

type DirectusCategoryRow = {
  id: unknown;
  icon?: unknown;
  title_en?: unknown;
  title_es?: unknown;
  title_fr?: unknown;
  title_ca?: unknown;
  subtitle_en?: unknown;
  subtitle_es?: unknown;
  subtitle_fr?: unknown;
  subtitle_ca?: unknown;
};

type DirectusTestRow = {
  id: unknown;
  category_id: unknown;
  icon?: unknown;
  title_en?: unknown;
  title_es?: unknown;
  title_fr?: unknown;
  title_ca?: unknown;
  summary_en?: unknown;
  summary_es?: unknown;
  summary_fr?: unknown;
  summary_ca?: unknown;
  why_en?: unknown;
  why_es?: unknown;
  why_fr?: unknown;
  why_ca?: unknown;
  how_en?: unknown;
  how_es?: unknown;
  how_fr?: unknown;
  how_ca?: unknown;
  tags?: unknown;
  labs?: unknown;
  refStdId?: unknown;
  refClause?: unknown;
};

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

export async function fetchCmsContent(): Promise<{
  labs: Lab[];
  categories: Category[];
  tests: Test[];
} | null> {
  if (CMS_PROVIDER !== 'directus') return null;

  const cached = getCache<{ labs: Lab[]; categories: Category[]; tests: Test[] }>('content');
  if (cached) return cached;

  const labFields = [
    'id',
    'color',
    'coords_lat',
    'coords_lng',
    'img',
    'name_en',
    'name_es',
    'name_fr',
    'name_ca',
    'address_en',
    'address_es',
    'address_fr',
    'address_ca',
    'desc_en',
    'desc_es',
    'desc_fr',
    'desc_ca',
    'overview_en',
    'overview_es',
    'overview_fr',
    'overview_ca',
    'location_en',
    'location_es',
    'location_fr',
    'location_ca',
  ];
  const categoryFields = [
    'id',
    'icon',
    'order',
    'title_en',
    'title_es',
    'title_fr',
    'title_ca',
    'subtitle_en',
    'subtitle_es',
    'subtitle_fr',
    'subtitle_ca',
  ];
  const testFields = [
    'id',
    'category_id',
    'icon',
    'title_en',
    'title_es',
    'title_fr',
    'title_ca',
    'summary_en',
    'summary_es',
    'summary_fr',
    'summary_ca',
    'why_en',
    'why_es',
    'why_fr',
    'why_ca',
    'how_en',
    'how_es',
    'how_fr',
    'how_ca',
    'tags',
    'labs',
    'refStdId',
    'refClause',
  ];

  const [labRows, categoryRows, testRows] = await Promise.all([
    fetchDirectus<DirectusLabRow>('labs', labFields),
    fetchDirectus<DirectusCategoryRow>('categories', categoryFields),
    fetchDirectus<DirectusTestRow>('tests', testFields),
  ]);

  if (!labRows || !categoryRows || !testRows) return null;

  const labs: Lab[] = [];
  labRows.forEach((l) => {
      const lat = Number(l.coords_lat);
      const lng = Number(l.coords_lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      labs.push({
        id: String(l.id),
        color: asString(l.color, '#5bbcff'),
        coords: [lat, lng] as [number, number],
        img: asString(l.img),
        name: toText(asString(l.name_en), asString(l.name_es), asString(l.name_fr), asString(l.name_ca)),
        address: toText(
          asString(l.address_en),
          asString(l.address_es),
          asString(l.address_fr),
          asString(l.address_ca),
        ),
        desc: toText(asString(l.desc_en), asString(l.desc_es), asString(l.desc_fr), asString(l.desc_ca)),
        overview: toText(
          asString(l.overview_en),
          asString(l.overview_es),
          asString(l.overview_fr),
          asString(l.overview_ca),
        ),
        location: toText(
          asString(l.location_en),
          asString(l.location_es),
          asString(l.location_fr),
          asString(l.location_ca),
        ),
      });
    });

  const categories: Category[] = categoryRows
    .map((c) => ({
      id: String(c.id),
      icon: asString(c.icon, '🧩'),
      title: toText(asString(c.title_en), asString(c.title_es), asString(c.title_fr), asString(c.title_ca)),
      subtitle: toText(
        asString(c.subtitle_en),
        asString(c.subtitle_es),
        asString(c.subtitle_fr),
        asString(c.subtitle_ca),
      ),
    }))
    .filter((category) => !!category.id);

  const tests: Test[] = testRows
    .map((t) => ({
      id: String(t.id),
      categoryId: String(t.category_id),
      icon: asString(t.icon, '📄'),
      title: toText(asString(t.title_en), asString(t.title_es), asString(t.title_fr), asString(t.title_ca)),
      summary: toText(
        asString(t.summary_en),
        asString(t.summary_es),
        asString(t.summary_fr),
        asString(t.summary_ca),
      ),
      why: toText(asString(t.why_en), asString(t.why_es), asString(t.why_fr), asString(t.why_ca)),
      how: toText(asString(t.how_en), asString(t.how_es), asString(t.how_fr), asString(t.how_ca)),
      tags: Array.isArray(t.tags) ? t.tags.map((tag) => String(tag)) : [],
      labs: Array.isArray(t.labs) ? t.labs.map((labId) => String(labId)) : null,
      refStdId: normalizeRefStdId(t.refStdId),
      refClause: asString(t.refClause),
    }))
    .filter((test) => !!test.id && !!test.categoryId);

  const payload = { labs, categories, tests };
  setCache('content', payload);
  return payload;
}
