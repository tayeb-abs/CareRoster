# CareRoster

CareRoster is a responsive nurse scheduling management system built with Next.js App Router, TypeScript, Tailwind CSS, Prisma, PostgreSQL, and Auth.js.

## Requirements

- Node.js 20.9 or later
- PostgreSQL 16 (local or hosted)
- `AUTH_SECRET`: generate a unique secret with `openssl rand -base64 32`

## Option A: Local PostgreSQL

Install or provision PostgreSQL 16 and provide a connection URL for an empty database using a role that can create tables and indexes. Copy `.env.example` to `.env`, set `DATABASE_URL` to that URL, and set `AUTH_SECRET`. The migration and seed commands create the application tables, roles, and login accounts without demo nurses or schedules; no manual SQL setup is required.

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

Use the language switch in the top bar to switch the interface between English and Arabic; the selection is saved in this browser, and Arabic mode uses right-to-left layout. Schedule and reports exports default to the selected interface language. Export controls offer PDF/print preview, Excel XLSX, Word DOC, and PowerPoint PPTX, plus a manual English or Arabic override and portrait or landscape page orientation. Weekly schedule exports use the official Saturday-to-Friday clinic roster matrix, and monthly schedule exports include the selected month and its visible nurse/cell filters. Monthly and weekly schedules share the same editable nurse-by-day roster.

Use Move Up/Move Down on **Nurses** to set the saved team order. That order is used in weekly and monthly schedules and schedule exports; it is not sorted alphabetically. Schedule edits remain saved without a persistent edit highlight. Schedule PDF/print exports include the clinic header, generated-by/time details, repeating table headings, and page numbers.

Administrators can configure both clinic names, upload a PNG/JPEG logo, and set address, phone, department, and Head Nurse name at **Clinic profile**. Profile details are stored in PostgreSQL and included in generated PDF, Word, Excel, and PowerPoint documents. The design uses an Evercare-inspired medical-blue palette; the provided application does not include an attached logo image, so upload the approved clinic logo in the profile settings.

Administrators create and manage all shift templates at **Shift management**. Each template has a name, start time, end time, optional color, and active state; one active template can be selected as the default. Times are entered by the administrator, including overnight shifts. Generation assigns the selected/default template to generated workdays. Changing a shift on an existing working day updates only that nurse/date assignment; it does not regenerate the schedule. Schedule rows retain a snapshot of the assigned shift name, times, color, and hours, so later template edits do not rewrite historical rosters. The assignment model supports multiple shift rows per day for future split-shift workflows.

The seed creates the `ADMIN` and `HEAD_NURSE` roles and the two login accounts below. It does not create nurses or schedules, so you can enter your clinic's actual data:

| Role | Email | Username | Password |
|---|---|---|---|
| Admin | `admin@clinic.local` | `admin` | `admin` |
| Head Nurse | `headnurse@clinic.local` | `headnurse` | `headnurse` |

These intentionally weak credentials are for local testing only. The seed command refuses to run when `NODE_ENV=production`. Change credentials before exposing a development instance to a network.

## Database scripts

- `npm run db:generate` — generate Prisma Client
- `npm run db:migrate` — apply committed migrations with `prisma migrate deploy`
- `npm run db:push` — development-only schema synchronization; not used for production setup
- `npm run db:seed` — add development roles and login accounts
- `npm run db:studio` — open Prisma Studio
- `npm run db:reset` — **destructive** local reset; drops the schema, reapplies migrations, and runs the seed

Create future migrations in development with `npx prisma migrate dev --name describe_change`, commit the resulting `prisma/migrations` files, then use `npm run db:migrate` to deploy them.

## PostgreSQL models

- `Role` has a one-to-many relationship with `User`.
- `User` has a required role, self-referential creator/updater relationships, and creator relationships to nurses, schedules, exceptions, overrides, and Friday history.
- `Nurse` owns schedule entries, exceptions, overrides, audit references, and Friday-assignment history; its persisted `sortOrder` controls roster display and export order.
- `Nurse.level` is a `NurseLevel` enum (`SENIOR` or `REGULAR`) defaulting to `REGULAR`; adding a level requires only extending this enum and the level-specific rule.
- `MonthlySchedule` is unique by year/month and owns its schedule, exception, override, audit, and Friday-history records.
- `ClinicProfile` stores the clinic's English/Arabic names, logo, contact information, department, Head Nurse, and the admin account that last updated the profile.
- `Schedule` links one nurse and one monthly schedule to a date. A unique nurse/date constraint prevents duplicate daily assignments. Its exceptions and overrides cascade on schedule deletion; nurses are restricted from hard deletion so history is retained.
- `ShiftTemplate` stores administrator-defined names, times, colors, active status, and the optional default template. A partial unique index allows at most one default, and database checks validate time and color formats.
- `ScheduleShift` stores one or more immutable shift snapshots per working assignment, including actual hours. Template deactivation preserves past assignments; schedule deletion cascades to its shift snapshots.
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

Workload hours in the roster, dashboard, reports, and exports are calculated from each assigned shift's actual start/end times; an end time at or before the start time is treated as an overnight shift ending the next day. Existing workdays without a stored shift are shown as **Shift not assigned** until the administrator or a schedule regeneration assigns a template—no shift hours are invented.

## Validation

```bash
npm run lint
npm run typecheck
npm test
npm run build
```
