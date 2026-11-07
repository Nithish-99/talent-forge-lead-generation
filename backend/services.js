const fs = require('node:fs/promises');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { Resend } = require('resend');

const allowedLeadStatuses = new Set([
  'New Enquiry',
  'Contacted',
  'Interested',
  'Official Website Shared',
  'Follow-Up Required',
  'Enrolment in Progress',
  'Enrolled — Verified',
  'Not Interested',
  'Closed'
]);

const allowedEventNames = new Set([
  'page_view', 'section_view', 'plan_click', 'form_open', 'form_abandon', 'form_submit'
]);

function normaliseEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function validEmail(value) {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validMobile(value) {
  if (typeof value !== 'string') return false;
  const cleaned = value.replace(/[\s().-]/g, '');
  return /^\+?[0-9]{10,15}$/.test(cleaned);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(date);
}

function baseUrl() {
  return (process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
}

function leadRows(lead) {
  const fields = [
    ['Lead ID', lead.lead_id],
    ['Full Name', lead.full_name],
    ['Email Address', lead.email],
    ['Mobile Number', lead.mobile],
    ['Professional Category', lead.professional_category],
    ['Primary Skills', lead.primary_skills],
    ['Experience Level', lead.experience_level],
    ['Current Status', lead.current_status],
    ['Preferred Membership Duration', lead.preferred_membership_duration],
    ['Additional Questions', lead.additional_questions],
    ['Assigned Employee', lead.assigned_employee_name],
    ['Employee ID', lead.employee_id],
    ['Employee Designation', lead.employee_designation],
    ['Lead Source', lead.lead_source],
    ['Campaign Source', lead.campaign_source],
    ['Submission Date', lead.submission_date],
    ['Submission Time', lead.submission_time],
    ['Lead Status', lead.lead_status],
    ['Follow-Up Notes', lead.latest_follow_up_note],
    ['Next Follow-Up Date', lead.next_follow_up_date],
    ['Enrolment Status', lead.enrolment_status]
  ];
  return fields;
}

async function fetchAllLeads(db) {
  const all = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db.from('leads').select('*').order('created_at', { ascending: true }).range(offset, offset + pageSize - 1);
    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < pageSize) break;
    if (offset > 100000) throw new Error('Export stopped after 100,000 rows. Use a paginated export for larger datasets.');
  }
  return all;
}

