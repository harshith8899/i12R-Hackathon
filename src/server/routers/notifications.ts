import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../trpc";
import * as notificationsRepo from "@/server/repositories/notifications";

export const notificationsRouter = router({
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    return notificationsRepo.countUnreadForUser(ctx.db, ctx.user.id);
  }),

  list: protectedProcedure
    .input(z.object({ limit: z.number().default(50) }).default({}))
    .query(async ({ ctx, input }) => {
      return notificationsRepo.findNotificationsForUser(
        ctx.db,
        ctx.user.id,
        input.limit,
      );
    }),

  markAllAsRead: protectedProcedure.mutation(async ({ ctx }) => {
    await notificationsRepo.markAllReadForUser(ctx.db, ctx.user.id);

    return { ok: true };
  }),

  broadcast: adminProcedure
    .input(
      z.object({
        title: z.string(),
        message: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const activeMembers = await notificationsRepo.findAllMemberIds(ctx.db);

      if (activeMembers.length === 0) {
        return { ok: true, count: 0 };
      }

      await notificationsRepo.insertNotificationsForUsers(
        ctx.db,
        activeMembers.map((member) => ({
          userId: member.id,
          type: "announcement" as const,
          title: input.title,
          message: input.message,
        }))
      );

      return { ok: true, count: activeMembers.length };
    }),
});
