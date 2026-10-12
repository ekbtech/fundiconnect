# FundiConnect

FundiConnect is a service marketplace for Kenya that connects customers with skilled providers such as plumbers, electricians, cleaners, carpenters, mechanics, and other tradespeople.

## Tech stack

- Frontend: Next.js, React, Tailwind CSS
- Backend: Node.js, Express REST API
- Database: MySQL
- Package management: npm workspaces

## Project structure

- `apps/web` — Next.js frontend
- `apps/api` — Express backend API
- `db` — database schema and seed scripts
- `docs` — project documentation
- `packages/shared` — shared code and constants

## Getting started

1. Install dependencies
   ```bash
   npm install
   ```
2. Copy environment variables
   ```bash
   copy .env.example .env
   ```
3. Start the app in development mode
   ```bash
   npm run dev
   ```
4. Open the app in your browser:
   - Frontend: http://localhost:3000
   - API: http://localhost:5000/api/v1/health

   The API requires MySQL. Create the `fundiconnect` database and run `db/schema.sql`, then set the `DB_*` variables in `.env`. For same-host LAN access, leave `NEXT_PUBLIC_API_URL` empty: the browser derives the API hostname from the address used to open the frontend and uses port 5000. The API allows browser origins on its own hostname across ports; set `WEB_ORIGIN` to the exact frontend origin when the frontend and API use different hostnames. Production cookies are marked `Secure`.

   Run `npm run db:migrate --workspace apps/api` after configuring the database to apply additive, idempotent MVP migrations. Run `db/seed.sql` after the schema and migrations to add the initial service categories.
   The API applies standard security headers, limits failed login attempts to 10 per IP per 15 minutes, limits account verification/password actions to 5 requests per IP per 15 minutes, and limits other write requests to 120 per IP per 15 minutes. The current limiter uses an in-process store suitable for a single API instance; multi-instance deployments must configure a shared rate-limit store. If deployed behind a reverse proxy, configure Express `trust proxy` only for the known proxy hops so client IP limits cannot be spoofed.
   Verification, profile and quotation photos are saved outside the public web root under `apps/api/private-uploads/{verification,profile,quotation}` by default. Set `PRIVATE_UPLOAD_DIR` to a durable private volume path outside the source repository for deployments; protect and back up that volume with the database, and do not expose it through a static-file server.
   For database backups, configure `MYSQL_BACKUP_LOGIN_PATH` and an absolute `DB_BACKUP_DIR` outside the repository. Create the login path for the same operating-system account that runs the backup task, using a dedicated MySQL account with dump-only privileges (for example, `mysql_config_editor set --login-path=fundiconnect-backup --host=127.0.0.1 --user=fundiconnect-backup --password`). Run `npm run db:backup --workspace=apps/api`; it streams a `mysqldump --single-transaction` dump to a new private file and removes incomplete dumps. Schedule this command using the deployment's task scheduler. This command does not snapshot uploads, encrypt or off-site backups, or enforce retention: pair the database dump with a `PRIVATE_UPLOAD_DIR` snapshot from the same maintenance window, pause writes unless the deployment provides coordinated snapshots, protect/encrypt both copies, set an operator-approved retention period, and test restores to an isolated environment before production use. Restore the matching private-upload volume before reopening traffic; never restore real customer files into a publicly served directory.
   GitHub Actions runs the API syntax checks and tests, the production web build, and a production dependency audit for pushes and pull requests. Production backups and restore drills remain deployment-operator responsibilities.
   Configure `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM`, and `PUBLIC_WEB_URL` to enable email verification, password recovery, and marketplace notice emails for verification decisions, booking requests and changes, quotation requests and offers, reviews, complaints and payment updates. Marketplace email attempts happen after database commits; delivery failures are logged and do not roll back saved business activity. Without SMTP settings, in-app notices continue to work.

   ## Authentication and profile endpoints

   - `POST /api/v1/auth/register` — register a customer or fundi, create a verification token, and establish a session.
   - `POST /api/v1/auth/login` — authenticate and establish a session.
   - `POST /api/v1/auth/logout` — revoke the current session.
   - `GET /api/v1/auth/session` — return the current authenticated user.
   - `POST /api/v1/auth/verify-email` and `POST /api/v1/auth/verification/resend` — verify an address or send a replacement link.
   - `POST /api/v1/auth/password/forgot` and `POST /api/v1/auth/password/reset` — issue and consume single-use, expiring password-reset tokens.
   - `GET /api/v1/users/me` — get the current user's profile.
   - `PATCH /api/v1/users/me` — update the current user's first and/or last name.
   - `POST /api/v1/users/me/profile-photo` — upload a JPEG/PNG profile photo using multipart field `photo`, limited to 5 MB. `GET /api/v1/users/:userId/profile-photo` serves images used on public provider profiles.
   - `GET /api/v1/services/categories` — list active service categories.
   - `GET /api/v1/services` — discover active listings from approved, verified, active fundis. Supports `q`, `category`, `town`, `area`, `minPrice`, `maxPrice`, `minRating`, `availableAt`, `sort` (`newest`, `price_asc`, `price_desc`), `page` and `pageSize` filters.
   - `GET /api/v1/fundi/dashboard` — authenticated fundi summary, jobs, listings, service areas and weekly availability.
   - `PATCH /api/v1/fundi/profile` — update the authenticated fundi's professional profile.
   - `POST /api/v1/fundi/verification-documents` — submit private identity or qualification evidence as multipart field `document`, with `documentType` set to `identity` or `qualification`. PDF, JPEG and PNG files up to 5 MB are accepted after signature checks.
   - `GET /api/v1/fundi/verification-documents/:documentId/file` — download only the authenticated fundi's own verification evidence.
   - `PUT /api/v1/fundi/availability` — replace the fundi's non-overlapping weekly appointment windows (East Africa Time).
   - `/api/v1/fundi/services` and `/api/v1/fundi/service-areas` — manage owned listings and service locations.
   - `PATCH /api/v1/fundi/bookings/:bookingId/status` — accept, decline or advance an owned job through its allowed lifecycle; marking work complete requires a written completion summary.
   - `/api/v1/bookings` — create and list bookings; customers can confirm provider-reported completion with `PATCH /:bookingId/confirm-completion`, schedule/status actions support reasoned rescheduling/cancellation, and `GET /:bookingId/history` returns authorized status and schedule history.
   - `/api/v1/quotations/requests` — customers can create/list quotation requests with up to four private JPEG/PNG job photos; fundis can submit offers; customers accept or decline offers. Acceptance atomically records the selected quotation and creates a linked booking. Attached job photos are downloadable only by the customer, requested provider or an administrator.
   - `POST /api/v1/users/me/profile-photo` and `GET /api/v1/users/:userId/profile-photo` — authenticated users upload their JPEG/PNG profile image; image delivery is public for profile display.
   - `/api/v1/payments` — customers can record pending payment entries and view their own payment history; no payment is processed by these endpoints.
   - `/api/v1/reviews` and `/api/v1/reviews/complaints` — eligible customers can review completed jobs and users can report booking-related complaints.
   - `/api/v1/notifications` — list and mark the authenticated user's in-app notifications as read.
   - `GET /api/v1/notifications/preferences` and `PATCH /api/v1/notifications/preferences` — view or update in-app and marketplace-email notification preferences for customers, fundis and administrators; both channels are enabled by default. Account verification and password recovery emails are unaffected.
   - `GET /api/v1/admin/dashboard` — administrator platform statistics.
   - `GET /api/v1/admin/providers` and `PATCH /api/v1/admin/providers/:providerId/verification` — review provider verifications.
   - `GET /api/v1/admin/verification-documents/:documentId/file` — download verification evidence after server-side administrator authorization.
   - `GET /api/v1/admin/complaints` and `PATCH /api/v1/admin/complaints/:complaintId/status` — review complaints and record auditable moderation decisions.
   - `GET /api/v1/admin/reviews` and `PATCH /api/v1/admin/reviews/:reviewId/moderation` — hide or restore a review with a required reason and an atomic audit record.
   - `GET /api/v1/admin/categories`, `POST /api/v1/admin/categories` and `PATCH /api/v1/admin/categories/:categoryId` — manage the service catalog.
   - `GET /api/v1/admin/reports/financial` — report KES booking value, successful collections and recorded refunds separately; platform revenue remains unconfigured until a commission policy is approved.
   - `GET /api/v1/admin/users` and `GET /api/v1/admin/audit-logs` — review accounts and administrative actions.
   - `PATCH /api/v1/admin/users/:userId/status` — suspend or restore a non-admin account with a required reason; suspending also revokes active sessions.

   The API sets an HTTP-only, `SameSite=Lax` session cookie. Browser requests must use credentials (for example, `fetch(url, { credentials: 'include' })`). Registration does not allow administrator accounts or role promotion.

