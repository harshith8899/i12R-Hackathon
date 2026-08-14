import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../trpc";
import { findCompanyById, updateCompanyCredits } from "@/server/repositories/corporate-bookings";
import { findUserById } from "@/server/repositories/members";
import * as adminCompaniesRepo from "@/server/repositories/admin-companies";

export const adminCompaniesRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    return adminCompaniesRepo.listCompanies(ctx.db);
  }),

  getById: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const company = await findCompanyById(ctx.db, input.id);

      if (!company) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Company not found." });
      }

      const members = await adminCompaniesRepo.findCompanyMembers(ctx.db, company.id);

      const recentBookings = await adminCompaniesRepo.findRecentCorporateBookingsForCompany(
        ctx.db,
        company.id,
      );

      return {
        ...company,
        members,
        recentBookings,
      };
    }),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        contactEmail: z.string().email(),
        creditPoolBalance: z.number().int().default(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return adminCompaniesRepo.createCompany(ctx.db, {
        name: input.name,
        contactEmail: input.contactEmail,
        creditPoolBalance: input.creditPoolBalance,
      });
    }),

  updateActive: adminProcedure
    .input(z.object({ id: z.number(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const company = await findCompanyById(ctx.db, input.id);

      if (!company) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Company not found." });
      }

      return adminCompaniesRepo.updateCompanyActive(ctx.db, input.id, input.active);
    }),

  topUp: adminProcedure
    .input(z.object({ id: z.number(), amount: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const company = await findCompanyById(ctx.db, input.id);

      if (!company) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Company not found." });
      }

      await updateCompanyCredits(
        ctx.db,
        input.id,
        company.creditPoolBalance + input.amount,
      );

      return findCompanyById(ctx.db, input.id);
    }),

  linkMember: adminProcedure
    .input(z.object({ companyId: z.number(), userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const company = await findCompanyById(ctx.db, input.companyId);

      if (!company) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Company not found." });
      }

      const user = await findUserById(ctx.db, input.userId);

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      }

      if (user.role !== "member") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only members can be linked to companies.",
        });
      }

      const existing = await adminCompaniesRepo.findCompanyMemberLinkForUserAndCompany(
        ctx.db,
        input.userId,
        input.companyId,
      );

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This member is already linked to this company.",
        });
      }

      return adminCompaniesRepo.createCompanyMemberLink(ctx.db, {
        userId: input.userId,
        companyId: input.companyId,
      });
    }),

  unlinkMember: adminProcedure
    .input(z.object({ companyMemberId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const companyMember = await adminCompaniesRepo.findCompanyMemberById(
        ctx.db,
        input.companyMemberId,
      );

      if (!companyMember) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Company member link not found.",
        });
      }

      await adminCompaniesRepo.deleteCompanyMemberLink(ctx.db, input.companyMemberId);

      return { ok: true };
    }),
});