async function createExcelWorkbook(db) {
  const leads = await fetchAllLeads(db);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Alpha Auron Private Limited — Talent Forge';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.subject = 'Talent Forge membership enquiries';
  workbook.title = 'Talent Forge Membership Leads';
  const sheet = workbook.addWorksheet('Membership Leads', { views: [{ state: 'frozen', ySplit: 1 }] });
  const headers = [
    'Lead ID', 'Full Name', 'Email Address', 'Mobile Number', 'Professional Category',
    'Primary Skills', 'Experience Level', 'Current Status', 'Preferred Membership Duration',
    'Additional Questions', 'Assigned Employee', 'Employee ID', 'Employee Designation',
    'Lead Source', 'Campaign Source', 'Submission Date', 'Submission Time', 'Lead Status',
    'Follow-Up Notes', 'Next Follow-Up Date', 'Enrolment Status'
  ];
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF15233F' } };
  sheet.getRow(1).alignment = { vertical: 'middle', wrapText: true };
  sheet.getRow(1).height = 32;
  const widths = [20, 24, 30, 18, 28, 34, 18, 20, 25, 40, 24, 18, 28, 20, 22, 16, 16, 24, 40, 20, 22];
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });

  const notesByLead = new Map();
  if (leads.length) {
    const ids = leads.map(lead => lead.id);
    for (let i = 0; i < ids.length; i += 500) {
      const batch = ids.slice(i, i + 500);
      const { data: notes, error } = await db.from('lead_notes').select('lead_id,note,created_at').in('lead_id', batch).order('created_at', { ascending: false });
      if (error) throw error;
      for (const note of (notes || [])) if (!notesByLead.has(note.lead_id)) notesByLead.set(note.lead_id, note.note);
    }
  }

  for (const lead of leads) {
    const created = new Date(lead.created_at || lead.submitted_at);
    const row = [
      lead.lead_id, lead.full_name, lead.email, lead.mobile, lead.professional_category,
      lead.primary_skills, lead.experience_level, lead.current_status, lead.preferred_membership_duration,
      lead.additional_questions, lead.assigned_employee_name, lead.employee_id, lead.employee_designation,
      lead.lead_source, lead.campaign_source,
      lead.submission_date || created.toISOString().slice(0, 10),
      lead.submission_time || created.toISOString().slice(11, 19), lead.lead_status,
      notesByLead.get(lead.id) || '', lead.next_follow_up_date, lead.enrolment_status
    ];
    sheet.addRow(row).alignment = { vertical: 'top', wrapText: true };
  }
  sheet.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + headers.length)}1` };
  sheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 2 }];

  const auditSheet = workbook.addWorksheet('Export Information');
  auditSheet.addRows([
    ['Workbook', 'Talent_Forge_Membership_Leads.xlsx'],
    ['Generated At (UTC)', new Date().toISOString()],
    ['Total Leads', leads.length],
    ['Source of Truth', 'Supabase database'],
    ['Note', 'This workbook is a generated synchronised copy. Make changes in the dashboard, not directly in Excel.']
  ]);
  auditSheet.getColumn(1).width = 28;
  auditSheet.getColumn(2).width = 100;
  return workbook;
}

async function sendEmail({ to, subject, html, text, idempotencyKey }) {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not configured.');
  if (!process.env.EMAIL_FROM || process.env.EMAIL_FROM.includes('YOUR-VERIFIED-DOMAIN')) throw new Error('EMAIL_FROM is not configured with a verified sender domain.');
  if (!to) throw new Error('Recipient email address is not configured.');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const result = await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    html,
    text
  }, idempotencyKey ? { idempotencyKey } : undefined);
  if (result?.error) throw new Error(result.error.message || 'Email provider returned an error.');
  return result;
}

function emailDetailsTable(lead) {
  const rows = [
    ['Lead ID', lead.lead_id], ['Full Name', lead.full_name], ['Email', lead.email], ['Mobile', lead.mobile],
    ['Professional Category', lead.professional_category], ['Primary Skills', lead.primary_skills],
    ['Experience Level', lead.experience_level], ['Current Status', lead.current_status],
    ['Preferred Duration', lead.preferred_membership_duration || 'Not specified'],
    ['Additional Questions', lead.additional_questions || 'None'],
    ['Assigned Employee', lead.assigned_employee_name], ['Employee Designation', lead.employee_designation],
    ['Submission Time', formatDate(lead.created_at)], ['Lead Source', lead.lead_source || 'Direct'],
    ['Campaign Source', lead.campaign_source || '—']
  ];
  return `<table role="presentation" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:14px">${rows.map(([key, value]) => `<tr><td style="border:1px solid #e5e7eb;background:#f8fafc;font-weight:bold;width:36%">${escapeHtml(key)}</td><td style="border:1px solid #e5e7eb">${escapeHtml(value)}</td></tr>`).join('')}</table>`;
}

