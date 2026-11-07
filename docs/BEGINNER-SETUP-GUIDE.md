# Beginner Setup Guide — Talent Forge

This guide assumes you have never deployed a website before.

## 1. Understand the project in one minute

Think of the application as a small online office:

- The public landing page is the reception desk.
- The enquiry form is the paper form a visitor fills in.
- The backend is the office staff member who checks the form.
- Supabase is the filing cabinet where the information is saved.
- Resend is the email service that sends the notifications.
- The Admin Dashboard is the manager's screen.
- The Employee Dashboard is the employee's screen.
- ExcelJS creates the Excel report from the saved database records.

The main visitor journey is:

1. A person opens your employee-specific website link.
2. They read the information and membership plans.
3. They submit the enquiry form.
4. The database saves the enquiry and generates a Lead ID.
5. The system queues an email for the company, the employee and the prospective member, plus an Excel synchronisation task.
6. The acknowledgement email includes the second page link (`/membership`).
7. The employee follows up through the Employee Dashboard.

The visitor is not automatically redirected to the second page after form submission.

## 2. Install the basic software on your computer

### A. Install Node.js

1. Open <https://nodejs.org/>.
2. Download the current **LTS** version for Windows.
3. Run the installer. Keep the normal/default options selected.
4. Open Windows Command Prompt or the VS Code terminal.
5. Type:

```bash
node -v
npm -v
```

You should see version numbers. The project requires Node.js 20 or newer.

### B. Install Visual Studio Code (recommended)

1. Open <https://code.visualstudio.com/>.
2. Download and install Visual Studio Code.
3. Use it to open the unzipped `talent-forge-project` folder.

## 3. Create the database in Supabase

Supabase is the online filing cabinet for enquiry details.

1. Open <https://supabase.com/> and create/sign in to an account approved for this company project.
2. Create a new project only if Alpha Auron confirms that a new project/database is allowed. If the company has an existing CRM or database, stop and obtain its approved integration details instead.
3. Open the project.
4. In the left menu, choose **SQL Editor**.
5. Choose **New query**.
6. Open this project's `sql/schema.sql` file in VS Code or Notepad.
7. Copy all its contents.
8. Paste the contents into the Supabase SQL Editor.
9. Click **Run**.
10. Check that the tables were created without errors.

The main table is `leads`. It stores each enquiry. Other tables store user roles, follow-up notes, lead history, analytics events and email/Excel automation jobs.

### Get the Supabase keys

1. In Supabase, open **Project Settings**.
2. Open **API** (the exact menu name may change).
3. Copy the Project URL.
4. Copy the **Publishable key** for browser sign-in.
5. Copy the **Secret key** for server-only database access. Supabase is transitioning away from the older `anon` and `service_role` keys; use the new Publishable and Secret keys for a new setup.

Keep the service-role key private. It has powerful database permissions. Never paste it into HTML or JavaScript files and never publish it on GitHub.

## 4. Create Admin and Employee accounts

There is no public sign-up page. The company administrator creates authorised accounts.

1. In Supabase, open **Authentication → Users**.
2. Choose **Add user** and create the approved Admin account.
3. Create the approved Employee account.
4. Copy each user's UUID from the user list.
5. Open **SQL Editor** and run an insert for the Admin. Replace the sample values with the real user UUID and approved name:

```sql
insert into public.user_profiles
  (user_id, full_name, employee_id, designation, role)
values
  ('ADMIN_AUTH_USER_UUID', 'Approved Admin Name', null, 'Administrator', 'admin');
```

6. Add the Employee account:

```sql
insert into public.user_profiles
  (user_id, full_name, employee_id, designation, role)
values
  ('EMPLOYEE_AUTH_USER_UUID', 'Approved Employee Name', 'COMPANY_EMPLOYEE_ID', 'Talent Forge Associate', 'employee');
```

Use the actual UUID values. Keep the Employee role as `employee`; do not give ordinary employees the `admin` role.

The Employee UUID is used by the public funnel to assign each new lead to the correct employee.

## 5. Configure email sending with Resend

Resend sends the automatic emails.

1. Open <https://resend.com/> and create/sign in to the company-approved account.
2. Add the email domain that Alpha Auron authorises you to send from.
3. Resend will display DNS records. Give those records to the domain administrator or add them only if you are authorised to manage the domain.
4. Wait until Resend reports that the sending domain is verified.
5. Create an API key.
6. Copy the key. Keep it private.
7. Choose a sender address using the verified domain, for example `Talent Forge <noreply@approved-domain.com>`.

