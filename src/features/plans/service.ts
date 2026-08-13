import * as plansRepo from "@/server/repositories/plans";

export type PlanServiceErrorCode = "NOT_FOUND" | "BAD_REQUEST";

export class PlanServiceError extends Error {
  constructor(
    public code: PlanServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PlanServiceError";
  }
}

function addDays(dateIso: string, days: number): string {
  const d = new Date(dateIso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export type PlanServiceContext = {
  db: typeof import("@/db").db;
  user: {
    id: number;
  };
};

export async function subscribeToPlan(
  ctx: PlanServiceContext,
  input: {
    planId: number;
    method: "card" | "cash" | "upi" | "transfer";
  },
) {
  const plan = await plansRepo.findPlanById(ctx.db, input.planId);

  if (!plan) {
    throw new PlanServiceError("NOT_FOUND", "Plan not found.");
  }
  if (!plan.active) {
    throw new PlanServiceError(
      "BAD_REQUEST",
      "This plan is no longer available.",
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  const membership = await plansRepo.createMembership(ctx.db, {
    userId: ctx.user.id,
    planId: plan.id,
    startDate: today,
    endDate: addDays(today, plan.durationDays),
    creditsRemaining: plan.classCredits,
    status: "active",
  });

  await plansRepo.createPayment(ctx.db, {
    userId: ctx.user.id,
    membershipId: membership.id,
    amountCents: plan.priceCents,
    method: input.method,
    status: "paid",
    reference: `PAY-${Date.now()}`,
  });

  return membership;
}