async function sendLeadEmail(job, lead) {
  const salesUrl = `${baseUrl()}/membership`;
  const adminLeadUrl = `${baseUrl()}/admin/dashboard?lead=${encodeURIComponent(lead.id)}`;
  const employeeLeadUrl = `${baseUrl()}/employee/dashboard?lead=${encodeURIComponent(lead.id)}`;
  const company = 'Alpha Auron Private Limited';

  if (job.job_type === 'email_executive') {
    const to = process.env.EXECUTIVE_EMAIL || 'santhan@alphaauron.com';
    const subject = `New Talent Forge Membership Enquiry — ${lead.lead_id}`;
    const html = `<div style="max-width:720px;margin:auto;font-family:Arial,sans-serif;color:#172033"><h2>New Talent Forge membership enquiry</h2><p>A new enquiry has been submitted and saved successfully.</p>${emailDetailsTable(lead)}<p style="margin-top:24px"><a href="${escapeHtml(adminLeadUrl)}" style="background:#1c4ed8;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Open lead in Admin Dashboard</a></p><p style="color:#64748b;font-size:12px">This link requires an authorised admin login.</p></div>`;
    const text = `New Talent Forge enquiry ${lead.lead_id}\n\n${lead.full_name} — ${lead.email} — ${lead.mobile}\nCategory: ${lead.professional_category}\nLead source: ${lead.lead_source || 'Direct'}\nAdmin: ${adminLeadUrl}`;
    return sendEmail({ to, subject, html, text, idempotencyKey: job.idempotency_key });
  }

  if (job.job_type === 'email_employee') {
    const to = process.env.EMPLOYEE_EMAIL;
    const subject = `New Talent Forge Lead Assigned — ${lead.lead_id}`;
    const html = `<div style="max-width:720px;margin:auto;font-family:Arial,sans-serif;color:#172033"><h2>You have received a new Talent Forge enquiry</h2><p>Hello ${escapeHtml(lead.assigned_employee_name)},</p><p>A new membership enquiry has been assigned to you.</p>${emailDetailsTable(lead)}<p style="margin-top:24px"><a href="${escapeHtml(employeeLeadUrl)}" style="background:#1c4ed8;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Open Employee Dashboard</a></p><p style="color:#64748b;font-size:12px">Regards,<br/>Talent Forge — ${company}</p></div>`;
    const text = `New Talent Forge lead ${lead.lead_id}\n${lead.full_name} — ${lead.email} — ${lead.mobile}\nEmployee dashboard: ${employeeLeadUrl}`;
    return sendEmail({ to, subject, html, text, idempotencyKey: job.idempotency_key });
  }

  if (job.job_type === 'email_prospect') {
    const subject = 'Thank You for Your Interest in Talent Forge!';
    const html = `<div style="max-width:680px;margin:auto;font-family:Arial,sans-serif;color:#172033;line-height:1.6"><h2>Thank you for your interest, ${escapeHtml(lead.full_name)}!</h2><p>We have successfully received your membership enquiry for Talent Forge, operated by ${company}.</p><p>Our representative, ${escapeHtml(lead.assigned_employee_name)}, ${escapeHtml(lead.employee_designation)}, will review your enquiry and contact you regarding the next steps.</p><p>You can explore membership information, available plans, fees, durations, benefits and enrolment details using the button below.</p><p style="margin:28px 0"><a href="${escapeHtml(salesUrl)}" style="background:#1c4ed8;color:#fff;padding:13px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Explore Talent Forge Membership Details</a></p><p><strong>Your Enquiry Reference ID:</strong> ${escapeHtml(lead.lead_id)}</p><p>Submitting an enquiry does not complete membership enrolment. Enrolment is completed only through the official process.</p><p>Regards,<br/>Talent Forge Team<br/>${company}</p></div>`;
    const text = `Hello ${lead.full_name},\n\nThank you for your interest in Talent Forge. We have received your membership enquiry.\n\nExplore membership details: ${salesUrl}\n\nYour Enquiry Reference ID: ${lead.lead_id}\n\nSubmitting an enquiry does not complete membership enrolment.\n\nRegards,\nTalent Forge Team\n${company}`;
    return sendEmail({ to: lead.email, subject, html, text, idempotencyKey: job.idempotency_key });
  }

  throw new Error(`Unknown email job type: ${job.job_type}`);
}

async function executeJob(db, job) {
  if (job.job_type === 'excel_sync') {
    if (String(process.env.EXCEL_SYNC_ENABLED || 'true').toLowerCase() !== 'true') return;
    const outputPath = path.resolve(process.env.EXCEL_OUTPUT_PATH || './storage/Talent_Forge_Membership_Leads.xlsx');
    const workbook = await createExcelWorkbook(db);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    const tempPath = `${outputPath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await workbook.xlsx.writeFile(tempPath);
      await fs.rename(tempPath, outputPath);
    } catch (error) {
      await fs.rm(tempPath, { force: true }).catch(() => {});
      throw error;
    }
    return;
  }
  const { data: lead, error } = await db.from('leads').select('*').eq('id', job.lead_id).single();
  if (error) throw error;
  if (job.job_type.startsWith('email_')) return sendLeadEmail(job, lead);
  throw new Error(`Unknown automation job: ${job.job_type}`);
}

async function processAutomationJobs(db) {
  const { data: jobs, error } = await db.rpc('claim_automation_jobs', { p_limit: 5 });
  if (error) throw error;
  for (const job of (jobs || [])) {
    try {
      await executeJob(db, job);
      const { error: updateError } = await db.from('automation_jobs').update({ status: 'sent', completed_at: new Date().toISOString(), last_error: null }).eq('id', job.id);
      if (updateError) throw updateError;
    } catch (error) {
      const attempts = Number(job.attempts || 1);
      const failed = attempts >= 6;
      const delaySeconds = Math.min(60 * 60, 30 * (2 ** Math.max(0, attempts - 1)));
      const nextAttempt = new Date(Date.now() + delaySeconds * 1000).toISOString();
      const message = String(error?.message || error).slice(0, 1500);
      console.error(`Automation job ${job.id} (${job.job_type}) failed on attempt ${attempts}: ${message}`);
      const { error: updateError } = await db.from('automation_jobs').update({
        status: failed ? 'failed' : 'pending',
        next_attempt_at: nextAttempt,
        last_error: message
      }).eq('id', job.id);
      if (updateError) console.error('Could not update failed automation job:', updateError.message);
    }
  }
}

module.exports = {
  processAutomationJobs,
  createExcelWorkbook,
  sendLeadEmail,
  escapeHtml,
  normaliseEmail,
  validEmail,
  validMobile,
  allowedLeadStatuses,
  allowedEventNames,
  leadRows
};
