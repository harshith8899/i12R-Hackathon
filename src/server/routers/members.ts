import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, staffProcedure, adminProcedure } from "../trpc";
import * as membersRepo from "@/server/repositories/members";

export const membersRouter = router({
  profile: protectedProcedure.query(async ({ ctx }) => {
    const membership = await membersRepo.findLatestMembershipWithPlan(
      ctx.db,
      ctx.user.id,
    );
    const classesAttended = await membersRepo.countAttendedBookingsForUser(
      ctx.db,
      ctx.user.id,
    );

    return {
      id: ctx.user.id,
      name: ctx.user.name,
      email: ctx.user.email,
      phone: ctx.user.phone,
      role: ctx.user.role,
      membership: membership ?? null,
      classesAttended,
    };
  }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).optional(),
        phone: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return membersRepo.updateUserProfile(ctx.db, ctx.user.id, input);
    }),

  search: staffProcedure
    .input(z.object({ q: z.string().default(""), limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      return membersRepo.searchUsers(ctx.db, input.q, input.limit);
    }),

  byId: staffProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const user = await membersRepo.findUserById(ctx.db, input.id);

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Member not found." });
      }

      const history = await membersRepo.findMembershipHistoryForUser(ctx.db, user.id);

      const { passwordHash: _omit, ...safe } = user;
      return { ...safe, memberships: history };
    }),

  setActive: adminProcedure
    .input(z.object({ id: z.number(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return membersRepo.setUserActive(ctx.db, input.id, input.active);
    }),

  setRole: adminProcedure
    .input(z.object({ id: z.number(), role: z.enum(["member", "trainer", "admin"]) }))
    .mutation(async ({ ctx, input }) => {
      return membersRepo.setUserRole(ctx.db, input.id, input.role);
    }),

  lookupByEmailOrPhone: staffProcedure
    .input(z.object({ query: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await membersRepo.findUserByEmailOrPhone(ctx.db, input.query);

      if (!user || user.role !== "member") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Member not found." });
      }

      return user;
    }),
});
