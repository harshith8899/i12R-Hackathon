import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { refundPayment, PaymentServiceError } from "@/features/payments/service";
import { router, protectedProcedure, adminProcedure } from "../trpc";
import * as paymentsRepo from "@/server/repositories/payments";

export const paymentsRouter = router({
  mine: protectedProcedure.query(async ({ ctx }) => {
    return paymentsRepo.findPaymentsForUser(ctx.db, ctx.user.id);
  }),

  all: adminProcedure
    .input(z.object({ limit: z.number().default(100) }).default({}))
    .query(async ({ ctx, input }) => {
      return paymentsRepo.findAllPayments(ctx.db, input.limit);
    }),

  markPaid: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const row = await paymentsRepo.findPaymentById(ctx.db, input.id);

      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found." });
      }
      if (row.status === "refunded") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Refunded payments cannot be marked paid.",
        });
      }

      return paymentsRepo.markPaymentPaid(ctx.db, input.id);
    }),

  refund: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await refundPayment({ db: ctx.db }, { paymentId: input.id });
      } catch (error) {
        if (error instanceof PaymentServiceError) {
          throw new TRPCError({ code: error.code, message: error.message });
        }
        throw error;
      }
    }),
});
