import { and, eq, desc, not, sql } from "drizzle-orm";
import { notifications, users } from "@/db/schema";

type Database = typeof import("@/db").db;

export async function countUnreadForUser(db: Database, userId: number) {
  const [{ count }] = await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), not(notifications.read)));

  return Number(count) || 0;
}

export async function findNotificationsForUser(
  db: Database,
  userId: number,
  limit: number,
) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function markAllReadForUser(db: Database, userId: number) {
  await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.userId, userId), not(notifications.read)));
}

export async function findAllMemberIds(db: Database) {
  return db.select({ id: users.id }).from(users).where(eq(users.role, "member"));
}

export async function insertNotificationsForUsers(
  db: Database,
  rows: {
    userId: number;
    type: "waitlist_promotion" | "class_cancelled" | "membership_expiring" | "announcement";
    title: string;
    message: string;
  }[],
) {
  await db.insert(notifications).values(rows);
}
