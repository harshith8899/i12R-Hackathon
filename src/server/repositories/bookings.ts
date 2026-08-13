import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  bookings,
  classes,
  memberships,
  checkins,
  users,
  corporateBookings,
} from "@/db/schema";
import type { Booking } from "@/db/schema";

type Db = typeof import("@/db").db;
type Tx = Parameters<Db["transaction"]>[0] extends (tx: infer T) => unknown
  ? T
  : never;
type Database = Db | Tx;

export async function findClassById(db: Database, classId: number) {
  return db.select().from(classes).where(eq(classes.id, classId)).get();
}

export async function findActiveBookingsForClass(db: Database, classId: number) {
  return db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.classId, classId),
        inArray(bookings.status, ["booked", "waitlisted"]),
      ),
    );
}

export async function findActiveBookingForUserAndClass(
  db: Database,
  classId: number,
  userId: number,
) {
  return db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.classId, classId),
        eq(bookings.userId, userId),
        inArray(bookings.status, ["booked", "waitlisted"]),
      ),
    )
    .get();
}

export async function findActiveMembershipForUser(db: Database, userId: number) {
  const today = new Date().toISOString().slice(0, 10);
  return db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.status, "active"),
        sql`${memberships.endDate} >= ${today}`,
      ),
    )
    .orderBy(desc(memberships.endDate))
    .get();
}

export async function countBookedForClass(db: Database, classId: number) {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(bookings)
    .where(and(eq(bookings.classId, classId), eq(bookings.status, "booked")));
  return Number(count);
}

/**
 * A class has one physical capacity shared across personal and corporate
 * bookings — this is the combined confirmed ("booked") occupancy across both
 * tables, used wherever fullness must be checked against classes.capacity.
 */
export async function countCombinedBookedForClass(db: Database, classId: number) {
  const [{ count: personalCount }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(bookings)
    .where(and(eq(bookings.classId, classId), eq(bookings.status, "booked")));

  const [{ count: corporateCount }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(corporateBookings)
    .where(
      and(
        eq(corporateBookings.classId, classId),
        eq(corporateBookings.status, "booked"),
      ),
    );

  return Number(personalCount) + Number(corporateCount);
}

export async function createBooking(
  db: Database,
  data: {
    classId: number;
    userId: number;
    membershipId: number | null;
    status: "booked" | "waitlisted";
    creditsUsed: number;
  },
) {
  return db.insert(bookings).values(data).returning().get();
}

export async function updateMembershipCredits(
  db: Database,
  membershipId: number,
  creditsRemaining: number,
) {
  await db
    .update(memberships)
    .set({ creditsRemaining })
    .where(eq(memberships.id, membershipId));
}

export async function findBookingWithClass(db: Database, bookingId: number) {
  return db
    .select({ booking: bookings, cls: classes })
    .from(bookings)
    .innerJoin(classes, eq(bookings.classId, classes.id))
    .where(eq(bookings.id, bookingId))
    .get();
}

export async function updateBooking(
  db: Database,
  bookingId: number,
  patch: Partial<Pick<Booking, "status" | "cancelledAt" | "creditsUsed">>,
) {
  await db.update(bookings).set(patch).where(eq(bookings.id, bookingId));
}

export async function findMembershipById(db: Database, membershipId: number) {
  return db
    .select()
    .from(memberships)
    .where(eq(memberships.id, membershipId))
    .get();
}

export async function findNextWaitlistedBooking(db: Database, classId: number) {
  return db
    .select()
    .from(bookings)
    .where(and(eq(bookings.classId, classId), eq(bookings.status, "waitlisted")))
    .orderBy(asc(bookings.bookedAt))
    .get();
}

export async function findBookingById(db: Database, bookingId: number) {
  return db.select().from(bookings).where(eq(bookings.id, bookingId)).get();
}

export async function createCheckin(
  db: Database,
  data: { userId: number; bookingId: number; source: "front_desk" | "kiosk" | "app" },
) {
  await db.insert(checkins).values(data);
}

export async function findUserBookingsWithClass(db: Database, userId: number) {
  return db
    .select({
      id: bookings.id,
      status: bookings.status,
      creditsUsed: bookings.creditsUsed,
      bookedAt: bookings.bookedAt,
      classId: classes.id,
      className: classes.name,
      room: classes.room,
      startsAt: classes.startsAt,
      durationMin: classes.durationMin,
      cancelled: classes.cancelled,
    })
    .from(bookings)
    .innerJoin(classes, eq(bookings.classId, classes.id))
    .where(eq(bookings.userId, userId))
    .orderBy(asc(classes.startsAt));
}

export async function findRosterForClass(db: Database, classId: number) {
  return db
    .select({
      bookingId: bookings.id,
      status: bookings.status,
      memberId: users.id,
      memberName: users.name,
      memberEmail: users.email,
      bookedAt: bookings.bookedAt,
    })
    .from(bookings)
    .innerJoin(users, eq(bookings.userId, users.id))
    .where(eq(bookings.classId, classId))
    .orderBy(asc(bookings.bookedAt));
}

export async function findUpcomingBookingsForMember(
  db: Database,
  userId: number,
  fromIso: string,
  toIso: string,
) {
  return db
    .select({
      bookingId: bookings.id,
      bookingStatus: bookings.status,
      classId: classes.id,
      className: classes.name,
      room: classes.room,
      startsAt: classes.startsAt,
      durationMin: classes.durationMin,
      capacity: classes.capacity,
      trainerId: classes.trainerId,
      trainerName: users.name,
    })
    .from(bookings)
    .innerJoin(classes, eq(bookings.classId, classes.id))
    .leftJoin(users, eq(classes.trainerId, users.id))
    .where(
      and(
        eq(bookings.userId, userId),
        eq(bookings.status, "booked"),
        sql`${classes.startsAt} >= ${fromIso}`,
        sql`${classes.startsAt} <= ${toIso}`,
        eq(classes.cancelled, false),
      ),
    )
    .orderBy(classes.startsAt);
}

export async function countCheckinsForClass(db: Database, classId: number) {
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(checkins)
    .innerJoin(bookings, eq(checkins.bookingId, bookings.id))
    .where(eq(bookings.classId, classId));
  return Number(result?.count ?? 0);
}

export async function findWaitlistedBookingsForUser(db: Database, userId: number) {
  return db
    .select({
      bookingId: bookings.id,
      classId: classes.id,
      className: classes.name,
      room: classes.room,
      startsAt: classes.startsAt,
      durationMin: classes.durationMin,
      capacity: classes.capacity,
      bookedAt: bookings.bookedAt,
    })
    .from(bookings)
    .innerJoin(classes, eq(bookings.classId, classes.id))
    .where(and(eq(bookings.userId, userId), eq(bookings.status, "waitlisted")))
    .orderBy(asc(classes.startsAt));
}

export async function countWaitlistedAhead(
  db: Database,
  classId: number,
  bookedAt: string,
) {
  const [{ position }] = await db
    .select({ position: sql<number>`count(*)` })
    .from(bookings)
    .where(
      and(
        eq(bookings.classId, classId),
        eq(bookings.status, "waitlisted"),
        sql`${bookings.bookedAt} < ${bookedAt}`,
      ),
    );
  return Number(position);
}
