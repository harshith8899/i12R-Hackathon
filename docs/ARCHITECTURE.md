# FlexFit Studio — Architecture

This document is persistent architecture memory for the FlexFit Studio refactor. It exists so a future AI pair-programming session (or a human) can pick up the work without re-deriving decisions that have already been made.

**Read this before touching the code. Then inspect the actual current source before assuming anything below is still accurate** — this document should be updated whenever an architectural decision is actually made, but code and doc can still drift.

## Hackathon context

This is Project 1 of the 2026 i12 HR Drive Hackathon: restructuring a working gym-management application (FlexFit Studio) into a codebase someone would actually want to work in. AI/pair programming is explicitly allowed and expected; the team using it must understand and be able to defend what ends up in the repository.

**The non-negotiable constraint: behavior must be preserved exactly.** Same inputs, same outputs, same errors, same edge cases, same authorization behavior, same business behavior. This is a structural refactor, not a rewrite — nothing here changes what the app does, only how the code that does it is organized.

---

## Architecture principles

These are the principles actually being followed, not aspirational ones:

1. **Behavior-preserving refactoring.** Every change must be verifiable as behavior-neutral: same response shapes, same error codes/messages, same authorization, same edge cases.
2. **One concern per change.** Structural refactors don't get bundled with bug fixes, optimizations, or new features in the same change.
3. **Do not over-engineer.** No generic `BaseRepository`, no `BaseService`, no dependency-injection container, no interfaces created "just in case," no abstraction built for a second consumer that doesn't exist yet.
4. **Router responsibilities:** input validation (zod), authentication/authorization procedure selection (`protectedProcedure` / `staffProcedure` / `adminProcedure`), calling the service or repository, mapping domain/service errors to `TRPCError`, and trivial response shaping where appropriate (e.g. an in-memory date filter that isn't worth a repository round-trip).
5. **Repository responsibilities:** database queries, inserts, updates, counts, joins, ordering/filtering at the database level. Nothing else.
6. **Repository must NOT contain:** authorization decisions, business rules, refund decisions, capacity decisions, waitlist decisions, or domain/service error throwing. A repository function takes plain parameters and returns plain data — it doesn't know *why* it was called.
7. **Service responsibilities:** business rules, multi-step workflows, business validation, credit calculations, capacity/waitlist decisions, domain-specific errors (a `*ServiceError` class per feature), and authorization logic that is genuinely part of the business workflow (e.g. "owner or staff can cancel this booking" — a rule, not a route-level role gate).
8. **Do not create abstractions merely to make the architecture look consistent.** Not every router needs a service. A procedure that's a pure query with no branching business logic goes straight from router to repository — see the reference architecture below.
9. **Reuse an existing repository function only when its responsibility and data shape genuinely match.** Do not force a function written for one table onto a differently-shaped table just to avoid writing a new one-line function.
10. **Preserve existing behavior even when it looks suspicious.** Document suspicious/known-issue behavior separately (see "Known issues" below) rather than silently fixing it mid-refactor. A fix is a deliberate, separately-reviewed decision, not a refactoring side effect.

### The reference architecture

Established by the `bookings` feature and since repeated for `reschedules` and `corporate-bookings`:

```
Pure reads (no business logic):
  Router → Repository → Database

Business workflows (branching rules, multi-step writes):
  Router → Service → Repository → Database
```

A service function takes a small context object (`{ db, user }`) and plain input, throws a feature-specific `*ServiceError` (with a `code` matching tRPC's error codes and a message) on any business-rule violation, and returns plain data on success. The router wraps the service call in a `try/catch`, translating `*ServiceError` into `TRPCError` with the same code/message, and rethrows anything else unchanged. This pattern is now used identically by `bookings`, `reschedules`, and `corporate-bookings` — see "Completed architectural work" below.

---

## Current directory structure

```
src/
  app/          Next.js App Router — pages and the tRPC route handler
  db/           Drizzle schema, DB client, seed script
  features/     feature-specific business/application logic (services)
  server/       server-only code: tRPC routers, repositories, server services
  shared/       genuinely shared client-facing utilities/components
```

Only these five top-level directories currently exist under `src/`. **`README.md`'s "Layout" section is stale** — it still describes an earlier `components/`, `lib/`, `hooks/` layout from before the Phase 1 restructure (commit `7fa6b13`, "establish production-ready project structure"). The README was not updated when that restructure happened. This document reflects the actual current tree; don't trust the README's layout diagram.

### `src/app/`
Next.js App Router pages and the tRPC HTTP handler (`app/api/trpc/[trpc]/route.ts`). One page per route: `dashboard`, `schedule`, `waitlist`, `kiosk`, `notifications`, `plans`, `login`, `trainer/schedule`, and the `admin/*` pages (`admin`, `admin/companies`, `admin/companies/[id]`, `admin/reports`, `admin/attendance`, `admin/announcements`).

### `src/db/`
`schema.ts` (Drizzle table definitions and inferred types), `index.ts` (the `db` client, a `drizzle(libsql)` instance), `seed.ts`.

### `src/features/`
Feature-specific business/application logic — one `service.ts` per feature that has genuine multi-step business workflows. Currently populated:
- `features/bookings/service.ts`
- `features/reschedules/service.ts`
- `features/corporate-bookings/service.ts`

**Empty scaffold directories exist but contain no files**: `features/auth`, `features/common`, `features/members`, `features/notifications`, `features/payments`, `features/scheduling`, `features/trainers`, `features/waitlist`. These appear to be placeholders from the Phase 1 restructure for domains that haven't been refactored yet — do not assume they contain anything. A future session extracting business logic for, say, `plans.subscribe` would populate `features/payments/` or a new `features/plans/`, following the same pattern as the three completed features.

### `src/server/`
- `server/routers/` — the tRPC API boundary. One router per domain (`bookings`, `reschedules`, `corporate-bookings`, `classes`, `members`, `notifications`, `payments`, `plans`, `trainers`, `admin`, `admin-companies`, `auth`), composed in `routers/_app.ts`.
- `server/repositories/` — server-side database access. Currently populated: `repositories/bookings.ts`, `repositories/reschedules.ts`, `repositories/corporate-bookings.ts`. No other domain has a repository yet — every other router still queries Drizzle directly.
- `server/services/` — server-only cross-cutting utilities that aren't a feature workflow. Currently just `services/password.ts` (scrypt hash/verify, uses Node's `crypto`, moved here from `shared/` because it's server-only). This is distinct from `features/*/service.ts`: `server/services/` is for infrastructure-ish server utilities, `features/*/service.ts` is for domain business logic.
- `server/trpc.ts` — tRPC setup: `createContext` (session lookup from the `flexfit_session` cookie), and the procedure hierarchy `publicProcedure` → `protectedProcedure` (requires `ctx.user`) → `staffProcedure` (requires `role` in `admin`/`trainer`) / `adminProcedure` (requires `role === "admin"`). This is the authentication/coarse-authorization layer that routers select from; finer-grained authorization (e.g. "owner or staff", "must be linked to an active company") lives in the relevant feature's service.
- **Empty scaffold directories**: `server/middleware`, `server/permissions`, `server/validators`. Not currently used for anything — authorization today is entirely the `trpc.ts` procedure hierarchy plus in-service business-rule checks; input validation is inline `zod` schemas in each router.

### `src/shared/`
Genuinely shared, client-facing code:
- `shared/components/` — `NavBar.tsx`, `reschedule-modal.tsx`.
- `shared/lib/trpc.ts` — the tRPC React client. A client-side typed façade around `AppRouter`; it must not import server runtime code.
- `shared/utils/format.ts` — date/formatting helpers, moved here from an earlier location because they're genuinely shared (client and server, or multiple features).
- **Empty scaffold directories**: `shared/config`, `shared/constants`, `shared/hooks`, `shared/types`. Not currently used.

---

## Completed architectural work

### Bookings
`src/features/bookings/service.ts`, `src/server/repositories/bookings.ts`, `src/server/routers/bookings.ts`.

The router no longer performs any direct Drizzle queries. The service (`bookBooking`, `cancelBooking`, `markAttendedBooking`) contains: booking eligibility (class exists/not cancelled/not started), duplicate-booking check, active-membership validation, credit validation (including the `UNLIMITED_CREDITS = 999` sentinel), capacity/waitlist decision, cancellation, refund logic (`FREE_CANCELLATION_HOURS = 12`), waitlist promotion, and attendance validation. Errors are a `BookingServiceError` (`NOT_FOUND` / `BAD_REQUEST` / `CONFLICT` / `FORBIDDEN`), mapped to `TRPCError` in the router.

Pure read procedures (`mine`, `rosterFor`, `upcomingForMember`, `checkinCountFor`, `waitlisted`) go straight from router to repository — no service, since they have no branching business logic. Trivial query-shaping (an `includePast` date filter, an `hoursAhead`→window-timestamp computation, waitlist-position composition from two repository calls) stays in the router rather than being pushed into the repository or promoted into a service.

### Reschedules
`src/features/reschedules/service.ts`, `src/server/repositories/reschedules.ts`, `src/server/routers/reschedules.ts`.

Originally, `reschedule` (mutation) and `validateReschedule` (query) each independently implemented the same ~130 lines of eligibility logic — a real duplication risk, not just an architecture preference. The service now has one canonical implementation: `checkRescheduleEligibility` (ownership check, active-booking-status check, `FREE_RESCHEDULE_HOURS = 4` window, target-class validation — same name, not the same class, not started, not cancelled — duplicate-active-booking check, capacity/waitlist decision) and `rescheduleBooking` (calls the eligibility check, then performs the three-write workflow: create new booking → cancel original → insert reschedule audit record). `validateReschedule` calls the same eligibility function and translates a thrown `RescheduleServiceError` into `{ valid: false, reason }` instead of a `TRPCError` — it remains a non-throwing query for expected invalid states, exactly as before.

The repository holds only the reschedule-audit insert (`createReschedule`); every other query in the reschedule workflow reuses existing `bookings.ts` repository functions (`findBookingWithClass`, `findClassById`, `findActiveBookingForUserAndClass`, `countBookedForClass`, `findMembershipById`, `createBooking`, `updateBooking`) since reschedule operates on the same `bookings`/`classes`/`memberships` tables. `history` was left as a direct router→repository-free (i.e. still-inline) read — it's a simple report query with no business logic, so it wasn't force-migrated.

One type-only change was made to `repositories/bookings.ts` for this: `createBooking`'s `membershipId` parameter was widened from `number` to `number | null`, matching the actual (nullable) schema column — reschedule needs to pass through a possibly-null membership id exactly as the original inline code did.

### Corporate bookings
`src/features/corporate-bookings/service.ts`, `src/server/repositories/corporate-bookings.ts`, `src/server/routers/corporate-bookings.ts`.

Mirrors the `bookings` split. `mine` and `rosterFor` go router→repository (pure reads). `book`, `cancel`, `markAttended` go router→service→repository:
- `bookCorporateBooking` — class eligibility, duplicate-booking check, active-company-membership requirement (`companyMembers` ⋈ `companies` where active), company credit-pool sufficiency check, capacity/waitlist decision, corporate booking creation, credit-pool debit.
- `cancelCorporateBooking` — booking lookup, owner-or-staff authorization (business logic, same as `cancelBooking`), active-status check, `CORPORATE_FREE_CANCELLATION_HOURS = 24` refund window (**intentionally distinct from the personal-booking `FREE_CANCELLATION_HOURS = 12`** — do not merge these constants), cancellation, company credit refund, waitlist promotion, promoted-booking credit deduction.
- `markAttendedCorporateBooking` — booking existence, booked-status validation, status transition, check-in creation (see known issue below).

Errors are a `CorporateBookingServiceError`, same shape/mapping pattern as `BookingServiceError`/`RescheduleServiceError`. The only `bookings.ts` repository function reused here is `findClassById` (a pure `classes`-table query with no dependency on which booking table is involved) — no other `bookings.ts` function was force-reused, since `corporateBookings`/`companies` have a different shape than `bookings`/`memberships`.

### Password utility
Moved from the shared layer to `src/server/services/password.ts` because it uses Node's `crypto` APIs (`scryptSync`, `timingSafeEqual`) and is server-only. Consumers (`server/routers/auth.ts`) updated accordingly.

### Format utility
Moved to `src/shared/utils/format.ts` because it's genuinely shared (used by client components across multiple pages).

### tRPC client
`src/shared/lib/trpc.ts` remains in the shared, client-facing layer. It's a client-side typed façade around `AppRouter` and must not import server runtime code.

---

## Current git context

Current working branch: **Phase-2**. Do not state that this branch has been merged into main — it hasn't. Phase-1 work was rebased and merged into main (see the `Merge pull request #1 from harshith8899/Phase-1` commit); Phase-2 is still in progress on top of it.

As of this document, the reschedules extraction (including the `bookings.ts` repository) is committed (`refactor(reschedules): extract service and repository`). The bookings router's own delegation to its service/repository, and the corporate-bookings extraction, are still **uncommitted working-tree changes** — check `git status` before assuming what's actually landed. This document describes the code as it exists in the working tree, which is the source of truth; it does not track exact commit boundaries.

There are currently **no automated tests** in the repository (`vitest` is a devDependency with a `test` script in `package.json`, but zero `*.test.ts`/`*.spec.ts` files exist). Behavior-preservation is currently verified by `npx tsc --noEmit`, `pnpm build`, and manual diff/line-by-line review against the pre-refactor code — not by a test suite.

---

## Known issues (deliberately not fixed)

These are observations carried forward from refactoring, not automatic to-do items. Fixing any of them is a deliberate, separately-reviewed decision.

- **Corporate check-in schema mismatch.** `checkins.bookingId` is a foreign key into the personal `bookings` table; it cannot reference a `corporateBookings` row. `markAttendedCorporateBooking` inserts `checkins` with `bookingId: null`, and the caller-supplied `source` input is accepted by the `markAttended` procedure but never persisted (the checkin row falls back to the schema's default `source`). This predates all refactoring work and was explicitly preserved as-is in the `corporate-bookings` extraction.
- **Coarse-grained staff authorization.** `rosterFor` and `upcomingForMember` (bookings) and their corporate-bookings equivalent are gated by `staffProcedure` only — any admin/trainer can query any class's roster or any member's upcoming bookings; there's no check that a trainer is teaching that specific class. Pre-existing, unchanged by any refactor so far.
- **`waitlisted`'s N+1 query.** Computing each waitlisted booking's queue position issues one extra count query per row. Preserved exactly through the read-path repository extraction — not optimized.
- ~~**Capacity is not shared between booking types.**~~ **Resolved.** A class's `capacity` is now checked consistently against the combined occupancy of the `bookings` table (personal) and the `corporateBookings` table (corporate) everywhere fullness is decided: `bookingsRepo.countCombinedBookedForClass` (in `server/repositories/bookings.ts`) is the single source of truth for confirmed (`status = 'booked'`) combined occupancy, and is used by `bookBooking`/`cancelBooking` (bookings service), `bookCorporateBooking`/`cancelCorporateBooking` (corporate-bookings service), and `checkRescheduleEligibility` (reschedules service — previously used the personal-only `countBookedForClass`, now fixed). The `classes.list` router query and `admin.classUtilisation` were also updated to sum personal + corporate counts inline (same status filter as their respective pre-existing personal-only queries: `'booked'` for `classes.list`, `'booked','attended'` for `classUtilisation`) rather than going through the repository function, since both are bulk queries across many classes in a single SQL statement rather than a per-class lookup.
- **`reschedules` service's inert membership lookup.** `checkRescheduleEligibility` fetches the original booking's membership (`findMembershipById`) but never uses the result — this was true in the original inline code too (the comment said "check for unlimited credits" but nothing downstream read the value). Preserved as dead-but-harmless code rather than silently dropped, per principle 10 above.
- **`trainers.ts` hand-rolls its own role check.** All four trainer-only procedures repeat `if (ctx.user.role !== "trainer") throw TRPCError({code: "FORBIDDEN", ...})` inline instead of using a `trainerProcedure` middleware (the project already has `staffProcedure`/`adminProcedure` for this pattern in `trpc.ts`). An authorization-plumbing cleanup opportunity, not a data/business-logic layering concern — not touched by architectural refactors so far.
- **README's "Layout" section is stale**, describing a pre-Phase-1 directory structure (`components/`, `lib/`, `hooks/`) that no longer exists. Not corrected as part of this document (out of scope — this file only documents `docs/ARCHITECTURE.md` itself, not `README.md`).

---

## Current refactoring progress

**Completed:**
- Phase 0 baseline/documentation
- Phase 1 architecture restructuring (the `app/db/features/server/shared` layout)
- Format utility relocation to `shared/utils/format.ts`
- Password utility relocation to `server/services/password.ts`
- Bookings feature: service + repository extraction (mutations and reads)
- Reschedules feature: service + repository extraction (deduplicated `reschedule`/`validateReschedule`)
- Corporate-bookings feature: service + repository extraction (`book`/`cancel`/`markAttended` → service; `mine`/`rosterFor` → repository)

**Current:** Phase-2 branch, backend layering/refactoring work. All three domains above are implemented in the working tree (see "Current git context" for what's actually committed vs. still pending).

**Not yet started** — no repository or service exists yet for any of these routers. An earlier read-only analysis (Phase 3) classified the remaining candidates by priority; nothing below has been implemented:
- `classes.ts` — mostly pure reads/CRUD (→ repository); `cancel` cascades to cancelling bookings for the class, a small cross-entity workflow (borderline repository-only vs. service).
- `members.ts`, `notifications.ts`, `payments.ts` (`mine`/`all`/`markPaid`), `trainers.ts`, `admin.ts`, `admin-companies.ts` — assessed as pure reads/simple CRUD with no meaningful business workflow; router→repository is likely sufficient, and several one-off admin reporting queries may not be worth a repository at all (single consumer, no reuse).
- `plans.ts` `subscribe` — a real multi-table workflow (validate plan active, compute membership dates, create `memberships` + `payments` rows) — the strongest remaining service candidate after corporate-bookings.
- `payments.ts` `refund` / `classes.ts` `cancel` — small cross-entity workflows (2 branches, 2 writes each); defensible as either B or C, low priority.
- `auth.ts` `login`/`register` — real business rules (credential verification, duplicate-email check) entangled with Next.js `cookies()` side effects that can't cleanly live in a repository or plain service function without threading request context through. Flagged as needing a different approach, not a straight copy of the bookings pattern. Security-sensitive; lowest urgency for opportunistic change.

This backlog is an analysis, not an implementation — verify against the actual source tree before assuming any of it has been done.

---

## Git / commit rules

- Work in small logical changes.
- Review the diff before committing.
- Do not mix unrelated changes (formatting with architecture, bug fixes with structural refactors).
- Do not commit automatically after AI modifications — commits happen only when explicitly instructed.
- Validate the changed scope (`tsc --noEmit`, `pnpm build`, diff review) before committing.
- Merge Phase-2 into main only after the Phase-2 milestone is complete and reviewed.

---

## AI pair-programming rules

Future AI sessions working on this repository must:

1. Read this document first.
2. Inspect the actual current source before making assumptions — this document can drift from the code.
3. Follow the existing architecture decisions (the reference architecture above) rather than introducing a new pattern.
4. Make the smallest change necessary.
5. Avoid over-engineering (see principle 3/8 above).
6. Never silently change behavior — if something looks wrong, document it under "Known issues," don't fix it inline.
7. Report what changed.
8. Report what was intentionally NOT changed.
9. Identify suspicious existing behavior separately from the requested change.
10. Do not commit unless explicitly instructed.

---

## Document purpose and maintenance

This file is persistent architecture memory, not a task log. It should be updated when an architectural decision is actually made (a new feature extracted, a new principle established, a known issue discovered or resolved) — not for every command run or every temporary debugging detour. Keep it concise, factual, and grounded in the actual repository state at time of writing.
