import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { classes, bookings, corporateBookings, users } from "@/db/schema";

type Db = typeof import("@/db").db;
type Tx = Parameters<Db["transaction"]>[0] extends (tx: infer T) => unknown
  ? T
  : never;
type Database = Db | Tx;

export async function cancelClass(db: Database, classId: number) {
  return db
    .update(classes)
    .set({ cancelled: true })
    .where(eq(classes.id, classId))
    .returning()
    .get();
}

export async function listClasses(
  db: Database,
  filters: { from?: string; to?: string; includeCancelled: boolean },
) {
  const conditions = [];
  if (filters.from) conditions.push(gte(classes.startsAt, filters.from));
  if (filters.to) conditions.push(lte(classes.startsAt, filters.to));
  if (!filters.includeCancelled) conditions.push(eq(classes.cancelled, false));

  return db
    .select({
      id: classes.id,
      name: classes.name,
      description: classes.description,
      room: classes.room,
      capacity: classes.capacity,
      startsAt: classes.startsAt,
      durationMin: classes.durationMin,
      creditCost: classes.creditCost,
      cancelled: classes.cancelled,
      trainerName: users.name,
      booked: sql<number>`(
        select count(*) from ${bookings}
        where ${bookings.classId} = ${classes.id}
          and ${bookings.status} = 'booked'
      ) + (
        select count(*) from ${corporateBookings}
        where ${corporateBookings.classId} = ${classes.id}
          and ${corporateBookings.status} = 'booked'
      )`.as("booked"),
    })
    .from(classes)
    .leftJoin(users, eq(classes.trainerId, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(classes.startsAt));
}

export async function findClassRoster(db: Database, classId: number) {
  return db
    .select({
      bookingId: bookings.id,
      status: bookings.status,
      memberName: users.name,
      memberEmail: users.email,
    })
    .from(bookings)
    .innerJoin(users, eq(bookings.userId, users.id))
    .where(eq(bookings.classId, classId));
}

export async function createClass(
  db: Database,
  data: {
    name: string;
    description: string | null;
    trainerId: number | null;
    room: string;
    capacity: number;
    startsAt: string;
    durationMin: number;
    creditCost: number;
  },
) {
  return db.insert(classes).values(data).returning().get();
}

export async function updateClass(
  db: Database,
  id: number,
  patch: Partial<{
    name: string;
    room: string;
    capacity: number;
    startsAt: string;
    trainerId: number | null;
  }>,
) {
  return db.update(classes).set(patch).where(eq(classes.id, id)).returning().get();
}
