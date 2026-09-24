export type { DateRangeInput } from '@shared/types';

export interface ReportFilters {
  startDate?: string;
  endDate?: string;
  categoryId?: string;
  budgetId?: string;
  incomeSourceId?: string;
  type?: 'expense' | 'income' | 'refund' | 'transfer';
}
