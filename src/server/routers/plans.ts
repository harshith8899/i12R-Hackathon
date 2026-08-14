import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { subscribeToPlan, PlanServiceError } from "@/features/plans/service";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../trpc";
import * as plansRepo from "@/server/repositories/plans";

export const plansRouter = router({
  list: publicProcedure
    .input(z.object({ includeInactive: z.boolean().default(false) }).default({}))
    .query(async ({ ctx, input }) => {
      const rows = await plansRepo.listPlans(ctx.db);
      return input.includeInactive ? rows : rows.filter((p) => p.active);
    }),

  subscribe: protectedProcedure
    .input(
      z.object({
        planId: z.number(),
        method: z.enum(["card", "cash", "upi", "transfer"]).default("card"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await subscribeToPlan(
          {
            db: ctx.db,
            user: ctx.user,
          },
          {
            planId: input.planId,
            method: input.method,
          },
        );
      } catch (error) {
        if (error instanceof PlanServiceError) {
          throw new TRPCError({
            code: error.code,
            message: error.message,
          });
        }
        throw error;
      }
    }),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        priceCents: z.number().int().nonnegative(),
        durationDays: z.number().int().positive(),
        classCredits: z.number().int().nonnegative().default(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return plansRepo.createPlan(ctx.db, {
        ...input,
        description: input.description ?? null,
      });
    }),

  setActive: adminProcedure
    .input(z.object({ id: z.number(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return plansRepo.setPlanActive(ctx.db, input.id, input.active);
    }),
});
