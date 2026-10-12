# FUNDICONNECT
## Project Requirements and Technical Specification

**Version:** 1.0
**Project type:** Full-stack service marketplace
**Initial market:** Kenya
**Currency:** KES (Kenyan shillings)
**Frontend:** Next.js, React, JavaScript, Tailwind CSS
**Backend:** Node.js, Express REST API
**Database:** MySQL

---

## 1. Executive Summary

FundiConnect is a digital marketplace that connects customers with skilled service providers. Customers can discover professionals, compare services, request quotations, book appointments, track jobs and review completed work.

Service providers can create profiles, advertise services, manage bookings, submit quotations and monitor completed jobs.

Administrators manage provider verification, categories, accounts, complaints, platform settings and reporting.

The platform will initially target Kenya, with support for Kenyan locations, KES pricing and future M-Pesa integration.

## 2. Problem Statement

Customers often find it difficult to identify reliable service providers, compare prices, confirm availability and monitor the progress of requested work.

Independent service providers may also struggle to reach customers, organize appointments and maintain a professional online presence.

FundiConnect aims to provide a centralized, transparent and accessible service-booking platform.

## 3. Project Objectives

1. Connect customers with relevant service providers.
2. Make service discovery, quotations and bookings straightforward.
3. Help fundis manage appointments and job requests.
4. Support transparent pricing, booking records and reviews.
5. Give administrators tools to oversee platform operations.
6. Establish a secure foundation for payments and future expansion.
7. Provide a responsive, accessible experience across desktop and mobile devices.

## 4. Scope

### 4.1 Included in the MVP

- Account registration, login, logout and password recovery.
- Customer, fundi and administrator roles.
- Provider profiles and verification workflow.
- Service categories, listings, search and filtering.
- Quotations and appointment bookings.
- Booking status tracking and history.
- Customer reviews and complaints.
- In-app and email notifications.
- Administrative dashboards and audit logs.
- Payment status records and manual payment recording.
- MySQL persistence, validation, testing and deployment preparation.

### 4.2 Planned advanced features

- M-Pesa payment processing and verified payment callbacks.
- In-app chat and SMS notifications.
- Interactive maps and distance-based discovery.
- Commission accounting and payout management.
- Advanced dispute and refund management.
- Saved providers, analytics and additional reporting.
- Progressive web app functionality.

## 5. User Roles

### Guest

- Browse public service categories.
- Search public provider profiles.
- View service details and published prices.
- Register or log in.
- Access public help and policy pages.

### Customer

- Manage their own profile.
- Search for services and fundis.
- Submit quotation requests.
- Create and manage bookings.
- Approve or reject quotations.
- View booking history and payment records.
- Leave reviews for eligible completed bookings.
- Report issues and manage notification preferences.

### Fundi / Service Provider

- Maintain a professional profile.
- Submit verification information.
- Manage offered services and pricing.
- Define service areas and availability.
- Receive and respond to job requests.
- Submit quotations.
- Manage accepted jobs and update job progress.
- View completed work and earnings summaries.

### Administrator

- Access administrative dashboards.
- Manage accounts and account status.
- Review provider verification submissions.
- Manage categories and platform content.
- Monitor bookings, complaints and reported content.
- Record moderation and administrative actions.
- Review platform statistics and financial summaries.
- Configure approved platform-wide settings.

## 6. Functional Requirements

### 6.1 Authentication and Accounts

The system shall support registration, login, logout, email verification and password recovery.

Passwords shall be stored using an appropriate password-hashing algorithm, never as plaintext.

Sessions shall use secure cookie settings in production. Protected API endpoints shall validate authentication and authorization.

Account roles shall be assigned and managed securely. Users must not be able to promote themselves to administrator.

### 6.2 Provider Profiles and Verification

Each provider profile shall contain relevant professional information, skills, service areas, experience, contact preferences and profile images.

Providers may submit identity or qualification evidence where required by the verification policy.

Verification shall support pending, approved, rejected and resubmission states.

Providers can submit identity or qualification evidence for review. Sensitive verification documents must be stored outside the public web root and must not be publicly accessible; downloads require server-side provider/admin authorization. Administrators must record decisions and reasons.

### 6.3 Service Catalog

Administrators shall manage service categories such as plumbing, electrical services, cleaning, carpentry, painting, appliance repair, mechanics, masonry, gardening and moving.

