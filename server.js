require('dotenv').config();

const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const plans = require('./config/membership-plans.json');
const {
  processAutomationJobs,
  createExcelWorkbook,
  sendLeadEmail,
  escapeHtml,
  normaliseEmail,
  validEmail,
  validMobile,
  allowedLeadStatuses,
  allowedEventNames
} = require('./backend/services');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const startedAt = new Date().toISOString();

const csp = {
  defaultSrc: ["'self'"],
  baseUri: ["'self'"],
  fontSrc: ["'self'", 'data:'],
  imgSrc: ["'self'", 'data:', 'blob:'],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'"],
  connectSrc: ["'self'", 'https://*.supabase.co'],
  formAction: ["'self'", 'https://*.supabase.co'],
  frameAncestors: ["'none'"],
  objectSrc: ["'none'"]
};
app.use(helmet({ contentSecurityPolicy: { directives: csp }, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '30kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.disable('x-powered-by');
app.set('trust proxy', 1);

let supabase = null;
function getSupabase() {
  if (supabase) return supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || url.includes('YOUR-PROJECT')) {
    throw new Error('Supabase is not configured. Add SUPABASE_URL and SUPABASE_SECRET_KEY (or the legacy service-role key).');
  }
  supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });
  return supabase;
}

function publicConfig() {
  const employeeName = process.env.ASSIGNED_EMPLOYEE_NAME || 'Talent Forge Associate';
  const employeeEmail = process.env.EMPLOYEE_EMAIL || '';
  const employeePhone = process.env.EMPLOYEE_PHONE || '';
  const employeeWhatsapp = process.env.EMPLOYEE_WHATSAPP || '';
  const ownerUserId = process.env.ASSIGNED_EMPLOYEE_USER_ID || '';
  const required = [
    process.env.SUPABASE_URL,
    process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.ASSIGNED_EMPLOYEE_ID,
    ownerUserId,
    employeeEmail,
    process.env.RESEND_API_KEY,
    process.env.EMAIL_FROM,
    process.env.PRIVACY_POLICY_URL
  ];
  const hasPlaceholder = value => !value || /YOUR-|REPLACE_WITH|xxxxxxxx/i.test(String(value));
  const configured = required.every(value => !hasPlaceholder(value)) && /^https:\/\/[^\s]+\.supabase\.co$/.test(process.env.SUPABASE_URL || '') && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.EMPLOYEE_EMAIL || '') && !String(process.env.EMAIL_FROM || '').includes('YOUR-VERIFIED-DOMAIN');
  return {
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabasePublicKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '',
    employeeName,
    employeeDesignation: process.env.ASSIGNED_EMPLOYEE_DESIGNATION || 'Talent Forge Associate',
    employeeCompany: 'Alpha Auron Private Limited',
    employeeEmail,
    employeePhone,
    employeeWhatsapp,
    officialMembershipUrl: process.env.OFFICIAL_MEMBERSHIP_URL || 'https://alphaauron.com/talent-forge',
    privacyPolicyUrl: process.env.PRIVACY_POLICY_URL || '',
    formEnabled: String(process.env.PUBLIC_FORM_ENABLED || 'false').toLowerCase() === 'true' && configured,
    formDisabledReason: 'The enquiry form is not enabled yet. The company must complete and approve the required account and contact configuration.'
  };
}

function absoluteUrl(relativePath) {
  const base = (process.env.APP_BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
  return `${base}${relativePath.startsWith('/') ? relativePath : `/${relativePath}`}`;
}

const publicFormLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 6,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many enquiries from this connection. Please try again later.' }
});
const analyticsLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false
});

async function requireUser(req, res, next) {
  try {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Please sign in.' });
    const db = getSupabase();
    const { data: authData, error: authError } = await db.auth.getUser(token);
    if (authError || !authData?.user) return res.status(401).json({ error: 'Your session is invalid or expired. Please sign in again.' });
    const { data: profile, error: profileError } = await db
      .from('user_profiles')
      .select('user_id, full_name, employee_id, designation, role, is_active')
      .eq('user_id', authData.user.id)
      .maybeSingle();
    if (profileError || !profile || !profile.is_active) return res.status(403).json({ error: 'Your account is not active. Contact the administrator.' });
    req.user = authData.user;
    req.profile = profile;
    req.db = db;
    next();
  } catch (error) {
    next(error);
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.profile || !roles.includes(req.profile.role)) return res.status(403).json({ error: 'You do not have permission to access this area.' });
    next();
  };
}

