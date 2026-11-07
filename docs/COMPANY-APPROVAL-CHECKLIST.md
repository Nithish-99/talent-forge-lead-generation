# Company Approval Checklist — Before Public Launch

This project is a deployable application starter, not authorisation to collect public prospect data. Obtain written approval from Alpha Auron for the following.

## Existing company systems

- [ ] Confirm whether an existing CRM/central lead database must be integrated.
- [ ] Confirm approved hosting, domain and technology stack.
- [ ] Confirm where the central Excel-compatible workbook must be stored (Render persistent disk, SharePoint, OneDrive or another company-approved location).

## Employee identity and access

- [ ] Verified employee name.
- [ ] Company employee ID.
- [ ] Approved designation.
- [ ] Verified official company email.
- [ ] Approved business mobile and WhatsApp numbers, if shown publicly.
- [ ] Employee Supabase account UUID and role.
- [ ] Approved admin account(s) and role(s).

## Membership content

- [ ] Current membership plan names.
- [ ] Current 6-month and 12-month fees.
- [ ] Project-value wording and disclaimers.
- [ ] Project assignment conditions.
- [ ] Compensation and payout rules.
- [ ] Membership agreement, refund and cancellation terms.
- [ ] FAQ answers and all marketing claims.

## Privacy and email

- [ ] Approved privacy policy URL and form consent wording.
- [ ] Approved data retention and deletion process.
- [ ] Approved executive notification recipient (`santhan@alphaauron.com` is in the task assignment; reconfirm it).
- [ ] Resend sending domain verified by the company's domain administrator.
- [ ] Approved sender name and email address.
- [ ] Test emails confirmed by the company.

## Final launch

- [ ] Admin access test passed.
- [ ] Employee access restriction test passed.
- [ ] Enquiry form validation and duplicate suppression tested.
- [ ] Database and lead attribution verified.
- [ ] Email jobs and retries tested.
- [ ] Excel generation, persistence and export tested.
- [ ] Analytics consent tested.
- [ ] Mobile and desktop testing completed.
- [ ] Written management approval to set `PUBLIC_FORM_ENABLED=true`.
