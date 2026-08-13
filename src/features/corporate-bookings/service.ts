import * as bookingsRepo from "@/server/repositories/bookings";
import * as corporateBookingsRepo from "@/server/repositories/corporate-bookings";

/**
 * Corporate members may cancel free of charge up to this many hours before
 * the class starts. Cancelling later still frees the spot but forfeits the credit.
 * Intentionally distinct from personal bookings' FREE_CANCELLATION_HOURS.
 */
export const CORPORATE_FREE_CANCELLATION_HOURS = 24;

export type CorporateBookingServiceErrorCode =
  | "NOT_FOUND"
  | "BAD_REQUEST"
  | "CONFLICT"
  | "FORBIDDEN";

export class CorporateBookingServiceError extends Error {
  constructor(
    public code: CorporateBookingServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CorporateBookingServiceError";
  }
}

function hoursUntil(iso: string, now = new Date()): number {
  return (new Date(iso).getTime() - now.getTime()) / 36e5;
}

export type CorporateBookingServiceContext = {
  db: typeof import("@/db").db;
  user: {
    id: number;
    role: string;
  };
};

export async function bookCorporateBooking(
  ctx: CorporateBookingServiceContext,
  input: { classId: number },
) {
  const cls = await bookingsRepo.findClassById(ctx.db, input.classId);

  if (!cls) {
    throw new CorporateBookingServiceError("NOT_FOUND", "Class not found.");
  }
  if (cls.cancelled) {
    throw new CorporateBookingServiceError(
      "BAD_REQUEST",
      "This class has been cancelled.",
    );
  }
  if (hoursUntil(cls.startsAt) <= 0) {
    throw new CorporateBookingServiceError(
      "BAD_REQUEST",
      "This class has already started.",
    );
  }

  const existing =
    await corporateBookingsRepo.findActiveCorporateBookingForUserAndClass(
      ctx.db,
      cls.id,
      ctx.user.id,
    );

  if (existing) {
    throw new CorporateBookingServiceError(
      "CONFLICT",
      "You are already on the list for this class.",
    );
  }

  const companyRow = await corporateBookingsRepo.findActiveCompanyForMember(
    ctx.db,
    ctx.user.id,
  );
  if (!companyRow) {
    throw new CorporateBookingServiceError(
      "FORBIDDEN",
      "You are not linked to an active company.",
    );
  }

  const company = companyRow.companies;
  if (company.creditPoolBalance < cls.creditCost) {
    throw new CorporateBookingServiceError(
      "FORBIDDEN",
      "Your company does not have enough credits.",
    );
  }

  const bookedCount = await bookingsRepo.countCombinedBookedForClass(
    ctx.db,
    cls.id,
  );
  const isFull = bookedCount >= cls.capacity;

  const created = await corporateBookingsRepo.createCorporateBooking(ctx.db, {
    classId: cls.id,
    userId: ctx.user.id,
    companyId: company.id,
    status: isFull ? "waitlisted" : "booked",
    creditsUsed: isFull ? 0 : cls.creditCost,
  });

  if (!isFull) {
    await corporateBookingsRepo.updateCompanyCredits(
      ctx.db,
      company.id,
      company.creditPoolBalance - cls.creditCost,
    );
  }

  return created;
}

export async function cancelCorporateBooking(
  ctx: CorporateBookingServiceContext,
  input: { bookingId: number },
) {
  const row = await corporateBookingsRepo.findCorporateBookingWithClass(
    ctx.db,
    input.bookingId,
  );

  if (!row) {
    throw new CorporateBookingServiceError("NOT_FOUND", "Booking not found.");
  }

  const isOwner = row.booking.userId === ctx.user.id;
  const isStaff = ctx.user.role === "admin" || ctx.user.role === "trainer";
  if (!isOwner && !isStaff) {
    throw new CorporateBookingServiceError(
      "FORBIDDEN",
      "You cannot cancel this booking.",
    );
  }

  if (row.booking.status !== "booked" && row.booking.status !== "waitlisted") {
    throw new CorporateBookingServiceError(
      "BAD_REQUEST",
      "This booking is no longer active.",
    );
  }

  const refundable =
    hoursUntil(row.cls.startsAt) >= CORPORATE_FREE_CANCELLATION_HOURS &&
    row.booking.creditsUsed > 0;

  await corporateBookingsRepo.updateCorporateBooking(ctx.db, row.booking.id, {
    status: "cancelled",
    cancelledAt: new Date().toISOString(),
  });

  if (refundable) {
    const company = await corporateBookingsRepo.findCompanyById(
      ctx.db,
      row.booking.companyId,
    );

    if (company) {
      await corporateBookingsRepo.updateCompanyCredits(
        ctx.db,
        company.id,
        company.creditPoolBalance + row.booking.creditsUsed,
      );
    }
  }

  // Freeing a confirmed spot promotes the member who has waited longest —
  // only if the shared physical capacity actually has room (personal
  // bookings can occupy the seat this corporate cancellation just freed).
  if (row.booking.status === "booked") {
    const combinedBooked = await bookingsRepo.countCombinedBookedForClass(
      ctx.db,
      row.cls.id,
    );
    const seatAvailable = combinedBooked < row.cls.capacity;

    const next = seatAvailable
      ? await corporateBookingsRepo.findNextWaitlistedCorporateBooking(
          ctx.db,
          row.cls.id,
        )
      : null;

    if (next) {
      await corporateBookingsRepo.updateCorporateBooking(ctx.db, next.id, {
        status: "booked",
        creditsUsed: row.cls.creditCost,
      });

      const company = await corporateBookingsRepo.findCompanyById(
        ctx.db,
        next.companyId,
      );

      if (company && company.creditPoolBalance >= row.cls.creditCost) {
        await corporateBookingsRepo.updateCompanyCredits(
          ctx.db,
          company.id,
          Math.max(0, company.creditPoolBalance - row.cls.creditCost),
        );
      }
    }
  }

  return { ok: true, refunded: refundable };
}

export async function markAttendedCorporateBooking(
  ctx: CorporateBookingServiceContext,
  input: { bookingId: number; source: "front_desk" | "kiosk" | "app" },
) {
  const booking = await corporateBookingsRepo.findCorporateBookingById(
    ctx.db,
    input.bookingId,
  );

  if (!booking) {
    throw new CorporateBookingServiceError("NOT_FOUND", "Booking not found.");
  }
  if (booking.status !== "booked") {
    throw new CorporateBookingServiceError(
      "BAD_REQUEST",
      "Only confirmed bookings can be checked in.",
    );
  }

  await corporateBookingsRepo.updateCorporateBooking(ctx.db, booking.id, {
    status: "attended",
  });

  // Known issue: checkins.bookingId can't reference a corporate booking, and
  // input.source is accepted but not persisted here — preserved as-is.
  await corporateBookingsRepo.createCorporateCheckin(ctx.db, {
    userId: booking.userId,
  });

  return { ok: true };
}