The system sends:

- Executive notification to `santhan@alphaauron.com` (from the assignment).
- New lead notification to the verified Employee company email.
- Acknowledgement to the prospect, containing the Page 2 link.

Email delivery depends on Resend configuration, domain verification and company approval. Test with company-controlled email addresses before enabling public collection.

## 6. Prepare the project on your computer

1. Extract the ZIP file.
2. Open the `talent-forge-project` folder in VS Code.
3. Open **Terminal → New Terminal**.
4. Run:

```bash
npm install
```

This downloads the required libraries into a `node_modules` folder. Do not upload `node_modules` to GitHub.

5. Copy `.env.example` and name the copy `.env`.
   - On Windows File Explorer, copy and paste `.env.example`.
   - Rename the copied file to `.env` (make sure it is not named `.env.txt`).
6. Open `.env` and fill in the approved values.

Example shape (these are placeholders, not real credentials):

```env
NODE_ENV=development
PORT=3000
APP_BASE_URL=http://localhost:3000
PUBLIC_FORM_ENABLED=false

SUPABASE_URL=https://your-real-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-real-public-key
SUPABASE_SECRET_KEY=sb_secret_your-real-secret-key

ASSIGNED_EMPLOYEE_NAME=Approved Employee Name
ASSIGNED_EMPLOYEE_ID=Real Company Employee ID
ASSIGNED_EMPLOYEE_DESIGNATION=Talent Forge Associate
ASSIGNED_EMPLOYEE_USER_ID=Real Employee Auth UUID
EMPLOYEE_EMAIL=verified.employee@company.com
EMPLOYEE_PHONE=approved-business-phone
EMPLOYEE_WHATSAPP=approved-whatsapp-number

EXECUTIVE_EMAIL=santhan@alphaauron.com
RESEND_API_KEY=your-real-resend-api-key
EMAIL_FROM=Talent Forge <noreply@your-verified-domain.com>
PRIVACY_POLICY_URL=https://company-approved-privacy-policy-url

OFFICIAL_MEMBERSHIP_URL=https://alphaauron.com/talent-forge
EXCEL_OUTPUT_PATH=./storage/Talent_Forge_Membership_Leads.xlsx
EXCEL_SYNC_ENABLED=true
```

Do not use the example values literally. Get the real values from the company and the service dashboards.

## 7. Run the website on your own computer

In the VS Code terminal, run:

```bash
npm run check
npm test
npm start
```

You should see a message saying the app is running on port 3000.

Open these links in Chrome:

- `http://localhost:3000/` — public landing page
- `http://localhost:3000/membership` — detailed membership page
- `http://localhost:3000/admin/login` — admin login
- `http://localhost:3000/employee/login` — employee login
- `http://localhost:3000/health` — should show `status: ok`

The public enquiry form starts disabled. This is intentional. You can inspect the pages before live configuration is complete.

## 8. Enable the enquiry form only after testing

Before setting `PUBLIC_FORM_ENABLED=true`, check all of these:

- Supabase schema ran successfully.
- Admin and Employee Auth users exist.
- Their `user_profiles` rows exist and are active.
- `ASSIGNED_EMPLOYEE_USER_ID` is the UUID of the Employee profile.
- Employee ID, name and verified company email are correct.
- Resend sender domain is verified.
- Executive and Employee notification addresses are approved.
- The company privacy policy URL is correct.
- Membership plan names, prices and all claims are approved by management.

Then set `PUBLIC_FORM_ENABLED=true` locally and test with company-controlled email addresses. Confirm the record is saved in Supabase before checking the emails and workbook.

## 9. Where do you change membership fees and contact details?

- Plan names and fees: edit `config/membership-plans.json` and redeploy.
- Employee name, employee ID, designation, email, mobile and WhatsApp: edit the relevant `.env` values or Render environment settings and redeploy.
- Executive notification recipient: `EXECUTIVE_EMAIL`.
- Membership official website: `OFFICIAL_MEMBERSHIP_URL`.

The JSON file is the simple plan configuration source in this version. It is not an in-browser content editor.

## 10. Important security rules

- Never place `SUPABASE_SECRET_KEY`, the legacy `SUPABASE_SERVICE_ROLE_KEY`, or `RESEND_API_KEY` in a public file.
- Never commit `.env` to GitHub.
- Create real user accounts only for approved employees and administrators.
- Give admin access only to authorised administrators.
- Do not upload real prospect data while testing.
- Use the company's approved privacy and data retention rules.
