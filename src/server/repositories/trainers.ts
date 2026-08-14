import { eq, and, gte } from "drizzle-orm";
import { classes, trainerAvailability } from "@/db/schema";

type Database = typeof import("@/db").db;

export async function findUpcomingClassesForTrainer(db: Database, trainerId: number) {
  const now = new Date().toISOString();

  return db
    .select({
      id: classes.id,
      name: classes.name,
      room: classes.room,
      startsAt: classes.startsAt,
      durationMin: classes.durationMin,
      cancelled: classes.cancelled,
    })
    .from(classes)
    .where(
      and(
        eq(classes.trainerId, trainerId),
        gte(classes.startsAt, now),
        eq(classes.cancelled, false),
      ),
    )
    .orderBy(classes.startsAt);
}

export async function findAvailabilityForTrainer(db: Database, trainerId: number) {
  return db
    .select()
    .from(trainerAvailability)
    .where(eq(trainerAvailability.trainerId, trainerId))
    .orderBy(trainerAvailability.dayOfWeek);
}

export async function upsertAvailability(
  db: Database,
  data: {
    trainerId: number;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  },
) {
  const existing = await db
    .select()
    .from(trainerAvailability)
    .where(
      and(
        eq(trainerAvailability.trainerId, data.trainerId),
        eq(trainerAvailability.dayOfWeek, data.dayOfWeek),
      ),
    )
    .get();

  if (existing) {
    return db
      .update(trainerAvailability)
      .set({
        startTime: data.startTime,
        endTime: data.endTime,
      })
      .where(eq(trainerAvailability.id, existing.id))
      .returning()
      .get();
  } else {
    return db
      .insert(trainerAvailability)
      .values({
        trainerId: data.trainerId,
        dayOfWeek: data.dayOfWeek,
        startTime: data.startTime,
        endTime: data.endTime,
      })
      .returning()
      .get();
  }
}

export async function deleteAvailabilityForDay(
  db: Database,
  trainerId: number,
  dayOfWeek: number,
) {
  const existing = await db
    .select()
    .from(trainerAvailability)
    .where(
      and(
        eq(trainerAvailability.trainerId, trainerId),
        eq(trainerAvailability.dayOfWeek, dayOfWeek),
      ),
    )
    .get();

  if (existing) {
    await db.delete(trainerAvailability).where(eq(trainerAvailability.id, existing.id));
  }

  return { success: true };
}
