import { jsPDF } from 'jspdf';
import type { Lang } from '../models/types';
import { getContentBundle } from '../store/contentStore';
import { tx } from '../ui/utils';

export async function exportTestToPDF(testId: string, lang: Lang): Promise<void> {
  const { tests, labs } = getContentBundle();
  const test = tests.find((t) => t.id === testId);
  if (!test) return;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;
  let y = 56;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Schneider Electric — Lab Tests', margin, y);
  y += 18;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const now = new Date().toLocaleString();
  doc.text(`Generated: ${now} | Lang: ${lang.toUpperCase()}`, margin, y);
  y += 24;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(tx(test.title, lang), margin, y);
  y += 16;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  const summaryLines = doc.splitTextToSize(tx(test.summary, lang), pageWidth - margin * 2);
  doc.text(summaryLines, margin, y);
  y += summaryLines.length * 14 + 10;

  doc.setFont('helvetica', 'bold');
  doc.text('Why this test matters', margin, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  const whyLines = doc.splitTextToSize(tx(test.why, lang), pageWidth - margin * 2);
  doc.text(whyLines, margin, y);
  y += whyLines.length * 14 + 12;

  doc.setFont('helvetica', 'bold');
  doc.text('How we run it', margin, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  const howLines = doc.splitTextToSize(tx(test.how, lang), pageWidth - margin * 2);
  doc.text(howLines, margin, y);
  y += howLines.length * 14 + 12;

  const relatedLabs = (test.labs && test.labs.length ? test.labs : labs.map((l) => l.id))
    .map((id) => labs.find((l) => l.id === id))
    .filter(Boolean);

  doc.setFont('helvetica', 'bold');
  doc.text('Related laboratories', margin, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  relatedLabs.forEach((lab) => {
    if (!lab) return;
    const line = `${tx(lab.name, lang)} — ${tx(lab.address, lang)}`;
    const lines = doc.splitTextToSize(line, pageWidth - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 14 + 4;
  });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'italic');
  doc.text(`Generated from web app`, margin, doc.internal.pageSize.getHeight() - 32);

  doc.save(`${test.id}_${lang}.pdf`);
}
