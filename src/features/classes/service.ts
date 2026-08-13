import * as classesRepo from "@/server/repositories/classes";
import * as bookingsRepo from "@/server/repositories/bookings";
import * as corporateBookingsRepo from "@/server/repositories/corporate-bookings";
import { UNLIMITED_CREDITS } from "@/features/bookings/service";

export type ClassServiceErrorCode = "NOT_FOUND";

export class ClassServiceError extends Error {
  constructor(
    public code: ClassServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ClassServiceError";
  }
}

export type ClassServiceContext = {
  db: typeof import("@/db").db;
};

/**
 * Studio-initiated cancellation: unlike member-initiated cancellation, refunds
 * are unconditional (no FREE_CANCELLATION_HOURS / CORPORATE_FREE_CANCELLATION_HOURS
 * window) since the member/company isn't the one cancelling.
 */
export async function cancelClass(
  ctx: ClassServiceContext,
  input: { classId: number },
) {
  return ctx.db.transaction(async (tx) => {
    const cls = await classesRepo.cancelClass(tx, input.classId);
    if (!cls) {
      throw new ClassServiceError("NOT_FOUND", "Class not found.");
    }

    const personalBookings = await bookingsRepo.findActiveBookingsForClass(
      tx,
      input.classId,
    );
    for (const booking of personalBookings) {
      await bookingsRepo.updateBooking(tx, booking.id, {
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
      });

      if (booking.creditsUsed > 0 && booking.membershipId) {
        const ms = await bookingsRepo.findMembershipById(
          tx,
          booking.membershipId,
        );
        if (ms && ms.creditsRemaining < UNLIMITED_CREDITS) {
          await bookingsRepo.updateMembershipCredits(
            tx,
            ms.id,
            ms.creditsRemaining + booking.creditsUsed,
          );
        }
      }
    }

    const corporateBookingRows =
      await corporateBookingsRepo.findActiveCorporateBookingsForClass(
        tx,
        input.classId,
      );
    for (const booking of corporateBookingRows) {
      await corporateBookingsRepo.updateCorporateBooking(tx, booking.id, {
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
      });

      if (booking.creditsUsed > 0) {
        const company = await corporateBookingsRepo.findCompanyById(
          tx,
          booking.companyId,
        );
        if (company) {
          await corporateBookingsRepo.updateCompanyCredits(
            tx,
            company.id,
            company.creditPoolBalance + booking.creditsUsed,
          );
        }
      }
    }

    return cls;
  });
}
