import { and, eq, desc } from "drizzle-orm";
import { companies, companyMembers, users, corporateBookings, classes } from "@/db/schema";

type Database = typeof import("@/db").db;

export async function listCompanies(db: Database) {
  return db
    .select({
      id: companies.id,
      name: companies.name,
      contactEmail: companies.contactEmail,
      creditPoolBalance: companies.creditPoolBalance,
      active: companies.active,
      createdAt: companies.createdAt,
    })
    .from(companies)
    .orderBy(desc(companies.createdAt));
}

export async function findCompanyMembers(db: Database, companyId: number) {
  return db
    .select({
      id: users.id,
      companyMemberId: companyMembers.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
    })
    .from(companyMembers)
    .innerJoin(users, eq(companyMembers.userId, users.id))
    .where(eq(companyMembers.companyId, companyId))
    .orderBy(users.name);
}

export async function findRecentCorporateBookingsForCompany(
  db: Database,
  companyId: number,
) {
  return db
    .select({
      id: corporateBookings.id,
      status: corporateBookings.status,
      creditsUsed: corporateBookings.creditsUsed,
      bookedAt: corporateBookings.bookedAt,
      className: classes.name,
      startsAt: classes.startsAt,
      memberName: users.name,
    })
    .from(corporateBookings)
    .innerJoin(classes, eq(corporateBookings.classId, classes.id))
    .innerJoin(users, eq(corporateBookings.userId, users.id))
    .where(eq(corporateBookings.companyId, companyId))
    .orderBy(desc(corporateBookings.bookedAt))
    .limit(20);
}

export async function createCompany(
  db: Database,
  data: {
    name: string;
    contactEmail: string;
    creditPoolBalance: number;
  },
) {
  return db
    .insert(companies)
    .values({
      name: data.name,
      contactEmail: data.contactEmail,
      creditPoolBalance: data.creditPoolBalance,
      active: true,
    })
    .returning()
    .get();
}

export async function updateCompanyActive(db: Database, id: number, active: boolean) {
  return db
    .update(companies)
    .set({ active })
    .where(eq(companies.id, id))
    .returning()
    .get();
}

export async function findCompanyMemberLinkForUserAndCompany(
  db: Database,
  userId: number,
  companyId: number,
) {
  return db
    .select()
    .from(companyMembers)
    .where(
      and(eq(companyMembers.userId, userId), eq(companyMembers.companyId, companyId)),
    )
    .get();
}

export async function createCompanyMemberLink(
  db: Database,
  data: { userId: number; companyId: number },
) {
  return db
    .insert(companyMembers)
    .values({
      userId: data.userId,
      companyId: data.companyId,
    })
    .returning()
    .get();
}

export async function findCompanyMemberById(db: Database, id: number) {
  return db.select().from(companyMembers).where(eq(companyMembers.id, id)).get();
}

export async function deleteCompanyMemberLink(db: Database, id: number) {
  await db.delete(companyMembers).where(eq(companyMembers.id, id));
}
