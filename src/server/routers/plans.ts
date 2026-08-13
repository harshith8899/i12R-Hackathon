import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { membershipPlans } from "@/db/schema";
import { subscribeToPlan, PlanServiceError } from "@/features/plans/service";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../trpc";

export const plansRouter = router({
  list: publicProcedure
    .input(z.object({ includeInactive: z.boolean().default(false) }).default({}))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.select().from(membershipPlans);
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
      return ctx.db
        .insert(membershipPlans)
        .values({ ...input, description: input.description ?? null })
        .returning()
        .get();
    }),

  setActive: adminProcedure
    .input(z.object({ id: z.number(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db
        .update(membershipPlans)
        .set({ active: input.active })
        .where(eq(membershipPlans.id, input.id))
        .returning()
        .get();
    }),
});
