import { desc, eq } from "drizzle-orm";
import { payments, users, memberships, membershipPlans } from "@/db/schema";

type Database = typeof import("@/db").db;

export async function findPaymentsForUser(db: Database, userId: number) {
  return db
    .select({
      id: payments.id,
      amountCents: payments.amountCents,
      method: payments.method,
      status: payments.status,
      reference: payments.reference,
      createdAt: payments.createdAt,
      planName: membershipPlans.name,
    })
    .from(payments)
    .leftJoin(memberships, eq(payments.membershipId, memberships.id))
    .leftJoin(membershipPlans, eq(memberships.planId, membershipPlans.id))
    .where(eq(payments.userId, userId))
    .orderBy(desc(payments.createdAt));
}

export async function findAllPayments(db: Database, limit: number) {
  return db
    .select({
      id: payments.id,
      amountCents: payments.amountCents,
      method: payments.method,
      status: payments.status,
      reference: payments.reference,
      createdAt: payments.createdAt,
      memberName: users.name,
      memberEmail: users.email,
    })
    .from(payments)
    .innerJoin(users, eq(payments.userId, users.id))
    .orderBy(desc(payments.createdAt))
    .limit(limit);
}

export async function findPaymentById(db: Database, paymentId: number) {
  return db.select().from(payments).where(eq(payments.id, paymentId)).get();
}

export async function markPaymentPaid(db: Database, paymentId: number) {
  return db
    .update(payments)
    .set({ status: "paid" })
    .where(eq(payments.id, paymentId))
    .returning()
    .get();
}

export async function markPaymentRefunded(db: Database, paymentId: number) {
  return db
    .update(payments)
    .set({ status: "refunded" })
    .where(eq(payments.id, paymentId))
    .returning()
    .get();
}
