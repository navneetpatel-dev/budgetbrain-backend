import PDFDocument from 'pdfkit';
import { Transaction, Category } from '../../models';
import { Op } from 'sequelize';

export async function generatePdfReport(
  userId: string,
  startDate?: string,
  endDate?: string
): Promise<Buffer> {
  const where: Record<string, unknown> = { userId };
  if (startDate || endDate) {
    where.date = {};
    if (startDate) (where.date as Record<string, unknown>)[Op.gte as unknown as string] = startDate;
    if (endDate) (where.date as Record<string, unknown>)[Op.lte as unknown as string] = endDate;
  }

  const transactions = await Transaction.findAll({
    where,
    include: [{ model: Category, as: 'category', attributes: ['name'] }],
    order: [['date', 'ASC']],
  });

  let totalExpenses = 0;
  let totalIncome = 0;

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).text('ExpenseFlow Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).fillColor('#666').text(`Generated: ${new Date().toISOString()}`, { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(11).fillColor('#000');
    doc.text('Date', 50, doc.y, { continued: true, width: 80 });
    doc.text('Type', { continued: true, width: 60 });
    doc.text('Amount', { continued: true, width: 80 });
    doc.text('Category', { continued: true, width: 100 });
    doc.text('Merchant');
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke('#ccc');
    doc.moveDown(0.5);

    for (const t of transactions) {
      const cat = (t as Transaction & { category?: Category }).category?.name ?? '';
      if (t.type === 'expense') totalExpenses += Number(t.amount);
      else totalIncome += Number(t.amount);

      const y = doc.y;
      if (y > 720) {
        doc.addPage();
      }

      doc.fontSize(9);
      doc.text(String(t.date), 50, doc.y, { continued: true, width: 80 });
      doc.text(t.type, { continued: true, width: 60 });
      doc.text(`${t.currency} ${t.amount}`, { continued: true, width: 80 });
      doc.text(cat.slice(0, 18), { continued: true, width: 100 });
      doc.text((t.merchant ?? '').slice(0, 30));
      doc.moveDown(0.3);
    }

    doc.moveDown();
    doc.fontSize(12).fillColor('#000');
    doc.text(`Total Income: ${totalIncome.toFixed(2)}`);
    doc.text(`Total Expenses: ${totalExpenses.toFixed(2)}`);
    doc.text(`Net Savings: ${(totalIncome - totalExpenses).toFixed(2)}`);

    doc.end();
  });

  return pdfBuffer;
}
