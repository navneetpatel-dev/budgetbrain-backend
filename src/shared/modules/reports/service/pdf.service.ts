import PDFDocument from 'pdfkit';
import { Transaction, Category, IncomeSource } from '@database/models';
import { fetchReportTransactions, sumConvertedIncomeAndExpense } from './report.service';
import type { ReportFilters } from '../reports.types';

export async function generatePdfReport(
  userId: string,
  filtersOrStartDate?: ReportFilters | string,
  maybeEndDate?: string
): Promise<Buffer> {
  let filters: ReportFilters = {};
  if (typeof filtersOrStartDate === 'string') {
    filters = { startDate: filtersOrStartDate, endDate: maybeEndDate };
  } else if (filtersOrStartDate) {
    filters = filtersOrStartDate;
  }

  const transactions = await fetchReportTransactions(userId, filters);
  const { currency, totalIncome, totalExpenses } = await sumConvertedIncomeAndExpense(
    userId,
    transactions
  );

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).text('BudgetBrain Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).fillColor('#666').text(`Generated: ${new Date().toISOString()}`, { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(11).fillColor('#000');
    doc.text('Date', 50, doc.y, { continued: true, width: 75 });
    doc.text('Type', { continued: true, width: 55 });
    doc.text('Amount', { continued: true, width: 80 });
    doc.text('Category', { continued: true, width: 100 });
    doc.text('Merchant', { continued: true, width: 110 });
    doc.text('Notes');
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke('#ccc');
    doc.moveDown(0.5);

    for (const t of transactions) {
      const cat = (t as Transaction & { category?: Category }).category?.name ?? '';
      const inc = (t as Transaction & { incomeSource?: IncomeSource }).incomeSource?.name ?? '';
      const label = cat || inc || '-';
      const amountNum = Number(t.amount);

      const y = doc.y;
      if (y > 720) {
        doc.addPage();
      }

      const dateStr = t.date ? new Date(t.date).toISOString().slice(0, 10) : '';
      doc.fontSize(9);
      doc.text(dateStr, 50, doc.y, { continued: true, width: 75 });
      doc.text(t.type, { continued: true, width: 55 });
      doc.text(`${t.currency} ${amountNum.toFixed(2)}`, { continued: true, width: 80 });
      doc.text(label.slice(0, 18), { continued: true, width: 100 });
      doc.text((t.merchant ?? '-').slice(0, 20), { continued: true, width: 110 });
      doc.text((t.notes ?? '').slice(0, 25));
      doc.moveDown(0.3);
    }

    doc.moveDown();
    doc.fontSize(12).fillColor('#000');
    doc.text(`Total Income: ${currency} ${totalIncome.toFixed(2)}`);
    doc.text(`Total Expenses: ${currency} ${totalExpenses.toFixed(2)}`);
    doc.text(`Net Savings: ${currency} ${(totalIncome - totalExpenses).toFixed(2)}`);

    doc.end();
  });

  return pdfBuffer;
}
