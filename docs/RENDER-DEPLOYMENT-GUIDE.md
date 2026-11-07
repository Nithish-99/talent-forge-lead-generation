# Render Deployment Guide — Absolute Beginner Steps

This guide explains how to take the project from the ZIP file on your computer and publish it through Render.

## First: Understand the route

Render normally deploys an application from a Git repository (for example, GitHub) or a prebuilt container image. It does not use the ZIP as a normal direct-upload deployment method.

The beginner route is:

**ZIP file → extract on your computer → upload project files to GitHub → connect GitHub to Render → configure secret settings → deploy.**

Do not upload `.env` or `node_modules` to GitHub.

## Part A — Extract the ZIP

1. Download the project ZIP supplied with this project.
2. Open your Windows **Downloads** folder.
3. Right-click the ZIP file.
4. Select **Extract All**.
5. Open the extracted `talent-forge-project` folder.
6. Confirm that you can see `server.js`, `package.json`, `public`, `backend`, `config`, `sql` and `docs`.

Do not upload only the ZIP file to GitHub. Upload the contents of the extracted project folder.

## Part B — Create a GitHub repository

GitHub stores your project files online. Render connects to GitHub to get the files and deploy them.

1. Open <https://github.com/> and sign in or create an account approved for this company project.
2. Click the **+** icon near the top-right corner.
3. Choose **New repository**.
4. Repository name: `talent-forge-lead-generation`.
5. Select **Private** unless the company explicitly approves a public repository.
6. Do not add a README/license/gitignore from GitHub if you are uploading the included project files with their own README and `.gitignore`.
7. Click **Create repository**.

### Upload the project files

1. Open the new empty repository.
2. Click **Add file → Upload files**.
3. Open the extracted `talent-forge-project` folder on your computer.
4. Select the project files and folders and drag them into the GitHub upload area.
5. Make sure the top-level items include `server.js`, `package.json`, `render.yaml`, `public`, `backend`, `config`, `sql`, and `docs`.
6. Do **not** select `.env`.
7. Do **not** select `node_modules`.
8. At the bottom, enter a commit message such as `Add Talent Forge lead generation app`.
9. Click **Commit changes**.

If GitHub's browser upload is inconvenient, use Git from the terminal instead:

```bash
git init
git add .
git commit -m "Add Talent Forge lead generation app"
git branch -M main
git remote add origin https://github.com/YOUR-ACCOUNT/talent-forge-lead-generation.git
git push -u origin main
```

Run those commands inside the extracted project folder. The `.gitignore` file excludes `.env` and `node_modules`.

## Part C — Create a Render Web Service

1. Open <https://render.com/> and sign in.
2. Connect the GitHub account that contains the private repository.
3. In the Render dashboard, click **New +**.
4. Choose **Web Service**.
5. Select the GitHub repository `talent-forge-lead-generation`.
6. Authorise access if Render asks.
7. Configure the service:

| Render field | Value |
|---|---|
| Name | `talent-forge-lead-generation` (or another available name) |
| Runtime | Node |
| Branch | `main` |
| Root Directory | Leave blank |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Health Check Path | `/health` |

8. Choose a Render service plan. Check Render's current pricing and limits before selecting a plan. A persistent disk may require a paid configuration.
9. Click **Create Web Service**.

Render will download your project, install the packages and run the start command. Wait until the deploy status says **Live**.

## Part D — Copy your website URL

Render gives the service an address similar to:

`https://talent-forge-lead-generation.onrender.com`

Your actual address may be different. Copy the real URL shown in your Render dashboard.

Check this address in a browser:

`https://YOUR-REAL-RENDER-URL/health`

Expected response looks similar to:

```json
{"status":"ok","app":"Talent Forge Lead Generation"}
```

Also open:

- `https://YOUR-REAL-RENDER-URL/`
- `https://YOUR-REAL-RENDER-URL/membership`
- `https://YOUR-REAL-RENDER-URL/admin/login`
- `https://YOUR-REAL-RENDER-URL/employee/login`

The form should still be disabled at this stage.

## Part E — Add environment variables in Render

Environment variables are the private settings that tell the website which database, email service and employee account to use.

1. Open your Render service.
2. Select **Environment** in the left menu.
3. Click **Add Environment Variable**.
4. Enter each key and value below.
5. Save the settings and let Render redeploy if asked.

Add the following keys. Use real company/service values, not the placeholders shown in this document.

### Application

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `APP_BASE_URL` | Your actual Render URL, including `https://` |
| `PUBLIC_FORM_ENABLED` | `false` initially |

### Supabase

| Key | Value |
|---|---|
| `SUPABASE_URL` | Project URL from Supabase Project Settings → API |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase Publishable key (safe for browser sign-in) |
| `SUPABASE_SECRET_KEY` | Supabase Secret key — backend only, confidential |

### Employee-specific owner

| Key | Value |
|---|---|
| `ASSIGNED_EMPLOYEE_NAME` | Approved employee name |
| `ASSIGNED_EMPLOYEE_ID` | Real company employee ID |
| `ASSIGNED_EMPLOYEE_DESIGNATION` | `Talent Forge Associate` or approved designation |
| `ASSIGNED_EMPLOYEE_USER_ID` | Employee UUID copied from Supabase Authentication → Users |
| `EMPLOYEE_EMAIL` | Verified official company email |
| `EMPLOYEE_PHONE` | Approved business phone number, or leave blank |
| `EMPLOYEE_WHATSAPP` | Approved WhatsApp number with country code, or leave blank |

### Emails

| Key | Value |
|---|---|
| `EXECUTIVE_EMAIL` | `santhan@alphaauron.com` (as specified in the assignment; reconfirm before launch) |
| `RESEND_API_KEY` | Resend API key — secret |
| `EMAIL_FROM` | Sender such as `Talent Forge <noreply@verified-company-domain.com>` |