function requireLeadAccess(req, res, next) {
  const isAdmin = req.profile.role === 'admin';
  if (isAdmin) return next();
  if (req.profile.role !== 'employee') return res.status(403).json({ error: 'Access denied.' });
  req.leadOwnerFilter = req.user.id;
  next();
}

function safeText(value, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

async function queueExcelSync(db, leadId) {
  if (String(process.env.EXCEL_SYNC_ENABLED || 'true').toLowerCase() !== 'true') return;
  const key = `${leadId}:excel_sync:${Date.now()}`;
  const { error } = await db.from('automation_jobs').upsert({
    lead_id: leadId, job_type: 'excel_sync', idempotency_key: key, status: 'pending',
    attempts: 0, next_attempt_at: new Date().toISOString(), last_error: null, completed_at: null
  }, { onConflict: 'lead_id,job_type' });
  if (error) throw error;
}

function deriveSource(req) {
  const raw = safeText(req.body.leadSource, 200);
  if (raw) return raw;
  const ref = safeText(req.body.referrer, 500);
  if (!ref) return 'Direct';
  try { return new URL(ref).hostname.slice(0, 200); } catch { return 'Direct'; }
}

function csvSafe(value) {
  return safeText(value, 200);
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', app: 'Talent Forge Lead Generation', startedAt, now: new Date().toISOString() });
});

app.get('/api/config', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(publicConfig());
});

app.get('/api/membership-plans', (_req, res) => {
  res.json(plans);
});

app.post('/api/public/events', analyticsLimiter, async (req, res, next) => {
  try {
    const eventName = safeText(req.body.eventName, 50);
    const visitorId = safeText(req.body.visitorId, 50);
    if (!allowedEventNames.has(eventName) || !/^[0-9a-f-]{36}$/i.test(visitorId)) return res.status(400).json({ error: 'Invalid event.' });
    const source = csvSafe(req.body.source) || 'Direct';
    const campaign = csvSafe(req.body.campaign);
    const page = safeText(req.body.page, 300) || '/';
    const { error } = await getSupabase().from('analytics_events').insert({
      event_name: eventName,
      visitor_id: visitorId,
      page,
      lead_source: source,
      campaign_source: campaign || null,
      employee_id: process.env.ASSIGNED_EMPLOYEE_ID || null
    });
    if (error) throw error;
    res.status(202).json({ ok: true });
  } catch (error) { next(error); }
});

