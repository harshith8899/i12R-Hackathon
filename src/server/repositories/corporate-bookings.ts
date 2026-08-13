import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  corporateBookings,
  classes,
  companies,
  companyMembers,
  checkins,
  users,
} from "@/db/schema";
import type { CorporateBooking } from "@/db/schema";

type Db = typeof import("@/db").db;
type Tx = Parameters<Db["transaction"]>[0] extends (tx: infer T) => unknown
  ? T
  : never;
type Database = Db | Tx;

export async function findActiveCorporateBookingsForClass(
  db: Database,
  classId: number,
) {
  return db
    .select()
    .from(corporateBookings)
    .where(
      and(
        eq(corporateBookings.classId, classId),
        inArray(corporateBookings.status, ["booked", "waitlisted"]),
      ),
    );
}

export async function findUserCorporateBookingsWithClass(
  db: Database,
  userId: number,
) {
  return db
    .select({
      id: corporateBookings.id,
      status: corporateBookings.status,
      creditsUsed: corporateBookings.creditsUsed,
      bookedAt: corporateBookings.bookedAt,
      classId: classes.id,
      className: classes.name,
      room: classes.room,
      startsAt: classes.startsAt,
      durationMin: classes.durationMin,
      cancelled: classes.cancelled,
      companyName: companies.name,
    })
    .from(corporateBookings)
    .innerJoin(classes, eq(corporateBookings.classId, classes.id))
    .innerJoin(companies, eq(corporateBookings.companyId, companies.id))
    .where(eq(corporateBookings.userId, userId))
    .orderBy(asc(classes.startsAt));
}

export async function findActiveCorporateBookingForUserAndClass(
  db: Database,
  classId: number,
  userId: number,
) {
  return db
    .select()
    .from(corporateBookings)
    .where(
      and(
        eq(corporateBookings.classId, classId),
        eq(corporateBookings.userId, userId),
        inArray(corporateBookings.status, ["booked", "waitlisted"]),
      ),
    )
    .get();
}

export async function findActiveCompanyForMember(db: Database, userId: number) {
  return db
    .select()
    .from(companyMembers)
    .innerJoin(companies, eq(companyMembers.companyId, companies.id))
    .where(and(eq(companyMembers.userId, userId), eq(companies.active, true)))
    .get();
}

export async function countCorporateBookedForClass(db: Database, classId: number) {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(corporateBookings)
    .where(
      and(
        eq(corporateBookings.classId, classId),
        eq(corporateBookings.status, "booked"),
      ),
    );
  return Number(count);
}

export async function createCorporateBooking(
  db: Database,
  data: {
    classId: number;
    userId: number;
    companyId: number;
    status: "booked" | "waitlisted";
    creditsUsed: number;
  },
) {
  return db.insert(corporateBookings).values(data).returning().get();
}

export async function updateCompanyCredits(
  db: Database,
  companyId: number,
  creditPoolBalance: number,
) {
  await db
    .update(companies)
    .set({ creditPoolBalance })
    .where(eq(companies.id, companyId));
}

export async function findCorporateBookingWithClass(
  db: Database,
  bookingId: number,
) {
  return db
    .select({ booking: corporateBookings, cls: classes })
    .from(corporateBookings)
    .innerJoin(classes, eq(corporateBookings.classId, classes.id))
    .where(eq(corporateBookings.id, bookingId))
    .get();
}

export async function updateCorporateBooking(
  db: Database,
  bookingId: number,
  patch: Partial<Pick<CorporateBooking, "status" | "cancelledAt" | "creditsUsed">>,
) {
  await db
    .update(corporateBookings)
    .set(patch)
    .where(eq(corporateBookings.id, bookingId));
}

export async function findCompanyById(db: Database, companyId: number) {
  return db.select().from(companies).where(eq(companies.id, companyId)).get();
}

export async function findNextWaitlistedCorporateBooking(
  db: Database,
  classId: number,
) {
  return db
    .select()
    .from(corporateBookings)
    .where(
      and(
        eq(corporateBookings.classId, classId),
        eq(corporateBookings.status, "waitlisted"),
      ),
    )
    .orderBy(asc(corporateBookings.bookedAt))
    .get();
}

export async function findCorporateBookingById(db: Database, bookingId: number) {
  return db
    .select()
    .from(corporateBookings)
    .where(eq(corporateBookings.id, bookingId))
    .get();
}

// Known issue: checkins.bookingId references the personal `bookings` table,
// so it cannot reference a corporate booking. `source` is intentionally not
// set here and falls back to the schema default, matching existing behavior.
export async function createCorporateCheckin(
  db: Database,
  data: { userId: number },
) {
  await db.insert(checkins).values({ userId: data.userId, bookingId: null });
}

export async function findRosterForClass(db: Database, classId: number) {
  return db
    .select({
      bookingId: corporateBookings.id,
      status: corporateBookings.status,
      memberId: users.id,
      memberName: users.name,
      memberEmail: users.email,
      bookedAt: corporateBookings.bookedAt,
      companyName: companies.name,
    })
    .from(corporateBookings)
    .innerJoin(users, eq(corporateBookings.userId, users.id))
    .innerJoin(companies, eq(corporateBookings.companyId, companies.id))
    .where(eq(corporateBookings.classId, classId))
    .orderBy(asc(corporateBookings.bookedAt));
}
