import { reschedules } from "@/db/schema";

type Database = typeof import("@/db").db;

export async function createReschedule(
  db: Database,
  data: {
    userId: number;
    fromBookingId: number;
    toBookingId: number;
    fromClassId: number;
    toClassId: number;
  },
) {
  await db.insert(reschedules).values(data);
}
