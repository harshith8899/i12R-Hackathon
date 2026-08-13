import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as corporateBookingsRepo from "@/server/repositories/corporate-bookings";
import {
  bookCorporateBooking,
  cancelCorporateBooking,
  markAttendedCorporateBooking,
  CorporateBookingServiceError,
} from "@/features/corporate-bookings/service";
import { router, protectedProcedure, staffProcedure } from "../trpc";

export const corporateBookingsRouter = router({
  mine: protectedProcedure
    .input(z.object({ includePast: z.boolean().default(false) }).default({}))
    .query(async ({ ctx, input }) => {
      const rows = await corporateBookingsRepo.findUserCorporateBookingsWithClass(
        ctx.db,
        ctx.user.id,
      );

      const now = new Date();
      return rows.filter((r) =>
        input.includePast ? true : new Date(r.startsAt) >= now,
      );
    }),

  book: protectedProcedure
    .input(z.object({ classId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await bookCorporateBooking(
          {
            db: ctx.db,
            user: ctx.user,
          },
          { classId: input.classId },
        );
      } catch (error) {
        if (error instanceof CorporateBookingServiceError) {
          throw new TRPCError({
            code: error.code,
            message: error.message,
          });
        }
        throw error;
      }
    }),

  cancel: protectedProcedure
    .input(z.object({ bookingId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await cancelCorporateBooking(
          {
            db: ctx.db,
            user: ctx.user,
          },
          { bookingId: input.bookingId },
        );
      } catch (error) {
        if (error instanceof CorporateBookingServiceError) {
          throw new TRPCError({
            code: error.code,
            message: error.message,
          });
        }
        throw error;
      }
    }),

  markAttended: staffProcedure
    .input(
      z.object({
        bookingId: z.number(),
        source: z.enum(["front_desk", "kiosk", "app"]).default("front_desk"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await markAttendedCorporateBooking(
          {
            db: ctx.db,
            user: ctx.user,
          },
          {
            bookingId: input.bookingId,
            source: input.source,
          },
        );
      } catch (error) {
        if (error instanceof CorporateBookingServiceError) {
          throw new TRPCError({
            code: error.code,
            message: error.message,
          });
        }
        throw error;
      }
    }),

  rosterFor: staffProcedure
    .input(z.object({ classId: z.number() }))
    .query(async ({ ctx, input }) => {
      return corporateBookingsRepo.findRosterForClass(ctx.db, input.classId);
    }),
});
