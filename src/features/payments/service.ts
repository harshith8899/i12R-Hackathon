import * as paymentsRepo from "@/server/repositories/payments";
import * as plansRepo from "@/server/repositories/plans";

export type PaymentServiceErrorCode = "NOT_FOUND" | "BAD_REQUEST";

export class PaymentServiceError extends Error {
  constructor(
    public code: PaymentServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PaymentServiceError";
  }
}

export type PaymentServiceContext = {
  db: typeof import("@/db").db;
};

export async function refundPayment(
  ctx: PaymentServiceContext,
  input: { paymentId: number },
) {
  const row = await paymentsRepo.findPaymentById(ctx.db, input.paymentId);

  if (!row) {
    throw new PaymentServiceError("NOT_FOUND", "Payment not found.");
  }
  if (row.status !== "paid") {
    throw new PaymentServiceError(
      "BAD_REQUEST",
      "Only paid payments can be refunded.",
    );
  }

  const updated = await paymentsRepo.markPaymentRefunded(
    ctx.db,
    input.paymentId,
  );

  if (row.membershipId) {
    await plansRepo.cancelMembership(ctx.db, row.membershipId);
  }

  return updated;
}
