# Talent Forge Membership Lead Generation System

A beginner-friendly full-stack starter application for the Alpha Auron Private Limited Talent Forge assignment.

## What is included

- Public employee-specific lead generation landing page: `/`
- Detailed membership information page: `/membership`
- Admin login and dashboard: `/admin/login` and `/admin/dashboard`
- Employee login and dashboard: `/employee/login` and `/employee/dashboard`
- Node.js + Express backend API
- Supabase PostgreSQL database schema and role-based access setup
- Enquiry validation, duplicate suppression and unique Lead IDs
- Transactional database function that saves the lead and creates automation jobs together
- Three email workflows: executive, assigned employee and prospective member
- Email/Excel job retry and status tracking
- Excel workbook generation and admin download
- Anonymous analytics after visitor consent
- Employee-specific attribution and campaign source tracking
- Render deployment configuration and beginner deployment guide

## Technology stack

| Technology | Purpose |
|---|---|
| HTML, custom responsive CSS, JavaScript | Website pages and browser behaviour (no frontend framework required) |
| Node.js + Express | Backend/API |
| Supabase (PostgreSQL + Auth) | Database and account authentication |
| Resend | Transactional email |
| ExcelJS | `.xlsx` workbook generation |
| Render | Hosting |

The pages use plain HTML, CSS and JavaScript. There is no React, Angular, Bootstrap package or frontend build step. The layout uses ordinary CSS media queries, which keeps the project easier to explain and maintain.

## Important before launch

1. Ask Alpha Auron whether an approved CRM/database or existing website technology stack must be used. Do not deploy an isolated database if the company already has an approved central system.
2. The public enquiry form is disabled by default. Enable it only after the company employee account, verified employee email, database, email sender domain and approved privacy policy are configured.
3. The membership plan values in `config/membership-plans.json` were checked against the public official Talent Forge page on 7 November 2026. Management must confirm the current plan names, fees, project wording and agreement before launch. The official page contains a naming inconsistency in its progression wording, so the company must confirm the controlling terminology.
4. The Excel workbook is generated from Supabase and written to `EXCEL_OUTPUT_PATH`. On Render, attach a Persistent Disk and set the path to `/var/data/Talent_Forge_Membership_Leads.xlsx` to preserve the generated workbook between deploys. The Admin Dashboard also provides an on-demand Excel download.
5. This version writes the workbook to the application's configured disk. It does not directly update a shared OneDrive/SharePoint workbook. That requires a separate Microsoft Graph integration and company approval if a shared Microsoft 365 file is required.
6. Do not commit `.env`, API keys, passwords or service-role keys to GitHub.

## Quick start

Read `docs/BEGINNER-SETUP-GUIDE.md` first. It explains the project in simple language and gives the local setup steps.

For Render deployment, read `docs/RENDER-DEPLOYMENT-GUIDE.md`.

## Main files

```text
talent-forge-project/
├── public/                 Website pages, styles and browser JavaScript
├── backend/services.js     Email and Excel automation services
├── config/membership-plans.json
├── sql/schema.sql          Database tables, security and automation functions
├── docs/                   Beginner setup and deployment guides
├── server.js                Express application and API routes
├── package.json             Node dependencies and commands
├── .env.example             Environment variable template
└── render.yaml              Render service blueprint
```

## Commands

```bash
npm install
npm run check
npm test
npm start
```

Open `http://localhost:3000` after the server starts.

## Public routes

| URL | Purpose |
|---|---|
| `/` | Lead generation page |
| `/membership` | Detailed membership page |
| `/admin/login` | Admin login |
| `/admin/dashboard` | Admin dashboard |
| `/employee/login` | Employee login |
| `/employee/dashboard` | Employee dashboard |
| `/health` | Hosting health check |

## API security summary

- Only the Supabase public/anon key and project URL are sent to the browser for password sign-in.
- The Supabase secret/service-role key remains on the server and must be stored as a Render secret.
- Backend APIs verify the Supabase access token and read the user's role from `user_profiles`.
- Admin APIs require the `admin` role.
- Employee APIs require the `employee` role and filter leads by the authenticated employee account.
- RLS is enabled and direct browser access to lead tables is revoked. The backend is the only data-access path in this starter.
- Public enquiry submissions are rate-limited, validated on the server and protected by a honeypot field.

## Support documents

- `docs/BEGINNER-SETUP-GUIDE.md`
- `docs/RENDER-DEPLOYMENT-GUIDE.md`
- `docs/COMPANY-APPROVAL-CHECKLIST.md`
