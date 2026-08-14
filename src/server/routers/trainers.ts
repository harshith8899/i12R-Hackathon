import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { classes, users, trainerAvailability } from "@/db/schema";
import { router, protectedProcedure } from "../trpc";
import * as trainersRepo from "@/server/repositories/trainers";

export const trainersRouter = router({
  upcomingClasses: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "trainer") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only trainers can access this.",
      });
    }

    return trainersRepo.findUpcomingClassesForTrainer(ctx.db, ctx.user.id);
  }),

  availability: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "trainer") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only trainers can access this.",
      });
    }

    return trainersRepo.findAvailabilityForTrainer(ctx.db, ctx.user.id);
  }),

  setAvailability: protectedProcedure
    .input(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        startTime: z.string(),
        endTime: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "trainer") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only trainers can access this.",
        });
      }

      return trainersRepo.upsertAvailability(ctx.db, {
        trainerId: ctx.user.id,
        dayOfWeek: input.dayOfWeek,
        startTime: input.startTime,
        endTime: input.endTime,
      });
    }),

  removeAvailability: protectedProcedure
    .input(z.object({ dayOfWeek: z.number().int().min(0).max(6) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "trainer") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only trainers can access this.",
        });
      }

      return trainersRepo.deleteAvailabilityForDay(
        ctx.db,
        ctx.user.id,
        input.dayOfWeek,
      );
    }),

  checkAvailability: protectedProcedure
    .input(
      z.object({
        trainerId: z.number(),
        startsAt: z.string(),
        durationMin: z.number(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // This can be called by staff or trainers
      if (ctx.user.role !== "trainer" && ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Staff only.",
        });
      }
      const classStart = new Date(input.startsAt);
      const classEnd = new Date(classStart.getTime() + input.durationMin * 60000);

      const dayOfWeek = classStart.getUTCDay();
      const startTimeStr = String(classStart.getUTCHours()).padStart(2, "0") +
        ":" +
        String(classStart.getUTCMinutes()).padStart(2, "0");
      const endTimeStr = String(classEnd.getUTCHours()).padStart(2, "0") +
        ":" +
        String(classEnd.getUTCMinutes()).padStart(2, "0");

      const availability = await ctx.db
        .select()
        .from(trainerAvailability)
        .where(
          and(
            eq(trainerAvailability.trainerId, input.trainerId),
            eq(trainerAvailability.dayOfWeek, dayOfWeek),
          ),
        )
        .get();

      if (!availability) {
        return { available: false, reason: "No availability set for this day" };
      }

      const availStart = availability.startTime;
      const availEnd = availability.endTime;

      const isWithinAvailability =
        startTimeStr >= availStart && endTimeStr <= availEnd;

      if (!isWithinAvailability) {
        return { available: false, reason: "Outside availability hours" };
      }

      const conflictingClasses = await ctx.db
        .select()
        .from(classes)
        .where(
          and(
            eq(classes.trainerId, input.trainerId),
            eq(classes.cancelled, false),
          ),
        );

      for (const cls of conflictingClasses) {
        const existStart = new Date(cls.startsAt);
        const existEnd = new Date(
          existStart.getTime() + cls.durationMin * 60000,
        );

        if (classStart < existEnd && classEnd > existStart) {
          return { available: false, reason: "Trainer already has a class at this time" };
        }
      }

      return { available: true };
    }),
});
