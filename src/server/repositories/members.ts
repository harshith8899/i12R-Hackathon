import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { users, memberships, membershipPlans, bookings } from "@/db/schema";

type Database = typeof import("@/db").db;

export async function findLatestMembershipWithPlan(db: Database, userId: number) {
  return db
    .select({
      id: memberships.id,
      status: memberships.status,
      startDate: memberships.startDate,
      endDate: memberships.endDate,
      creditsRemaining: memberships.creditsRemaining,
      planName: membershipPlans.name,
      planCredits: membershipPlans.classCredits,
    })
    .from(memberships)
    .innerJoin(membershipPlans, eq(memberships.planId, membershipPlans.id))
    .where(eq(memberships.userId, userId))
    .orderBy(desc(memberships.endDate))
    .get();
}

export async function countAttendedBookingsForUser(db: Database, userId: number) {
  const [{ attended }] = await db
    .select({ attended: sql<number>`count(*)` })
    .from(bookings)
    .where(and(eq(bookings.userId, userId), eq(bookings.status, "attended")));
  return Number(attended);
}

export async function updateUserProfile(
  db: Database,
  userId: number,
  patch: Partial<{ name: string; phone: string | null }>,
) {
  return db.update(users).set(patch).where(eq(users.id, userId)).returning().get();
}

export async function searchUsers(db: Database, q: string, limit: number) {
  const term = `%${q.trim()}%`;
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      role: users.role,
      active: users.active,
    })
    .from(users)
    .where(q.trim() ? or(like(users.name, term), like(users.email, term)) : undefined)
    .limit(limit);
}

export async function findUserById(db: Database, id: number) {
  return db.select().from(users).where(eq(users.id, id)).get();
}

export async function findMembershipHistoryForUser(db: Database, userId: number) {
  return db
    .select({
      id: memberships.id,
      planName: membershipPlans.name,
      startDate: memberships.startDate,
      endDate: memberships.endDate,
      status: memberships.status,
      creditsRemaining: memberships.creditsRemaining,
    })
    .from(memberships)
    .innerJoin(membershipPlans, eq(memberships.planId, membershipPlans.id))
    .where(eq(memberships.userId, userId))
    .orderBy(desc(memberships.startDate));
}

export async function setUserActive(db: Database, id: number, active: boolean) {
  return db.update(users).set({ active }).where(eq(users.id, id)).returning().get();
}

export async function setUserRole(
  db: Database,
  id: number,
  role: "member" | "trainer" | "admin",
) {
  return db.update(users).set({ role }).where(eq(users.id, id)).returning().get();
}

export async function findUserByEmailOrPhone(db: Database, query: string) {
  const term = `%${query.trim()}%`;
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      role: users.role,
      active: users.active,
    })
    .from(users)
    .where(or(like(users.email, term), like(users.phone, term)))
    .get();
}
