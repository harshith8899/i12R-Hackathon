import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { desc, eq, sql } from "drizzle-orm";
import { reschedules, classes } from "@/db/schema";
import {
  checkRescheduleEligibility,
  rescheduleBooking,
  RescheduleServiceError,
} from "@/features/reschedules/service";
import { router, protectedProcedure } from "../trpc";

export const reschedulesRouter = router({
  reschedule: protectedProcedure
    .input(
      z.object({
        fromBookingId: z.number(),
        toClassId: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await rescheduleBooking(
          {
            db: ctx.db,
            user: ctx.user,
          },
          input,
        );
      } catch (error) {
        if (error instanceof RescheduleServiceError) {
          throw new TRPCError({
            code: error.code,
            message: error.message,
          });
        }
        throw error;
      }
    }),

  history: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: reschedules.id,
        rescheduledAt: reschedules.rescheduledAt,
        fromClassName: classes.name,
        fromClassTime: sql<string>`(
          SELECT ${classes.startsAt} FROM ${classes}
          WHERE ${classes.id} = ${reschedules.fromClassId}
        )`,
        fromClassRoom: sql<string>`(
          SELECT ${classes.room} FROM ${classes}
          WHERE ${classes.id} = ${reschedules.fromClassId}
        )`,
        toClassName: sql<string>`(
          SELECT ${classes.name} FROM ${classes}
          WHERE ${classes.id} = ${reschedules.toClassId}
        )`,
        toClassTime: sql<string>`(
          SELECT ${classes.startsAt} FROM ${classes}
          WHERE ${classes.id} = ${reschedules.toClassId}
        )`,
        toClassRoom: sql<string>`(
          SELECT ${classes.room} FROM ${classes}
          WHERE ${classes.id} = ${reschedules.toClassId}
        )`,
      })
      .from(reschedules)
      .innerJoin(classes, eq(reschedules.fromClassId, classes.id))
      .where(eq(reschedules.userId, ctx.user.id))
      .orderBy(desc(reschedules.rescheduledAt));
  }),

  validateReschedule: protectedProcedure
    .input(
      z.object({
        fromBookingId: z.number(),
        toClassId: z.number(),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const { targetIsFull } = await checkRescheduleEligibility(
          {
            db: ctx.db,
            user: ctx.user,
          },
          input,
        );

        return {
          valid: true,
          targetIsFull,
        };
      } catch (error) {
        if (error instanceof RescheduleServiceError) {
          return { valid: false, reason: error.message };
        }
        throw error;
      }
    }),
});