app.post('/api/public/leads', publicFormLimiter, async (req, res, next) => {
  try {
    const config = publicConfig();
    if (String(process.env.PUBLIC_FORM_ENABLED || 'false').toLowerCase() !== 'true' || !config.formEnabled) {
      return res.status(503).json({ error: config.formDisabledReason });
    }
    // Honeypot: real visitors never see or fill this field.
    if (safeText(req.body.website, 200)) return res.status(400).json({ error: 'Unable to submit this enquiry.' });

    const fullName = safeText(req.body.fullName, 120);
    const email = normaliseEmail(req.body.email);
    const mobile = safeText(req.body.mobile, 25);
    const category = safeText(req.body.professionalCategory, 100);
    const skills = safeText(req.body.primarySkills, 500);
    const experience = safeText(req.body.experienceLevel, 60);
    const currentStatus = safeText(req.body.currentStatus, 60);
    const duration = safeText(req.body.preferredMembershipDuration, 30);
    const additional = safeText(req.body.additionalQuestions, 1500);
    const consent = req.body.privacyConsent === true;
    const allowedCategories = new Set([
      'Full Stack Development', 'Frontend Development', 'Backend Development', 'AI and Machine Learning',
      'Cybersecurity', 'Cloud Engineering and DevOps', 'QA Automation', 'Data Analytics', 'Data Engineering',
      'UI/UX Design', 'Animation and Visual Effects', 'Digital Media', 'Digital Marketing', 'Other eligible professional categories'
    ]);
    const allowedExperience = new Set(['Student', 'Fresher', '0-2 years', '2-5 years', '5+ years']);
    const allowedStatus = new Set(['Student', 'Recent Graduate', 'Employed', 'Freelancer', 'Job Seeker', 'Other']);
    const allowedDuration = new Set(['', '6 months', '12 months', 'Not sure yet']);
    const errors = {};
    if (fullName.length < 2) errors.fullName = 'Enter your full name.';
    if (!validEmail(email)) errors.email = 'Enter a valid email address.';
    if (!validMobile(mobile)) errors.mobile = 'Enter a valid mobile number.';
    if (!allowedCategories.has(category)) errors.professionalCategory = 'Choose a professional category.';
    if (skills.length < 2) errors.primarySkills = 'Enter at least one primary skill.';
    if (!allowedExperience.has(experience)) errors.experienceLevel = 'Choose an experience level.';
    if (!allowedStatus.has(currentStatus)) errors.currentStatus = 'Choose your current status.';
    if (!allowedDuration.has(duration)) errors.preferredMembershipDuration = 'Choose a valid duration.';
    if (!consent) errors.privacyConsent = 'Please provide privacy consent to continue.';
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please correct the highlighted fields.', fields: errors });

    const assignedTo = process.env.ASSIGNED_EMPLOYEE_USER_ID;
    if (!assignedTo || !process.env.ASSIGNED_EMPLOYEE_ID || !process.env.EMPLOYEE_EMAIL) {
      return res.status(503).json({ error: 'The employee owner details are incomplete. Please contact Alpha Auron.' });
    }
    const source = deriveSource(req);
    const campaign = safeText(req.body.campaignSource, 200) || null;
    const visitorId = safeText(req.body.visitorId, 50);
    const leadData = {
      full_name: fullName,
      email,
      mobile,
      professional_category: category,
      primary_skills: skills,
      experience_level: experience,
      current_status: currentStatus,
      preferred_membership_duration: duration || null,
      additional_questions: additional || null,
      privacy_consent: true,
      assigned_employee_name: process.env.ASSIGNED_EMPLOYEE_NAME || 'Employee',
      employee_id: process.env.ASSIGNED_EMPLOYEE_ID,
      employee_designation: process.env.ASSIGNED_EMPLOYEE_DESIGNATION || 'Talent Forge Associate',
      lead_source: source,
      campaign_source: campaign,
      funnel_url: absoluteUrl('/'),
      visitor_id: /^[0-9a-f-]{36}$/i.test(visitorId) ? visitorId : null
    };
    const dedupeKey = require('node:crypto').createHash('sha256')
      .update(`${email}|${mobile.replace(/\D/g, '')}|${Math.floor(Date.now() / (24 * 60 * 60 * 1000))}`)
      .digest('hex');
    const { data, error } = await getSupabase().rpc('create_membership_lead', {
      p_lead: leadData,
      p_assigned_to: assignedTo,
      p_dedupe_key: dedupeKey
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.lead_id) throw new Error('The database did not return a Lead ID.');
    res.status(result.is_duplicate ? 200 : 201).json({
      ok: true,
      leadId: result.lead_id,
      duplicate: Boolean(result.is_duplicate),
      message: result.is_duplicate
        ? 'We have already received a recent enquiry with these details.'
        : 'Your enquiry has been received. A confirmation email will be sent after your enquiry is saved.'
    });
  } catch (error) { next(error); }
});

app.get('/api/me', requireUser, (req, res) => {
  res.json({ user: { id: req.user.id, email: req.user.email }, profile: req.profile });
});

app.get('/api/employee/leads', requireUser, requireRole('employee'), async (req, res, next) => {
  try {
    const q = safeText(req.query.q, 100);
    const status = safeText(req.query.status, 50);
    let query = req.db.from('leads').select('*').eq('assigned_to', req.user.id).order('created_at', { ascending: false }).limit(300);
    if (status && allowedLeadStatuses.has(status)) query = query.eq('lead_status', status);
    if (q) query = query.or(`full_name.ilike.%${q.replace(/[%(),]/g, '')}%,email.ilike.%${q.replace(/[%(),]/g, '')}%,mobile.ilike.%${q.replace(/[%(),]/g, '')}%,lead_id.ilike.%${q.replace(/[%(),]/g, '')}%`);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ leads: data || [] });
  } catch (error) { next(error); }
});

app.get('/api/employee/summary', requireUser, requireRole('employee'), async (req, res, next) => {
  try {
    const { data, error } = await req.db.from('leads').select('id,lead_status,enrolment_status,next_follow_up_date').eq('assigned_to', req.user.id).limit(5000);
    if (error) throw error;
    res.json(summariseLeads(data || []));
  } catch (error) { next(error); }
});

