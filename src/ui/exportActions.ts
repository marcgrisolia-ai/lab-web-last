import type { Lang } from '../models/types';

export async function runExportTestsExcel(lang: Lang): Promise<void> {
  const { exportTestsToExcel } = await import('../export/excel');
  await exportTestsToExcel(lang);
}

export async function runExportTestPdf(testId: string, lang: Lang): Promise<void> {
  const { exportTestToPDF } = await import('../export/pdf');
  await exportTestToPDF(testId, lang);
}
