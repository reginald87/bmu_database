# Bayelsa Medical University Registry System

## Project brief for OpenCode

Build a secure, maintainable university records management system for Bayelsa Medical University (BMU), serving:

- **Imgbi Road Campus** — Yenagoa, Bayelsa State
- **Sampou Campus** — Kolokuma/Opokuma Local Government Area, Bayelsa State

The system will manage student records, academic and non-academic staff records, and scanned documents attached to a person's record. Use the approved visual prototype as the starting point. The UI should feel academic, calm, minimal, accessible, and dependable, with BMU's crest and plum, lime, white, and navy accents.

This repository currently contains a local fictional-data demo with persistent record workflows, sign-in, initial server-enforced role/campus permissions, invite-based account activation, private document storage, upload malware scanning, notifications, and an initial relational schema proposal. Treat the demo as an implementation starting point, not as a production-ready records system. Do not import or create real BMU personal data until the security foundation has been reviewed and the system is deployed appropriately.

## Instructions for the coding agent

1. Read this README and inspect the existing application before changing files.
2. Work in small, complete increments. Explain the intended change briefly, implement it, and summarize changed files and any trade-offs.
3. Keep student and staff records distinct while sharing common identity and campus information where appropriate.
4. Preserve the two-campus model. Campus selection and campus scope must be clear on directory, profile, document, review, and reporting screens.
5. Keep the interface responsive and keyboard accessible. Use clear labels, useful empty states, confirmation for consequential changes, and readable validation errors.
6. Never add real student, staff, health, identity, contact, or employment information to fixtures, screenshots, logs, documentation, commits, or prompts. Use obviously fictional test fixtures only.
7. Never put uploaded documents in a public web directory. Document access must go through authenticated, authorized server routes and be audited.
8. Do not claim a security control is implemented unless it is implemented, configured, and verified. A visual lock icon or access label is not a control.
9. Keep secrets out of source control. Use environment variables and provide a safe `.env.example` containing placeholders only.
10. Before a database migration or destructive data operation, explain its impact and produce a reviewable migration. Do not run it against a real database without explicit approval.
11. Do not install unnecessary dependencies. Explain new dependencies and use maintained, well-supported packages.
12. Verify each completed increment with appropriate checks. Report checks that could not run and why. Do not represent a passing demo check as a production security review.

## Current repository

- `src/app/` — Next.js App Router pages for the registry workspace, search, settings, and sign-in
- `src/components/` — shared shell, dialogs, tables, bulk import, person wizard, and UI primitives
- `src/lib/` — API routes, Prisma access, session/auth, validation, mailer, and shared types
- `public/crest.png` — BMU crest supplied for the prototype
- `prisma/schema.prisma` — SQLite schema used by the running app; seed with `npm run db:seed`
- `design-reference/bmu-rms-prototype.html` — original clickable visual concept
- `storage/` — private document bytes, kept outside the public web directory and ignored by Git
- `quarantine/` — temporary upload holding area used before scanning, ignored by Git

Start the app from the project folder with:

```powershell
npm install
npx prisma db push
npm run db:seed
npm run dev
```

Then open <http://localhost:3000>. The seeded demo uses fictional sample data in SQLite. On first launch without a seeded account, a one-time bootstrap token is printed to the server terminal; use it to create the first system administrator and choose a strong unique password. Do not share or commit the token.

Administrators can invite accounts; the one-time activation token is shown once and expires after 48 hours. Roles and campus scope are enforced by the server. Passwords use Node scrypt; cookie sessions expire after eight hours and mutations require same-origin and CSRF checks. `storage/` is private and outside the public web directory; uploads are checked for file signatures and size, quarantined, scanned, and only then moved to storage. On Windows the app invokes Microsoft Defender; on other systems configure `BMU_CLAMSCAN_PATH` to a ClamAV scanner. A scan error rejects the upload.

