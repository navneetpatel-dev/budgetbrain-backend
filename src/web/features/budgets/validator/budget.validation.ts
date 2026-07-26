import { z } from 'zod';
import {
  optionalText,
  requiredText,
  currencyField,
  budgetStartDate,
  optionalBudgetEndDate,
  amountField,
  alertThresholdField,
  uuidField,
  enumField,
  ValidationMessages as M,
} from '../../../../shared/validation';

function shiftYearsIso(iso: string, years: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y + years, m - 1, d)).toISOString().slice(0, 10);
}

export const createBudgetSchema = z
  .object({
    name: requiredText('entityName'),
    type: enumField(['monthly', 'weekly', 'custom'] as const),
    amount: amountField(),
    currency: currencyField(true),
    categoryId: uuidField().optional(),
    startDate: budgetStartDate,
    endDate: optionalBudgetEndDate,
    alertThreshold: alertThresholdField(true),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'custom') {
      if (!data.endDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['endDate'],
          message: M.endDateRequired,
        });
        return;
      }
      if (data.endDate < data.startDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['endDate'],
          message: M.endDateBeforeStart,
        });
      }
      if (data.endDate > shiftYearsIso(data.startDate, 5)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['endDate'],
          message: M.dateTooFarInFuture,
        });
      }
    } else if (data.endDate && data.endDate < data.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: M.endDateBeforeStart,
      });
    }
  });

export const updateBudgetSchema = z.object({
  name: optionalText('entityName'),
  amount: amountField().optional(),
  alertThreshold: alertThresholdField(true),
  endDate: optionalBudgetEndDate,
});