The sender domain must first be verified in Resend. Do not invent a sender address or use a domain that Alpha Auron does not control.

### Membership, privacy and Excel

| Key | Value |
|---|---|
| `OFFICIAL_MEMBERSHIP_URL` | `https://alphaauron.com/talent-forge` |
| `PRIVACY_POLICY_URL` | The privacy-policy URL approved by Alpha Auron |
| `EXCEL_SYNC_ENABLED` | `true` |
| `EXCEL_OUTPUT_PATH` | `/var/data/Talent_Forge_Membership_Leads.xlsx` after attaching a persistent disk |

## Part F — Attach a Persistent Disk for the Excel workbook

This application regenerates the Excel workbook after new enquiries and lead updates. Render's normal application filesystem is temporary. Files written to a normal filesystem can be lost during a deploy or restart.

To keep the `.xlsx` workbook between deploys:

1. In Render, open your Web Service.
2. Find **Disks** or the persistent disk option in the service settings.
3. Add a disk if your chosen service plan supports it.
4. Set the mount path to:

`/var/data`

5. Choose an appropriate size. Start small and increase only if required.
6. Save the disk configuration and wait for the service to redeploy.
7. Confirm the environment variable is set to:

`EXCEL_OUTPUT_PATH=/var/data/Talent_Forge_Membership_Leads.xlsx`

Only files written under `/var/data` will be persistent with this mount.

Important: Render persistent disks have service/plan and scaling limitations. Read the current Render disk documentation and pricing before enabling. The Admin Dashboard's Download Excel button creates a fresh workbook directly from Supabase, so the database remains the source of truth even if the disk copy has a problem.

## Part G — Create user accounts and profile roles

The admin and employee sign-in pages do not have public registration. The company must create the user accounts.

1. Open Supabase → Authentication → Users.
2. Create the authorised admin user and employee user.
3. Copy both UUIDs.
4. Run the two `insert into public.user_profiles` examples in `docs/BEGINNER-SETUP-GUIDE.md`, replacing the IDs and names.
5. Confirm one record has `role='admin'` and the employee record has `role='employee'`.
6. Put the employee UUID in Render as `ASSIGNED_EMPLOYEE_USER_ID`.
7. Put the same employee's verified email and employee ID in the matching Render environment settings.

## Part H — Connect the Supabase authentication settings

1. In Supabase, open **Authentication → URL Configuration** if that section is available in your project.
2. Set the site URL to your real Render URL where required.
3. Keep only the approved production and local development URLs in the allowed redirect list if your authentication configuration uses redirects.
4. Test the Admin Login with the authorised admin account.
5. Test the Employee Login with the authorised employee account.

This project uses the Supabase password-token endpoint for login and the backend verifies the token on every protected API request. No public sign-up page is provided.

## Part I — Final test before enabling real enquiries

Keep `PUBLIC_FORM_ENABLED=false` until every test below passes.

1. `/health` returns `status: ok`.
2. The public landing page and membership page load.
3. Admin and Employee login pages load.
4. Admin login reaches `/admin/dashboard`.
5. Employee login reaches `/employee/dashboard`.
6. An employee cannot access admin APIs or another employee's leads.
7. The Admin Dashboard can view all authorised test leads.
8. The Employee Dashboard sees only assigned leads.
9. Follow-up notes and lead status updates save correctly.
10. Excel downloads and contains the required columns.
11. Resend can deliver all three test email types.
12. The prospect acknowledgement contains the actual `/membership` URL.
13. Excel sync writes to the mounted disk and the job status becomes completed/sent.
14. Membership plans and all project-value wording have written company approval.
15. Privacy consent and privacy-policy URL are approved.

After all checks pass, change:

`PUBLIC_FORM_ENABLED=true`

Save and redeploy. Submit one final test enquiry using a company-controlled test email/phone. Verify the database record, notifications, acknowledgement email and Excel workbook. Delete test data only according to the company's approved data procedure.

## Part J — Updating the website later

1. Make the approved change in your local project folder.
2. Test it locally.
3. Upload/commit the changed files to the same GitHub repository.
4. Render detects the new commit and deploys it automatically if auto-deploy is enabled.
5. Check the Render deploy log and test the website after it becomes live.

If a plan price changes, edit `config/membership-plans.json`, commit it to GitHub and redeploy. Do not change prices based on assumptions; use the current approved company information.

## Common problems

| Problem | What to check |
|---|---|
| Render deploy fails | Open Render → Deploys → latest deploy → Build Logs. Check package install and Node version. |
| `/health` works but database features fail | Check Supabase URL and service-role key in Render Environment. |
| Login says account not active | Confirm the Auth user has a matching active row in `user_profiles`. |
| Employee sees no leads | Check `ASSIGNED_EMPLOYEE_USER_ID` matches the Employee profile UUID and lead assignment. |
| Emails do not arrive | Check Resend API key, verified sender domain, recipient address and automation status in Admin Dashboard. |
| Enquiry form is disabled | Complete every required environment variable and set `PUBLIC_FORM_ENABLED=true` only after approval. |
| Excel file disappears after deploy | Attach a persistent disk mounted at `/var/data` and set `EXCEL_OUTPUT_PATH` to that directory. |
| Membership details look wrong | Recheck `config/membership-plans.json` against the official page and get company approval. |

## Official Render documentation

- Web Services: <https://render.com/docs/web-services>
- Environment Variables: <https://render.com/docs/configure-environment-variables>
- Deploys and ephemeral filesystem: <https://render.com/docs/deploys>
- Persistent Disks: <https://render.com/docs/disks>