Providers shall create services with descriptions, pricing models, estimated duration and availability.

Services may use fixed pricing, starting prices or quotation-based pricing. The customer must be able to distinguish an estimate from a confirmed final price.

### 6.4 Search and Discovery

Customers shall search by keyword, service category and location.

The interface shall support filtering by price, rating, verification status and availability where applicable.

Search results shall support pagination, sorting and useful empty states.

Only active and appropriately approved public listings shall be displayed as verified provider recommendations.

### 6.5 Quotations

Customers may request a quotation by describing the job and providing relevant photos or other permitted information.

Providers may submit an estimated price, scope of work, exclusions, validity period and proposed schedule.

Customers may approve or reject a quotation.

Approval must record the accepted quotation version and agreed terms. Material changes require a new quotation or explicit acceptance of revised terms.

### 6.6 Booking Management

A booking shall link a customer, provider and service. It shall include a unique reference, requested appointment time, location, job description, agreed price information and status history.

The system shall validate provider availability and prevent conflicting appointments where required.

Users may view bookings they are authorized to access.

Rescheduling and cancellation shall record timestamps, reasons and the actor responsible.

### 6.7 Job Lifecycle

The normal workflow is:

Requested → Quoted (when required) → Confirmed → Accepted → In Progress → Completed → Closed.

Alternative transitions include rejection, cancellation, expiry and dispute.

Booking requests not accepted by the provider shall expire 48 hours after creation. Expiry shall be persisted in booking status history, notify both participants, and prevent subsequent acceptance, rescheduling or cancellation as an active request. Advanced dispute resolution remains outside the MVP.

The backend shall validate every status transition. A client must not be allowed to mark a job completed or paid merely by changing a frontend value.

### 6.8 Payments

The MVP shall record payment method, amount, status, currency, transaction reference and timestamps.

Possible payment methods include cash, mobile money, card and bank transfer, subject to the supported operational workflow.

Payment states shall distinguish pending, successful, failed, cancelled and refunded transactions as appropriate.

A successful payment must be based on a trusted payment-provider confirmation or an authorized, auditable manual action.

M-Pesa integration shall include callback verification, duplicate-event protection, reconciliation and secure handling of credentials.

### 6.9 Reviews and Complaints

Only customers with eligible completed bookings shall be able to submit reviews.

Reviews shall contain a rating and optional written feedback.

The system shall support reporting inappropriate reviews or provider conduct.

Administrators shall be able to hide or restore reviews only with a recorded reason. Moderation shall preserve the original review and audit every visibility change. Hidden reviews shall not appear in public listings or provider rating averages. Legitimate negative reviews shall not automatically be removed simply because a provider disagrees.

### 6.10 Notifications

The platform shall support notifications for registration, verification decisions, new job requests, quotation updates, booking confirmations, schedule changes, cancellations and job completion.

The MVP shall provide in-app notifications and selected email notifications.

Users shall be able to enable or disable in-app and marketplace email notifications independently. Both channels shall be enabled by default; account verification and password recovery emails are not controlled by these preferences.

Notification delivery failures shall not silently corrupt the underlying booking or payment record.

### 6.11 Administration and Reporting

Administrators shall be able to monitor user registrations, provider verification, booking volume, cancellations, complaints and recorded payment activity.

Reports shall clearly distinguish gross booking value, collected payments, refunds and platform revenue.

A booking value must not automatically be treated as money received or commission earned.

Sensitive administrative actions shall be recorded in an audit trail.

## 7. Security Requirements

- Passwords are stored using a modern password-hashing algorithm; session cookies are HTTP-only and secure in production.
- Protected API operations validate authentication, role and record ownership.
- Authentication and sensitive account actions are rate limited. Other write requests have a bounded per-IP rate.
- The API sends standard security headers and uses an explicit CORS/origin policy.
- SQL queries are parameterized, and uploaded files are checked against size, declared type and content signatures.
- Production deployments must use HTTPS and store secrets outside source control.
- Rate limiting currently uses an in-process store. Deployments with multiple API instances must configure a shared store and trust only known reverse proxies.

## 8. Business Rules