Optional Gmail SMTP invitations use `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `MAIL_FROM_NAME`, and `APP_URL`; see `.env.example`. When SMTP is not configured, invitation links are still returned so an administrator can share them manually. This local demo is not production-ready: it lacks MFA, durable production database/session storage, managed secrets, operational monitoring, policy decisions, and independent security review. Use fictional records and files only.

## Record validation and bulk import

Student university IDs accept `UG/00/0000` or a 14-character JAMB registration number (`YYYY` + 8 digits + 2 alphanumeric characters). Staff IDs accept `BMU/PFN/REG/000` or `BMU/PFN/REG/APPT/000`. Optional BIMS numbers use `BIMS` followed by 11 alphanumeric characters. IDs and BIMS values are unique across the demo records. Bulk import uses separate student and staff CSV templates, validates up to 500 rows/1 MB, shows row errors, and imports only after explicit confirmation; any invalid or duplicate row rejects the batch.

## Product scope

### People and records

- Student directory and profile, including university ID, programme, faculty/department, admission session, level, campus, status, and record completeness.
- Staff directory and profile, with an explicit academic/non-academic category, department, job title, appointment details, campus, and employment status.
- A shared person identity record, with unique university identifiers and duplicate prevention.
- Search by name and approved identifiers, with campus and status filters.
- Review queue for records and document submissions that need verification.
- Record history and audit trail for access and changes.

### Document repository

- Support scanned PDF, Word documents, and images, subject to an approved allowlist, size limit, and malware scanning.
- Attach each file to the correct person and document category.
- Store metadata such as original filename, file type, size, checksum, uploader, upload time, classification, review state, and retention date.
- Store document bytes in private object/file storage, separate from public application assets. Store only metadata and a non-public storage key in the database.
- Serve previews and downloads only after server-side authentication and authorization. Audit upload, view, download, replacement, and removal events.
- Define retention, legal hold, backup, restore, and deletion processes with BMU before implementation.

### Roles and access

Design role-based authorization for at least:

- System administrator
- Registry officer
- Faculty/department records officer
- Human resources officer
- Read-only auditor

Apply least privilege, campus and record scope where appropriate, and separate HR-restricted documents from general student/registry access. The exact role matrix must be agreed with BMU stakeholders. Enforce access on the server for every protected operation; hiding buttons in the browser is not authorization.

### Current demo role matrix

| Role | Implemented access |
| --- | --- |
| System administrator | Read/write students and staff, student/staff documents, reviews, audit, user accounts; campus scope applies. |
| Registry officer | Read/write students, student documents, student reviews, audit; campus scope applies. |
| Faculty officer | Read students and student documents in assigned campuses; read-only. |
| HR officer | Read/write staff, staff documents, staff reviews, audit; campus scope applies. |
| Auditor | Read student/staff directory fields and audit in assigned campuses; no document download or writes. |

These are demo defaults. Confirm them with BMU before production. Browser controls are for usability; API authorization is enforced server-side.
## Data and security principles

- Treat student and staff records as sensitive personal information. Minimize fields and collect only those BMU has approved for a defined purpose.
- Confirm applicable Nigerian data protection, university policy, retention, consent/notice, and records-management requirements with BMU's responsible officers before real-data onboarding.
- Use a supported relational database, managed credentials, encrypted transport, encrypted backups, private document storage, and tested recovery procedures.
- Use secure authentication, multi-factor authentication where available, session expiration, CSRF protection for cookie sessions, rate limits, and safe password-reset flows if local credentials are used.
- Validate and authorize all input server-side. Use parameterized database operations, output encoding, secure headers, and safe error messages.
- For files, verify content by inspecting file signatures as well as declared MIME type, use generated storage names, scan uploads, enforce size limits, prevent path traversal, and never execute uploaded content.
- Avoid putting sensitive record data in URLs, browser storage, analytics, application logs, or error traces.
- Make audit events append-only to ordinary application users, with actor, action, affected record, time, campus/context, and appropriate request metadata. Avoid copying full sensitive document contents into audit details.
- Use fictional and synthetic data for development and demonstration.

## Suggested implementation phases

### Phase 0 — Confirm requirements and boundaries

Document the role matrix, authoritative student/staff identifiers, campus/department/programme structure, record lifecycle, document categories, required fields, review rules, import sources, retention, expected users, hosting constraints, and backup/recovery expectations. Record unresolved decisions without inventing university policy.

### Phase 1 — Application foundation

Replace the one-file demo server with a maintainable application structure, configuration validation, structured logging that avoids personal data, centralized error handling, database migrations, seed data containing fictional examples, and a local development setup. Keep demo mode clearly separate from production configuration.

### Phase 2 — Persistence and directory workflows

Connect the proposed schema to a supported relational database. Implement create, view, update, and archive/deactivate workflows for student and staff records; validation; search; campus filters; duplicate checks; pagination; review statuses; and audit entries. Add authorization tests before exposing real records.

### Phase 3 — Identity and access controls

Implement the agreed authentication and role matrix. Test both permitted and denied access at the API/server layer. Add administrator account provisioning and recovery procedures without embedding secrets in code.

### Phase 4 — Private document vault

Implement private storage, upload validation and scanning, metadata persistence, authorized preview/download, classifications, review workflow, audit events, retention metadata, and backup/restore. Prove a user without permission cannot list, preview, or fetch a file by guessing its ID or URL.

### Phase 5 — Migration, reports, and operational readiness

Build controlled import tools with dry-run, validation reports, duplicate detection, reconciliation totals, and rollback plan. Add BMU-approved reports, monitoring, backup drills, accessibility review, security review, and deployment/runbooks before onboarding real data.

## Data model direction

`prisma/schema.prisma` is an initial design proposal for `Campus`, shared `Person`, specialized `Student` and `Staff` records, `Document`, and `AuditEvent`. Review it before using it for migrations. In particular, settle the university's identifier rules, history/versioning needs, department/programme reference data, user/role model, audit integrity, document lifecycle, and any required demographic fields with BMU. Avoid storing fields simply because they are easy to add.

## Known gaps and planned improvements

The following items are intentionally not yet implemented in the local demo and should be addressed before production use:

- **Rate limiting** — Only login and activation endpoints have attempt limits. Other API endpoints (people, documents, import) are unbounded.
- **Token-based password reset** — Only "change password with current password" exists. No safe reset flow for forgotten passwords.
- **Pagination** — List endpoints (`/api/students`, `/api/staff`, `/api/documents`, `/api/review`, `/api/audit`) return all rows without page/limit parameters.
- **JAMB ID regex** — Current regex accepts any 12 digits; README specifies `YYYY` + 8 digits + 2 alphanumeric (year-prefixed).
- **Security headers** — No `Content-Security-Policy`, `Strict-Transport-Security`, or `Permissions-Policy` headers.
- **Structured logging** — Logs use `console.error`; may leak personal data. Needs centralized, PII-free logging.
- **Health check endpoint** — No `/api/health` for monitoring.
- **Accessibility** — Dialogs lack focus trapping; some controls lack ARIA labels and visible focus states.
- **Document preview/audit** — Downloads are served, but replacement and removal events need explicit audit coverage.
- **MFA** — Multi-factor authentication is not implemented (acknowledged in README as not production-ready).
- **PostgreSQL/Prisma connection** — The Prisma schema is a planning artifact; the demo uses in-memory JSON persistence.

## First OpenCode task

Start with a code and requirements review. Do not connect real data or add real records. Identify:

1. What currently works in the demo and what remains static or simulated.
2. Any correctness, accessibility, responsive layout, or API issues in the existing screens.
3. A proposed production application architecture and database plan that fits the existing repository and the user's environment.
4. The decisions that BMU must make before schema migration or real-data onboarding.
5. A prioritized first implementation increment with files to change and verification steps.

After presenting the review, implement only safe, reversible foundation improvements that do not require institution-specific policy assumptions. Keep the fictional demo usable while planning the production transition.

## OpenCode and Big Pickle

Use OpenCode with the model identifier `big-pickle` if it is available in the user's configured provider/model list. The model is listed by OpenCode as a stealth model and its availability or underlying model may change. Do not depend on hidden model-specific behavior; this README is the durable project specification. OpenCode model and provider configuration can change, so check the current official documentation rather than hard-coding credentials or relying on a stale setup guide:

- [OpenCode model documentation](https://opencode.ai/docs/models/)
- [OpenCode provider documentation](https://opencode.ai/docs/providers/)
- [OpenCode model catalog](https://opencode.ai/docs/console/models/)

Do not place API keys or authentication tokens in this README, source files, terminal transcripts, or commits.
