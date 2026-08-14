import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, staffProcedure, adminProcedure } from "../trpc";
import { cancelClass, ClassServiceError } from "@/features/classes/service";
import * as classesRepo from "@/server/repositories/classes";
import * as bookingsRepo from "@/server/repositories/bookings";

export const classesRouter = router({
  list: publicProcedure
    .input(
      z
        .object({
          from: z.string().optional(),
          to: z.string().optional(),
          includeCancelled: z.boolean().default(false),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const rows = await classesRepo.listClasses(ctx.db, {
        from: input.from,
        to: input.to,
        includeCancelled: input.includeCancelled,
      });

      return rows.map((r) => ({
        ...r,
        spotsLeft: Math.max(0, r.capacity - Number(r.booked)),
        full: Number(r.booked) >= r.capacity,
      }));
    }),

  byId: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const cls = await bookingsRepo.findClassById(ctx.db, input.id);

      if (!cls) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Class not found." });
      }

      const roster = await classesRepo.findClassRoster(ctx.db, cls.id);

      return { ...cls, roster };
    }),

  create: staffProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        trainerId: z.number().optional(),
        room: z.string().min(1),
        capacity: z.number().int().positive(),
        startsAt: z.string(),
        durationMin: z.number().int().positive().default(60),
        creditCost: z.number().int().min(0).default(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return classesRepo.createClass(ctx.db, {
        ...input,
        description: input.description ?? null,
        trainerId: input.trainerId ?? null,
      });
    }),

  update: staffProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        room: z.string().min(1).optional(),
        capacity: z.number().int().positive().optional(),
        startsAt: z.string().optional(),
        trainerId: z.number().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input;
      const updated = await classesRepo.updateClass(ctx.db, id, patch);

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Class not found." });
      }
      return updated;
    }),

  cancel: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await cancelClass({ db: ctx.db }, { classId: input.id });
      } catch (error) {
        if (error instanceof ClassServiceError) {
          throw new TRPCError({ code: error.code, message: error.message });
        }
        throw error;
      }
    }),
});