## Dashboards

- Sign in at `/login`; customers, fundis and administrators are directed to `/customer/dashboard`, `/fundi/dashboard` and `/admin/dashboard`.
- Customers can create bookings and quotation requests, attach job photos, accept valid quotations to create linked appointment bookings, confirm provider-reported job completion, review confirmed work, submit complaints, view payment history and manage notifications/profile details. Quotation offers cannot be accepted after their stated validity deadline. Unaccepted booking requests expire 48 hours after creation, including quotation-originated bookings, and expiration is recorded in booking history.
- Fundis can review and respond to customer quotation requests, manage their professional profile, services, service areas, multiple daily availability windows and job status. Marking a job complete records the provider's summary; the customer must confirm before it is closed and reviewable. Completed job value is not a payout or confirmed-payment balance.
- Customers can attach up to four validated JPEG/PNG job photos when requesting a quotation. Photos are stored privately and only the customer, requested provider and an administrator can download them. Customer and fundi profile photos can be uploaded and are displayed on public provider listings.
- Administrators can review provider verification, suspend/restore customer and fundi accounts, moderate reviews, view account status, monitor recorded platform statistics and inspect audit actions. Verification rejections, account changes and review moderation require a reason and are recorded in the audit log. Hidden reviews remain stored but are excluded from public review lists, rating averages and rating filters.
- Complaints are opened by the reporting user and can only be moved through the moderation lifecycle by an administrator. Each moderation change requires a reason, is audited transactionally and notifies the reporter in-app.
- Payment records start as pending. Manual payment status changes are restricted to administrators, require a reason and are written with the status update to the audit log in one database transaction. The MVP does not process external payments or verify payment-provider callbacks.
- Admin accounts cannot be registered through the public form. To bootstrap one, set `DB_*` and `ADMIN_EMAIL`, `ADMIN_PASSWORD` (12 or more characters), `ADMIN_FIRST_NAME` and `ADMIN_LAST_NAME` in the local environment, then run `npm run admin:create --workspace apps/api`. The command refuses to change the role of an existing account.
- Email verification and password recovery are implemented with hashed, single-use expiring tokens. SMTP must be configured before emails can be delivered. Optional marketplace email notifications are implemented for supported booking, quotation, verification, review, complaint and payment events; delivery has not been verified until deployment SMTP is configured. Provider verification documents, profile photos and quotation-request job photos use private storage and image/document signature validation; quotation photos are accessible only to request participants and administrators. Production deployments must configure durable private storage and add malware scanning. Providers can define multiple non-overlapping availability windows per weekday. A database dump helper and CI checks are included, but backup scheduling, coordinated private-upload snapshots, encryption and restore drills require operator deployment configuration. Production end-to-end/concurrency testing and advanced dispute management remain outstanding. Completion summaries are recorded as text; completion photo evidence is not supported.
- Booking and quotation acceptance checks provider working windows and overlapping reserved appointments under a provider lock. Service discovery supports minimum rating and requested-time availability filters.
- A payment marked refunded is only a recorded status; no money movement is performed. External payment callbacks, commission/payout processing, chat/SMS, maps and PWA support remain planned advanced work.

## MVP scope

- Authentication and role-based access
- Provider profiles and verification workflow
- Service categories and listings
- Search, filtering and discovery
- Quotations and bookings
- Payment status tracking
- Reviews and complaints
- Notifications and admin tools

## Documentation

See `docs/PROJECT_DOCUMENTATION.md` for the full project requirements and technical specification.
