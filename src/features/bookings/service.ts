import * as bookingsRepo from "@/server/repositories/bookings";

export const FREE_CANCELLATION_HOURS = 12;
export const UNLIMITED_CREDITS = 999;

export type BookingServiceErrorCode =
  | "NOT_FOUND"
  | "BAD_REQUEST"
  | "CONFLICT"
  | "FORBIDDEN";

export class BookingServiceError extends Error {
  constructor(
    public code: BookingServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BookingServiceError";
  }
}

function hoursUntil(iso: string, now = new Date()): number {
  return (new Date(iso).getTime() - now.getTime()) / 36e5;
}

export type BookingServiceContext = {
  db: typeof import("@/db").db;
  user: {
    id: number;
    role: string;
  };
};

export async function bookBooking(
  ctx: BookingServiceContext,
  input: { classId: number },
) {
  const cls = await bookingsRepo.findClassById(ctx.db, input.classId);

  if (!cls) {
    throw new BookingServiceError("NOT_FOUND", "Class not found.");
  }
  if (cls.cancelled) {
    throw new BookingServiceError(
      "BAD_REQUEST",
      "This class has been cancelled.",
    );
  }
  if (hoursUntil(cls.startsAt) <= 0) {
    throw new BookingServiceError(
      "BAD_REQUEST",
      "This class has already started.",
    );
  }

  const existing = await bookingsRepo.findActiveBookingForUserAndClass(
    ctx.db,
    cls.id,
    ctx.user.id,
  );

  if (existing) {
    throw new BookingServiceError(
      "CONFLICT",
      "You are already on the list for this class.",
    );
  }

  const membership = await bookingsRepo.findActiveMembershipForUser(
    ctx.db,
    ctx.user.id,
  );
  if (!membership) {
    throw new BookingServiceError(
      "FORBIDDEN",
      "An active membership is required to book classes.",
    );
  }

  const unlimited = membership.creditsRemaining >= UNLIMITED_CREDITS;
  if (!unlimited && membership.creditsRemaining < cls.creditCost) {
    throw new BookingServiceError(
      "FORBIDDEN",
      "Not enough class credits remaining.",
    );
  }

  const bookedCount = await bookingsRepo.countCombinedBookedForClass(
    ctx.db,
    cls.id,
  );
  const isFull = bookedCount >= cls.capacity;

  const created = await bookingsRepo.createBooking(ctx.db, {
    classId: cls.id,
    userId: ctx.user.id,
    membershipId: membership.id,
    status: isFull ? "waitlisted" : "booked",
    creditsUsed: isFull ? 0 : cls.creditCost,
  });

  if (!isFull && !unlimited) {
    await bookingsRepo.updateMembershipCredits(
      ctx.db,
      membership.id,
      membership.creditsRemaining - cls.creditCost,
    );
  }

  return created;
}

export async function cancelBooking(
  ctx: BookingServiceContext,
  input: { bookingId: number },
) {
  const row = await bookingsRepo.findBookingWithClass(ctx.db, input.bookingId);

  if (!row) {
    throw new BookingServiceError("NOT_FOUND", "Booking not found.");
  }

  const isOwner = row.booking.userId === ctx.user.id;
  const isStaff = ctx.user.role === "admin" || ctx.user.role === "trainer";
  if (!isOwner && !isStaff) {
    throw new BookingServiceError(
      "FORBIDDEN",
      "You cannot cancel this booking.",
    );
  }

  if (row.booking.status !== "booked" && row.booking.status !== "waitlisted") {
    throw new BookingServiceError(
      "BAD_REQUEST",
      "This booking is no longer active.",
    );
  }

  const refundable =
    hoursUntil(row.cls.startsAt) >= FREE_CANCELLATION_HOURS &&
    row.booking.creditsUsed > 0;

  await bookingsRepo.updateBooking(ctx.db, row.booking.id, {
    status: "cancelled",
    cancelledAt: new Date().toISOString(),
  });

  if (refundable && row.booking.membershipId) {
    const ms = await bookingsRepo.findMembershipById(
      ctx.db,
      row.booking.membershipId,
    );

    if (ms && ms.creditsRemaining < UNLIMITED_CREDITS) {
      await bookingsRepo.updateMembershipCredits(
        ctx.db,
        ms.id,
        ms.creditsRemaining + row.booking.creditsUsed,
      );
    }
  }

  if (row.booking.status === "booked") {
    const combinedBooked = await bookingsRepo.countCombinedBookedForClass(
      ctx.db,
      row.cls.id,
    );
    const seatAvailable = combinedBooked < row.cls.capacity;

    const next = seatAvailable
      ? await bookingsRepo.findNextWaitlistedBooking(ctx.db, row.cls.id)
      : null;

    if (next) {
      // A rescheduled booking can already carry a paid-for creditsUsed while
      // waitlisted (the credit followed it from its original booking) — in
      // that case promotion must not charge it again.
      const alreadyPaid = next.creditsUsed > 0;

      await bookingsRepo.updateBooking(ctx.db, next.id, {
        status: "booked",
        creditsUsed: alreadyPaid ? next.creditsUsed : row.cls.creditCost,
      });

      if (!alreadyPaid && next.membershipId) {
        const ms = await bookingsRepo.findMembershipById(
          ctx.db,
          next.membershipId,
        );

        if (ms && ms.creditsRemaining < UNLIMITED_CREDITS) {
          await bookingsRepo.updateMembershipCredits(
            ctx.db,
            ms.id,
            Math.max(0, ms.creditsRemaining - row.cls.creditCost),
          );
        }
      }
    }
  }

  return { ok: true, refunded: refundable };
}

export async function markAttendedBooking(
  ctx: BookingServiceContext,
  input: { bookingId: number; source: "front_desk" | "kiosk" | "app" },
) {
  const booking = await bookingsRepo.findBookingById(ctx.db, input.bookingId);

  if (!booking) {
    throw new BookingServiceError("NOT_FOUND", "Booking not found.");
  }
  if (booking.status !== "booked") {
    throw new BookingServiceError(
      "BAD_REQUEST",
      "Only confirmed bookings can be checked in.",
    );
  }

  await bookingsRepo.updateBooking(ctx.db, booking.id, { status: "attended" });

  await bookingsRepo.createCheckin(ctx.db, {
    userId: booking.userId,
    bookingId: booking.id,
    source: input.source,
  });

  return { ok: true };
}
