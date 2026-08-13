import * as bookingsRepo from "@/server/repositories/bookings";
import * as reschedulesRepo from "@/server/repositories/reschedules";
import { UNLIMITED_CREDITS } from "@/features/bookings/service";

/**
 * Members may reschedule free of charge up to this many hours before the
 * original class starts. This is more generous than cancellation policy.
 */
export const FREE_RESCHEDULE_HOURS = 4;

export type RescheduleServiceErrorCode =
  | "NOT_FOUND"
  | "BAD_REQUEST"
  | "CONFLICT"
  | "FORBIDDEN";

export class RescheduleServiceError extends Error {
  constructor(
    public code: RescheduleServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RescheduleServiceError";
  }
}

function hoursUntil(iso: string, now = new Date()): number {
  return (new Date(iso).getTime() - now.getTime()) / 36e5;
}

export type RescheduleServiceContext = {
  db: typeof import("@/db").db;
  user: {
    id: number;
    role: string;
  };
};

export async function checkRescheduleEligibility(
  ctx: RescheduleServiceContext,
  input: { fromBookingId: number; toClassId: number },
) {
  // Get the original booking with its class details
  const originalRow = await bookingsRepo.findBookingWithClass(
    ctx.db,
    input.fromBookingId,
  );

  if (!originalRow) {
    throw new RescheduleServiceError("NOT_FOUND", "Booking not found.");
  }

  const originalBooking = originalRow.booking;
  const originalClass = originalRow.cls;

  // Verify ownership
  if (originalBooking.userId !== ctx.user.id) {
    throw new RescheduleServiceError(
      "FORBIDDEN",
      "You cannot reschedule this booking.",
    );
  }

  // Verify booking is still active
  if (
    originalBooking.status !== "booked" &&
    originalBooking.status !== "waitlisted"
  ) {
    throw new RescheduleServiceError(
      "BAD_REQUEST",
      "This booking is no longer active.",
    );
  }

  // Verify reschedule is allowed (within 4 hours of original class)
  const hoursBeforeOriginal = hoursUntil(originalClass.startsAt);
  if (hoursBeforeOriginal < FREE_RESCHEDULE_HOURS) {
    throw new RescheduleServiceError(
      "BAD_REQUEST",
      `You can only reschedule up to ${FREE_RESCHEDULE_HOURS} hours before the class starts.`,
    );
  }

  // Get target class
  const targetClass = await bookingsRepo.findClassById(
    ctx.db,
    input.toClassId,
  );

  if (!targetClass) {
    throw new RescheduleServiceError("NOT_FOUND", "Target class not found.");
  }

  // Verify target class has the same name
  if (targetClass.name !== originalClass.name) {
    throw new RescheduleServiceError(
      "BAD_REQUEST",
      "You can only reschedule to a class with the same name.",
    );
  }

  // Verify target class is not the same class
  if (targetClass.id === originalClass.id) {
    throw new RescheduleServiceError(
      "BAD_REQUEST",
      "You are already booked for this class.",
    );
  }

  // Verify target class hasn't started
  if (hoursUntil(targetClass.startsAt) <= 0) {
    throw new RescheduleServiceError(
      "BAD_REQUEST",
      "This class has already started.",
    );
  }

  // Verify target class is not cancelled
  if (targetClass.cancelled) {
    throw new RescheduleServiceError(
      "BAD_REQUEST",
      "This class has been cancelled.",
    );
  }

  // Check if user already has an active booking for this class
  const existingBooking = await bookingsRepo.findActiveBookingForUserAndClass(
    ctx.db,
    targetClass.id,
    ctx.user.id,
  );

  if (existingBooking) {
    throw new RescheduleServiceError(
      "CONFLICT",
      "You already have an active booking for this class.",
    );
  }

  // Check if target class is full (personal + corporate confirmed bookings
  // share the same physical capacity)
  const bookedCount = await bookingsRepo.countCombinedBookedForClass(
    ctx.db,
    targetClass.id,
  );
  const targetIsFull = bookedCount >= targetClass.capacity;

  // Get the membership to check for unlimited credits
  const membership = originalBooking.membershipId
    ? await bookingsRepo.findMembershipById(
        ctx.db,
        originalBooking.membershipId,
      )
    : null;

  return { originalBooking, originalClass, targetClass, targetIsFull, membership };
}

export async function rescheduleBooking(
  ctx: RescheduleServiceContext,
  input: { fromBookingId: number; toClassId: number },
) {
  const { originalBooking, originalClass, targetClass, targetIsFull, membership } =
    await checkRescheduleEligibility(ctx, input);

  const newStatus = targetIsFull ? "waitlisted" : "booked";

  // If the original booking already paid (status "booked"), that credit
  // follows it to the new booking regardless of target capacity — no new
  // charge. If the original was waitlisted (never charged), a charge is only
  // due now if the reschedule lands on a confirmed ("booked") spot.
  const originalWasPaid = originalBooking.status === "booked";
  const mustChargeNow = !originalWasPaid && newStatus === "booked";

  let creditsUsed = originalBooking.creditsUsed;

  if (mustChargeNow) {
    if (!membership) {
      throw new RescheduleServiceError(
        "FORBIDDEN",
        "An active membership is required to book classes.",
      );
    }

    const unlimited = membership.creditsRemaining >= UNLIMITED_CREDITS;
    if (!unlimited && membership.creditsRemaining < targetClass.creditCost) {
      throw new RescheduleServiceError(
        "FORBIDDEN",
        "Not enough class credits remaining.",
      );
    }

    creditsUsed = targetClass.creditCost;

    if (!unlimited) {
      await bookingsRepo.updateMembershipCredits(
        ctx.db,
        membership.id,
        membership.creditsRemaining - targetClass.creditCost,
      );
    }
  }

  // Create the new booking
  const newBooking = await bookingsRepo.createBooking(ctx.db, {
    classId: targetClass.id,
    userId: ctx.user.id,
    membershipId: originalBooking.membershipId,
    status: newStatus,
    creditsUsed,
  });

  // Cancel the original booking
  await bookingsRepo.updateBooking(ctx.db, originalBooking.id, {
    status: "cancelled",
    cancelledAt: new Date().toISOString(),
  });

  // Record the reschedule
  await reschedulesRepo.createReschedule(ctx.db, {
    userId: ctx.user.id,
    fromBookingId: originalBooking.id,
    toBookingId: newBooking.id,
    fromClassId: originalClass.id,
    toClassId: targetClass.id,
  });

  return {
    ok: true,
    newBooking,
    newStatus,
  };
}
