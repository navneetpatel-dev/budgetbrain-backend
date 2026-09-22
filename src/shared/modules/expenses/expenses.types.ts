import { z } from 'zod';
import { transactionSchema, updateTransactionSchema, listTransactionsSchema, searchQuerySchema } from './expenses.validator';

export type CreateTransactionInput = z.infer<typeof transactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type ListTransactionsInput = z.infer<typeof listTransactionsSchema>;
export type SearchQueryInput = z.infer<typeof searchQuerySchema>;
