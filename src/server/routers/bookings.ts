import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  bookBooking,
  cancelBooking,
  markAttendedBooking,
  BookingServiceError,
} from "@/features/bookings/service";
import * as bookingsRepo from "@/server/repositories/bookings";
import { router, protectedProcedure, staffProcedure } from "../trpc";

export const bookingsRouter = router({
  mine: protectedProcedure
    .input(z.object({ includePast: z.boolean().default(false) }).default({}))
    .query(async ({ ctx, input }) => {
      const rows = await bookingsRepo.findUserBookingsWithClass(
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
        return await bookBooking(
          {
            db: ctx.db,
            user: ctx.user,
          },
          { classId: input.classId },
        );
      } catch (error) {
        if (error instanceof BookingServiceError) {
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
        return await cancelBooking(
          {
            db: ctx.db,
            user: ctx.user,
          },
          { bookingId: input.bookingId },
        );
      } catch (error) {
        if (error instanceof BookingServiceError) {
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
        return await markAttendedBooking(
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
        if (error instanceof BookingServiceError) {
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
      return bookingsRepo.findRosterForClass(ctx.db, input.classId);
    }),

  upcomingForMember: staffProcedure
    .input(z.object({ userId: z.number(), hoursAhead: z.number().default(2) }))
    .query(async ({ ctx, input }) => {
      const now = new Date().toISOString();
      const futureTime = new Date(Date.now() + input.hoursAhead * 60 * 60 * 1000).toISOString();

      return bookingsRepo.findUpcomingBookingsForMember(
        ctx.db,
        input.userId,
        now,
        futureTime,
      );
    }),

  checkinCountFor: staffProcedure
    .input(z.object({ classId: z.number() }))
    .query(async ({ ctx, input }) => {
      const count = await bookingsRepo.countCheckinsForClass(
        ctx.db,
        input.classId,
      );

      return { count };
    }),

  waitlisted: protectedProcedure.query(async ({ ctx }) => {
    const waitlistedBookings = await bookingsRepo.findWaitlistedBookingsForUser(
      ctx.db,
      ctx.user.id,
    );

    // For each waitlisted booking, calculate position in queue
    const result = await Promise.all(
      waitlistedBookings.map(async (wb) => {
        const position = await bookingsRepo.countWaitlistedAhead(
          ctx.db,
          wb.classId,
          wb.bookedAt,
        );

        return {
          ...wb,
          position: position + 1, // +1 because we're counting those before us
        };
      }),
    );

    return result;
  }),
});