app.get('/api/admin/employees', requireUser, requireRole('admin'), async (req, res, next) => {
  try {
    const { data, error } = await req.db.from('user_profiles')
      .select('user_id,full_name,employee_id,designation,role,is_active')
      .eq('role', 'employee').eq('is_active', true).order('full_name');
    if (error) throw error;
    res.json({ employees: data || [] });
  } catch (error) { next(error); }
});

app.get('/api/admin/leads', requireUser, requireRole('admin'), async (req, res, next) => {
  try {
    const q = safeText(req.query.q, 100);
    const status = safeText(req.query.status, 50);
    const from = safeText(req.query.from, 20);
    const to = safeText(req.query.to, 20);
    let query = req.db.from('leads').select('*').order('created_at', { ascending: false }).limit(1000);
    if (status && allowedLeadStatuses.has(status)) query = query.eq('lead_status', status);
    if (from) query = query.gte('created_at', `${from}T00:00:00+05:30`);
    if (to) query = query.lte('created_at', `${to}T23:59:59.999+05:30`);
    if (q) {
      const term = q.replace(/[%(),]/g, '');
      query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,mobile.ilike.%${term}%,lead_id.ilike.%${term}%`);
    }
    const { data, error } = await query;
    if (error) throw error;
    res.json({ leads: data || [] });
  } catch (error) { next(error); }
});

app.get('/api/admin/summary', requireUser, requireRole('admin'), async (req, res, next) => {
  try {
    const { data, error } = await req.db.from('leads').select('id,lead_status,enrolment_status,next_follow_up_date').limit(10000);
    if (error) throw error;
    const summary = summariseLeads(data || []);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: events, error: eventError } = await req.db.from('analytics_events').select('event_name,visitor_id,lead_source,campaign_source,created_at').gte('created_at', since).limit(10000);
    if (eventError) throw eventError;
    const { data: jobs, error: jobsError } = await req.db.from('automation_jobs').select('job_type,status,last_error,created_at').order('created_at', { ascending: false }).limit(100);
    if (jobsError) throw jobsError;
    const jobRows = jobs || [];
    summary.automation = { pending: jobRows.filter(job => job.status === 'pending' || job.status === 'processing').length, failed: jobRows.filter(job => job.status === 'failed').length, completed: jobRows.filter(job => job.status === 'sent').length, latestFailures: jobRows.filter(job => job.status === 'failed').slice(0, 5) };
    const eventRows = events || [];
    summary.analytics = {
      visitors: new Set(eventRows.filter(e => e.event_name === 'page_view').map(e => e.visitor_id)).size,
      pageViews: eventRows.filter(e => e.event_name === 'page_view').length,
      formOpens: eventRows.filter(e => e.event_name === 'form_open').length,
      planClicks: eventRows.filter(e => e.event_name === 'plan_click').length,
      submissions: eventRows.filter(e => e.event_name === 'form_submit').length,
      formAbandons: eventRows.filter(e => e.event_name === 'form_abandon').length,
      planSectionViews: eventRows.filter(e => e.event_name === 'section_view').length,
      sources: [...eventRows.reduce((map, e) => map.set(e.lead_source || 'Direct', (map.get(e.lead_source || 'Direct') || 0) + (e.event_name === 'page_view' ? 1 : 0)), new Map()).entries()]
        .map(([source, views]) => ({ source, views })).sort((a, b) => b.views - a.views).slice(0, 8),
      campaigns: [...eventRows.reduce((map, e) => { if (e.campaign_source && e.event_name === 'page_view') map.set(e.campaign_source, (map.get(e.campaign_source) || 0) + 1); return map; }, new Map()).entries()]
        .map(([campaign, views]) => ({ campaign, views })).sort((a, b) => b.views - a.views).slice(0, 8)
    };
    res.json(summary);
  } catch (error) { next(error); }
});

app.get('/api/leads/:id', requireUser, requireLeadAccess, async (req, res, next) => {
  try {
    let query = req.db.from('leads').select('*, lead_notes(id,note,next_follow_up_date,created_at,created_by)').eq('id', req.params.id).single();
    if (req.profile.role === 'employee') query = req.db.from('leads').select('*, lead_notes(id,note,next_follow_up_date,created_at,created_by)').eq('id', req.params.id).eq('assigned_to', req.user.id).single();
    const { data, error } = await query;
    if (error || !data) return res.status(404).json({ error: 'Lead not found.' });
    const { data: audit, error: auditError } = await req.db.from('lead_audit_log').select('action,old_values,new_values,created_at,actor_user_id').eq('lead_id', req.params.id).order('created_at', { ascending: false }).limit(50);
    if (auditError) throw auditError;
    res.json({ lead: data, audit: audit || [] });
  } catch (error) { next(error); }
});

app.patch('/api/leads/:id', requireUser, requireLeadAccess, async (req, res, next) => {
  try {
    const db = req.db;
    const { data: oldLead, error: getError } = await db.from('leads').select('*').eq('id', req.params.id).maybeSingle();
    if (getError) throw getError;
    if (!oldLead) return res.status(404).json({ error: 'Lead not found.' });
    if (req.profile.role === 'employee' && oldLead.assigned_to !== req.user.id) return res.status(403).json({ error: 'You can only update leads assigned to you.' });
    const patch = {};
    const leadStatus = safeText(req.body.leadStatus, 50);
    const enrolmentStatus = safeText(req.body.enrolmentStatus, 60);
    if (leadStatus) {
      if (!allowedLeadStatuses.has(leadStatus)) return res.status(400).json({ error: 'Invalid lead status.' });
      patch.lead_status = leadStatus;
    }
    if (enrolmentStatus && req.profile.role === 'admin') {
      const allowedEnrolment = new Set(['Not Started', 'Enquiry Received', 'Enrolment in Progress', 'Enrolled — Verified', 'Enrolled - Verified', 'Not Enrolled']);
      if (!allowedEnrolment.has(enrolmentStatus)) return res.status(400).json({ error: 'Invalid enrolment status.' });
      patch.enrolment_status = enrolmentStatus;
    }
    if (req.profile.role === 'admin' && Object.hasOwn(req.body, 'assignedTo')) {
      const target = safeText(req.body.assignedTo, 80);
      if (target) {
        const { data: targetProfile, error: targetError } = await db.from('user_profiles').select('user_id,role,is_active').eq('user_id', target).maybeSingle();
        if (targetError) throw targetError;
        if (!targetProfile || targetProfile.role !== 'employee' || !targetProfile.is_active) return res.status(400).json({ error: 'Choose an active employee account.' });
        patch.assigned_to = target;
        patch.assigned_employee_name = targetProfile.full_name;
        patch.employee_id = targetProfile.employee_id || oldLead.employee_id;
        patch.employee_designation = targetProfile.designation || oldLead.employee_designation;
      }
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'No valid changes were provided.' });
    const { data, error } = await db.from('leads').update(patch).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    await db.from('lead_audit_log').insert({
      lead_id: req.params.id,
      actor_user_id: req.user.id,
      action: 'lead_updated',
      old_values: { lead_status: oldLead.lead_status, enrolment_status: oldLead.enrolment_status, assigned_to: oldLead.assigned_to },
      new_values: patch
    });
    await queueExcelSync(db, req.params.id);
    res.json({ lead: data });
  } catch (error) { next(error); }
});

app.post('/api/leads/:id/notes', requireUser, requireLeadAccess, async (req, res, next) => {
  try {
    const note = safeText(req.body.note, 2000);
    const nextDate = safeText(req.body.nextFollowUpDate, 10);
    if (note.length < 2) return res.status(400).json({ error: 'Enter a follow-up note.' });
    if (nextDate && !/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) return res.status(400).json({ error: 'Enter a valid follow-up date.' });
    let leadQuery = req.db.from('leads').select('id,assigned_to').eq('id', req.params.id).maybeSingle();
    const { data: lead, error: leadError } = await leadQuery;
    if (leadError) throw leadError;
    if (!lead) return res.status(404).json({ error: 'Lead not found.' });
    if (req.profile.role === 'employee' && lead.assigned_to !== req.user.id) return res.status(403).json({ error: 'You can only add notes to leads assigned to you.' });
    const { data, error } = await req.db.from('lead_notes').insert({
      lead_id: req.params.id,
      note,
      next_follow_up_date: nextDate || null,
      created_by: req.user.id
    }).select('*').single();
    if (error) throw error;
    const leadPatch = { updated_at: new Date().toISOString() };
    if (nextDate) leadPatch.next_follow_up_date = nextDate;
    await req.db.from('leads').update(leadPatch).eq('id', req.params.id);
    await req.db.from('lead_audit_log').insert({ lead_id: req.params.id, actor_user_id: req.user.id, action: 'follow_up_note_added', old_values: {}, new_values: { note, next_follow_up_date: nextDate || null } });
    await queueExcelSync(req.db, req.params.id);
    res.status(201).json({ note: data });
  } catch (error) { next(error); }
});

app.get('/api/admin/export', requireUser, requireRole('admin'), async (req, res, next) => {
  try {
    const workbook = await createExcelWorkbook(req.db);
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Talent_Forge_Membership_Leads.xlsx"');
    res.send(Buffer.from(buffer));
  } catch (error) { next(error); }
});

function summariseLeads(rows) {
  const count = status => rows.filter(row => row.lead_status === status).length;
  const followUps = rows.filter(row => row.next_follow_up_date && row.next_follow_up_date <= new Date().toISOString().slice(0, 10)).length;
  const verified = rows.filter(row => row.enrolment_status === 'Enrolled — Verified' || row.enrolment_status === 'Enrolled - Verified').length;
  return {
    total: rows.length,
    new: count('New Enquiry'),
    contacted: count('Contacted'),
    interested: count('Interested'),
    followUpsPending: followUps,
    enrolmentsInProgress: count('Enrolment in Progress'),
    verifiedEnrolments: verified,
    conversionRate: rows.length ? Number(((verified / rows.length) * 100).toFixed(1)) : 0
  };
}

// Simple URL routes. The dashboard APIs still enforce login and role permissions.
const sendPage = (file) => (_req, res) => res.sendFile(path.join(PUBLIC_DIR, file));
app.get('/', sendPage('index.html'));
app.get('/membership', sendPage('membership.html'));
app.get('/admin/login', sendPage('admin-login.html'));
app.get('/admin/dashboard', sendPage('admin.html'));
app.get('/employee/login', sendPage('employee-login.html'));
app.get('/employee/dashboard', sendPage('employee.html'));
app.use(express.static(PUBLIC_DIR, { index: false, dotfiles: 'deny', etag: true, maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));

app.use((req, res) => res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html')));
app.use((error, req, res, _next) => {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}`, error?.message || error);
  const status = Number(error.status || error.statusCode || 500);
  res.status(status >= 400 && status < 600 ? status : 500).json({
    error: status >= 500 ? 'Something went wrong. The error has been logged. Please try again later.' : (error.message || 'Request failed.')
  });
});

async function startup() {
  const storagePath = process.env.EXCEL_OUTPUT_PATH || './storage/Talent_Forge_Membership_Leads.xlsx';
  if (String(process.env.EXCEL_SYNC_ENABLED || 'true').toLowerCase() === 'true') {
    try { fs.mkdirSync(path.dirname(path.resolve(storagePath)), { recursive: true }); }
    catch (error) { console.warn('Excel storage folder is not ready:', error.message); }
  }
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Talent Forge app running on http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    if (!process.env.SUPABASE_URL || !(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) console.warn('Supabase is not configured yet. Public pages still load; database features will not work.');
    if (String(process.env.PUBLIC_FORM_ENABLED || 'false').toLowerCase() !== 'true') console.warn('Public enquiry form is disabled. Set PUBLIC_FORM_ENABLED=true only after company setup and approval.');
  });

  let running = false;
  const tick = async () => {
    if (running || !process.env.SUPABASE_URL || !(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) return;
    running = true;
    try { await processAutomationJobs(getSupabase()); }
    catch (error) { console.error('Automation worker error:', error.message); }
    finally { running = false; }
  };
  const worker = setInterval(tick, 15000);
  worker.unref();
  if (process.env.SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    getSupabase().from('automation_jobs').update({ status: 'pending', next_attempt_at: new Date().toISOString(), last_error: 'Recovered after an interrupted processing attempt.' }).eq('status', 'processing').lt('updated_at', staleBefore)
      .then(({ error }) => { if (error) console.warn('Could not recover interrupted automation jobs:', error.message); else tick(); });
  }
  tick();
  const shutdown = () => { clearInterval(worker); server.close(() => process.exit(0)); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

if (require.main === module) startup();
module.exports = { app, publicConfig, summariseLeads };
