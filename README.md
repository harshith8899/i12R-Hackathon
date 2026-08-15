## Hackathon Fixes & Improvements

This project was provided as an existing fitness studio application
with multiple broken and incomplete user journeys. I analyzed the
existing implementation, identified the root causes, and applied
minimal targeted fixes without redesigning the application's
architecture or introducing unnecessary features.

### Key Fixes

#### Schedule Stability
- Fixed an infinite request loop on the schedule page caused by an
  unstable `classes.list` query input.
- Stabilized the timestamp used by the React Query input.
- Schedule now loads normally without repeated API requests.

#### Rescheduling
- Fixed the same unstable query-key issue in the reschedule modal.
- Members can now select available alternative classes and complete
  the reschedule flow successfully.

#### Kiosk & Attendance
- Fixed member lookup so the kiosk only searches member accounts.
- Staff can search for a member and check them into an upcoming class.
- Attendance is reflected across the kiosk, trainer roster, admin
  reporting, and member class history.

#### Admin Class Utilisation
- Fixed the admin utilisation widget to use upcoming classes.
- Corrected the booking-count query so utilisation percentages are
  calculated from the correct class.
- Admin dashboard now displays meaningful utilisation data.

#### Authentication & Security
- Prevented `passwordHash` from being returned by `auth.me`.
- Enabled secure session cookies.
- Added the member registration flow while preserving the existing
  authentication architecture.

#### Membership & Booking
- Improved subscription success feedback.
- Added navigation from successful subscription to membership and
  schedule views.
- Booking success feedback was added.
- Member credit information is refreshed after booking.

#### Waitlist
- Verified the complete waitlist lifecycle:
  - Full class → Join waitlist
  - No credit deduction while waitlisted
  - Seat becomes available
  - Automatic promotion to booked
  - Credits deducted only after promotion
  - Member can leave the waitlist

#### Member Experience
- Added role-specific dashboard messaging.
- Added member class attendance history.
- Extended seeded class availability so the schedule remains populated
  for a longer period.

### Validation

The major user journeys were tested end-to-end:

- Member registration and login
- Membership subscription
- Class scheduling
- Booking
- Rescheduling
- Cancellation
- Waitlist and promotion
- Kiosk check-in
- Attendance history
- Trainer roster
- Admin dashboard
- Corporate management
- Notifications
- Role-based access control

TypeScript compilation and Git diff validation also passed.

### Known Product Gaps

The following backend capabilities exist but do not currently have
dedicated admin UI:

- Admin member management
- Admin class management
- Admin payment actions

These were intentionally not introduced as new features because the
hackathon task focused on fixing the existing application rather than
expanding its product scope.