1. Every business record must be associated with the appropriate customer, provider or platform scope.
2. Every protected operation must verify the requesting user's identity, role and ownership rights.
3. A provider cannot accept a booking if it conflicts with confirmed availability.
4. A customer cannot review an unrelated booking.
5. Only authorized users may change booking status.
6. Quoted and agreed prices must be retained for historical accuracy.
7. Payment status changes must be traceable to a trusted provider event or authorized action.
8. Duplicate payment callbacks must not create duplicate successful payments.
9. Cancellation and refund rules must be applied consistently and transparently.
10. Financial and booking histories must not be silently overwritten.
11. Provider verification must not be inferred merely from account registration.
12. Platform commission rules must be configurable and documented before charging providers.

## 9. Main Database Entities

- users
- provider_profiles
- provider_verification_documents
- service_categories
- services
- provider_service_areas
- provider_availability (multiple non-overlapping windows per weekday)
- availability_exceptions
- quotation_requests
- quotation_request_photos
- quotations
- bookings
- booking_status_history
- payments
- refunds
- reviews
- complaints
- notifications
- notification_preferences
- conversations and messages (advanced)
- platform_settings
- audit_logs

Each entity shall use appropriate primary keys, foreign keys, indexes, timestamps and validation constraints.

Financial amounts shall use fixed-precision decimal types. Database transactions shall protect multi-step operations such as confirming a booking or recording a payment.

## 10. System Architecture

### Frontend

Next.js and React shall provide public pages, authenticated dashboards, forms, reusable components and responsive navigation.

Tailwind CSS shall be used for consistent styling.

The frontend shall call the Express API for business operations. Secrets and database credentials must never be included in browser-delivered code.

### Backend

Node.js and Express shall provide REST endpoints, authentication middleware, role authorization, request validation, business logic and centralized error handling.

The backend shall separate routes, controllers, services, database access and validators.

### Database

MySQL shall store users, services, bookings, payment records and other persistent application data.

The database shall use indexes and transactions appropriate to the workload.

### File Storage

Profile images, verification evidence and permitted job attachments shall use validated file uploads and controlled storage. Verification evidence and quotation-request job photos shall be private and downloadable only by their owner/participants or authorized administrators. Public profile images shall be uploaded by their owner and served through a controlled image endpoint.

Private verification documents must be stored privately and accessed through authorized operations.

### External Services

Potential integrations include email delivery, M-Pesa Daraja, mapping services and optional SMS providers.

Integrations shall be implemented behind service modules to make testing and future replacement easier.

## 11. API Design

The API shall use a versioned prefix such as `/api/v1`.

Core route groups:

- `/auth` — registration, login, logout and session.
- `/users` — current-user profile and permitted profile updates.
- `/providers` — public discovery and provider management.
- `/services` — service listings and categories.
- `/bookings` — request, update and status handling.
- `/payments` — payment record lifecycle.
- `/reviews` — ratings and review submission.
- `/admin` — restricted operational, review-moderation and reporting routes.

The API shall enforce authentication, role checks, validation and error handling consistently.

Public service discovery shall provide:

- `GET /api/v1/services/categories` — active service categories.
- `GET /api/v1/services` — active listings from approved, verified providers, with pagination and optional `q`, `category`, `town`, `area`, `minPrice`, `maxPrice`, and `sort` (`newest`, `price_asc`, or `price_desc`) query parameters.

Search results shall not expose inactive services or unapproved provider profiles.

The fundi dashboard shall show profile verification, work counts, recent jobs, service listings and service areas. Fundis may update their professional profile and owned service listings, and move owned bookings through the allowed job lifecycle. Administrative dashboard access shall be restricted to administrators and include platform statistics, provider verification review, account visibility and audit history. Administrative verification decisions shall be recorded in the audit log; rejected verification requires a reason. Administrator accounts shall be provisioned outside public registration.

## 12. Initial Delivery Plan

The project should be implemented in phased delivery:

1. Foundation and onboarding
2. Provider and customer profile systems
3. Service catalog and discovery
4. Quotations and booking system
5. Payment records and compliance
6. Reviews, complaints and notifications
7. Admin dashboards and reporting
8. Advanced integrations and product optimization

## 13. Success Criteria

The MVP is successful when:

- users can register and log in securely;
- trusted providers can create profiles and verification records;
- customers can discover service categories and providers;
- quotations and bookings can be managed reliably;
- admin users can review and moderate key platform activity;
- booking and payment records remain auditable and secure.
