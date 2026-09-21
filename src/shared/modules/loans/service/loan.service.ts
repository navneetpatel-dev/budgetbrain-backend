import { Loan, LoanPayment, User, sequelize } from '@database/models';
import { AppError } from '@shared/errors';
import { createNotification } from '@shared/modules/notifications/service/notification.service';
import { writeAuditLog, AuditAction, AuditResource } from '@shared/audit';
import { paginatedResult, resolvePagination } from '@shared/pagination';
import type { PaginationInput } from '@shared/types';
import type { CreateLoanInput, UpdateLoanInput } from '../types';

export async function createLoan(userId: string, data: CreateLoanInput) {
  const user = await User.findByPk(userId);
  const loan = await Loan.create({
    userId,
    name: data.name,
    type: data.type as Loan['type'],
    principal: data.principal,
    interestRate: data.interestRate ?? null,
    emiAmount: data.emiAmount ?? null,
    remainingBalance: data.principal,
    currency: data.currency ?? user?.currency ?? 'INR',
    startDate: new Date(data.startDate),
    dueDayOfMonth: data.dueDayOfMonth ?? null,
    notes: data.notes ?? null,
  });

  await writeAuditLog({
    action: AuditAction.LOAN_CREATE,
    resource: AuditResource.LOAN,
    resourceId: loan.id,
    actorUserId: userId,
    afterState: { name: loan.name, principal: loan.principal, type: loan.type },
  });

  return loan;
}

export async function getLoan(userId: string, id: string) {
  const loan = await Loan.findOne({ where: { id, userId }, include: [{ model: LoanPayment, as: 'payments' }] });
  if (!loan) throw new AppError(404, 'Loan not found');
  return loan;
}

export async function listLoans(userId: string, filters: PaginationInput = {}) {
  const { page, limit, offset } = resolvePagination(filters.page, filters.limit);
  const { rows, count } = await Loan.findAndCountAll({
    where: { userId },
    order: [['closed', 'ASC'], ['createdAt', 'DESC']],
    limit,
    offset,
  });
  return paginatedResult('loans', rows, count, page, limit);
}

export async function updateLoan(userId: string, id: string, data: UpdateLoanInput) {
  const loan = await Loan.findOne({ where: { id, userId } });
  if (!loan) throw new AppError(404, 'Loan not found');

  const beforeState = {
    name: loan.name,
    interestRate: loan.interestRate,
    emiAmount: loan.emiAmount,
    closed: loan.closed,
  };

  await loan.update({
    ...(data.name !== undefined && { name: data.name }),
    ...(data.interestRate !== undefined && { interestRate: data.interestRate }),
    ...(data.emiAmount !== undefined && { emiAmount: data.emiAmount }),
    ...(data.dueDayOfMonth !== undefined && { dueDayOfMonth: data.dueDayOfMonth }),
    ...(data.notes !== undefined && { notes: data.notes }),
    ...(data.closed !== undefined && { closed: data.closed }),
  });

  await writeAuditLog({
    action: AuditAction.LOAN_UPDATE,
    resource: AuditResource.LOAN,
    resourceId: id,
    actorUserId: userId,
    beforeState,
    afterState: {
      name: loan.name,
      interestRate: loan.interestRate,
      emiAmount: loan.emiAmount,
      closed: loan.closed,
    },
  });

  return loan;
}

export async function deleteLoan(userId: string, id: string) {
  await sequelize.transaction(async (t) => {
    const loan = await Loan.findOne({
      where: { id, userId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!loan) throw new AppError(404, 'Loan not found');

    await LoanPayment.destroy({ where: { loanId: loan.id }, transaction: t });
    await loan.destroy({ transaction: t });

    await writeAuditLog({
      action: AuditAction.LOAN_DELETE,
      resource: AuditResource.LOAN,
      resourceId: id,
      actorUserId: userId,
      beforeState: { name: loan.name, principal: loan.principal },
      severity: 'warning',
      transaction: t,
    });
  });
}

export async function payLoan(userId: string, loanId: string, amount: number, notes?: string) {
  const { payment, loan, justClosed } = await sequelize.transaction(async (t) => {
    const loan = await Loan.findOne({
      where: { id: loanId, userId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!loan) throw new AppError(404, 'Loan not found');
    if (loan.closed) throw new AppError(409, 'Loan is already paid off');

    const remainingBalance = Number(loan.remainingBalance);
    const appliedAmount = Math.min(amount, remainingBalance);

    const payment = await LoanPayment.create(
      { loanId: loan.id, userId, amount: appliedAmount, notes: notes ?? null, paidAt: new Date() },
      { transaction: t }
    );

    const newBalance = Math.max(0, remainingBalance - appliedAmount);
    const justClosed = newBalance <= 0 && !loan.closed;

    await loan.update({ remainingBalance: newBalance, closed: newBalance <= 0 }, { transaction: t });

    await writeAuditLog({
      action: AuditAction.LOAN_PAY,
      resource: AuditResource.LOAN,
      resourceId: loanId,
      actorUserId: userId,
      afterState: { amount: appliedAmount, remainingBalance: newBalance, closed: justClosed },
      transaction: t,
    });

    return { payment, loan, justClosed };
  });

  if (justClosed) {
    await createNotification(
      userId,
      'general',
      'Loan paid off!',
      `You've fully paid off "${loan.name}".`,
      { loanId: loan.id }
    );
  }

  return { payment, loan };
}
