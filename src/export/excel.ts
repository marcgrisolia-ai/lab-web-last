import * as XLSX from 'xlsx';
import type { Lang } from '../models/types';
import { getContentBundle } from '../store/contentStore';
import { tx } from '../ui/utils';

export async function exportTestsToExcel(lang: Lang): Promise<void> {
  const { tests, categories } = getContentBundle();
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const isToDefine = (value: string) => /^to[\s_-]*define$/i.test(value.trim());

  const rows = tests.map((t) => ({
    id: t.id,
    categoryId: t.categoryId,
    categoryTitle: tx(catMap.get(t.categoryId)?.title || '', lang),
    title: tx(t.title, lang),
    summary: tx(t.summary, lang),
    why: tx(t.why, lang),
    how: tx(t.how, lang),
    tags: (t.tags || []).join(', '),
    labs: (t.labs || []).join(', '),
    refStdId: t.refStdId && isToDefine(t.refStdId) ? 'Internal Method' : t.refStdId || '',
    refClause: t.refClause || '',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tests');
  XLSX.writeFile(wb, `lab-tests_${lang}.xlsx`);
}
