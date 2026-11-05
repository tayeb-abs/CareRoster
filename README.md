# CareRoster

CareRoster is a responsive nurse scheduling management system built with Next.js App Router, TypeScript, Tailwind CSS, Prisma, PostgreSQL, and Auth.js.

## Requirements

- Node.js 20.9 or later
- PostgreSQL 16 (local or hosted)
- `AUTH_SECRET`: generate a unique secret with `openssl rand -base64 32`

## Option A: Local PostgreSQL

Install or provision PostgreSQL 16 and provide a connection URL for an empty database using a role that can create tables and indexes. Copy `.env.example` to `.env`, set `DATABASE_URL` to that URL, and set `AUTH_SECRET`. The migration and seed commands create all application tables and sample data; no manual SQL setup is required.

## Option B: Docker PostgreSQL

Copy `.env.example` to `.env`. The example `DATABASE_URL` matches the local development database in `docker-compose.yml`. Replace `AUTH_SECRET` with the output from `openssl rand -base64 32`, then start PostgreSQL:

```bash
docker compose up -d
```

## Install, migrate, seed, and run

```bash
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## English and Arabic

Use the language switch in the top bar to switch the interface between English and Arabic; the selection is saved in this browser, and Arabic mode uses right-to-left layout. Schedule and reports exports default to the selected interface language. Export controls offer PDF/print preview, Excel XLSX, Word DOC, and PowerPoint PPTX, plus a manual English or Arabic override and portrait or landscape page orientation. Weekly schedule exports use the official Saturday-to-Friday clinic roster matrix; the interactive weekly editor and monthly FullCalendar remain separate scheduling views.

Administrators can configure both clinic names, upload a PNG/JPEG logo, and set address, phone, department, and Head Nurse name at **Clinic profile**. Profile details are stored in PostgreSQL and included in generated PDF, Word, Excel, and PowerPoint documents. The design uses an Evercare-inspired medical-blue palette; the provided application does not include an attached logo image, so upload the approved clinic logo in the profile settings.

The seed creates the `ADMIN` and `HEAD_NURSE` roles, six sample nurses, and a generated schedule for the current month with sick-leave and emergency-leave examples. Demo accounts:

| Role | Email | Username | Password |
|---|---|---|---|
| Admin | `admin@clinic.local` | `admin` | `admin` |
| Head Nurse | `headnurse@clinic.local` | `headnurse` | `headnurse` |

These intentionally weak credentials are for local testing only. The seed command refuses to run when `NODE_ENV=production`. Change credentials before exposing a development instance to a network.

## Database scripts

- `npm run db:generate` — generate Prisma Client
- `npm run db:migrate` — apply committed migrations with `prisma migrate deploy`
- `npm run db:push` — development-only schema synchronization; not used for production setup
- `npm run db:seed` — add development roles, accounts, nurses, and current-month schedule
- `npm run db:studio` — open Prisma Studio
- `npm run db:reset` — **destructive** local reset; drops the schema, reapplies migrations, and runs the seed

Create future migrations in development with `npx prisma migrate dev --name describe_change`, commit the resulting `prisma/migrations` files, then use `npm run db:migrate` to deploy them.

## PostgreSQL models

- `Role` has a one-to-many relationship with `User`.
- `User` has a required role, self-referential creator/updater relationships, and creator relationships to nurses, schedules, exceptions, overrides, and Friday history.
- `Nurse` owns schedule entries, exceptions, overrides, audit references, and Friday-assignment history.
- `Nurse.level` is a `NurseLevel` enum (`SENIOR` or `REGULAR`) defaulting to `REGULAR`; adding a level requires only extending this enum and the level-specific rule.
- `MonthlySchedule` is unique by year/month and owns its schedule, exception, override, audit, and Friday-history records.
- `ClinicProfile` stores the clinic's English/Arabic names, logo, contact information, department, Head Nurse, and the admin account that last updated the profile.
- `Schedule` links one nurse and one monthly schedule to a date. A unique nurse/date constraint prevents duplicate daily assignments. Its exceptions and overrides cascade on schedule deletion; nurses are restricted from hard deletion so history is retained.
- Friday exception approvals and explicitly approved Senior/Senior manual overrides are stored on schedule rows and audited against their Friday date.
- `ScheduleException` is unique per schedule and records leave type, date, and creator.
- `ManualOverride` records each manual change and the prior/new shift, reason, note, author, and whether that override is active.
- `ScheduleAuditLog` records generation and manual-override changes; deleting related schedule records preserves the log with nullable foreign keys.
- `FridayAssignmentHistory` records assignments (including non-assignments) per nurse/date and supports rotation fairness.

All operational entities include creation/update timestamps. User-entered entities have nullable `createdById`/`updatedById` references where applicable, with `SET NULL` on user deletion; child schedule data cascades from its monthly schedule. Reporting, month/year, nurse/date, shift/date, and audit-time indexes are part of the initial migration.

## Authentication and mobile API

Auth.js Credentials uses PostgreSQL-backed username/email and scrypt password hashes with JWT sessions. API authorization loads the active user's role from PostgreSQL. The native-client endpoint `POST /api/mobile/auth/login` returns an eight-hour bearer token; send it as `Authorization: Bearer <accessToken>`. Database credentials remain server-side.

## Scheduling rules

Schedules cover Saturday–Friday weeks, including adjacent-month dates. Each nurse is assigned five workdays and two non-consecutive days off, Friday duty rotates fairly with exactly two nurses on duty, and Saturday remains a workday unless a saved override changes it. The schedule page displays one Saturday-starting week at a time. Manual overrides and leave exceptions survive regeneration; rule conflicts are surfaced for confirmation.

`SeniorFridayRule` limits Friday coverage to at most one Senior Nurse whenever a Regular Nurse is available, and the generator prefers a Regular Nurse for the second Friday slot. If exactly two nurses are available and both are Senior, both assignments are marked `Exception Approved`, recorded as a high-priority schedule audit event, and shown on the dashboard, reports, and exports. A manually requested Senior/Senior pairing requires explicit confirmation and is audit-logged separately.

## Validation

```bash
npm run lint
npm run typecheck
npm test
npm run build
```
