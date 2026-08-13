import { eq } from "drizzle-orm";
import { membershipPlans, memberships, payments } from "@/db/schema";

type Database = typeof import("@/db").db;

export async function findPlanById(db: Database, planId: number) {
  return db
    .select()
    .from(membershipPlans)
    .where(eq(membershipPlans.id, planId))
    .get();
}

export async function createMembership(
  db: Database,
  data: {
    userId: number;
    planId: number;
    startDate: string;
    endDate: string;
    creditsRemaining: number;
    status: "active";
  },
) {
  return db.insert(memberships).values(data).returning().get();
}

export async function createPayment(
  db: Database,
  data: {
    userId: number;
    membershipId: number;
    amountCents: number;
    method: "card" | "cash" | "upi" | "transfer";
    status: "paid";
    reference: string;
  },
) {
  await db.insert(payments).values(data);
}
