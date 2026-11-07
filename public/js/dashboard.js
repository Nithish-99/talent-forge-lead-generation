(() => {
  const role = document.body.dataset.role;
  const tokenKey = 'tf_access_token';
  let token = sessionStorage.getItem(tokenKey);
  let selectedLead = null;
  let employees = [];
  let leads = [];
  const $ = selector => document.querySelector(selector);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const dateText = value => value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(value)) : '—';
  const dateTimeText = value => value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(value)) : '—';

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token}`, ...(options.body && typeof options.body !== 'string' ? { 'Content-Type': 'application/json' } : {}) } });
    let data;
    const contentType = response.headers.get('content-type') || '';
    data = contentType.includes('application/json') ? await response.json() : await response.blob();
    if (response.status === 401) { sessionStorage.removeItem(tokenKey); location.href = role === 'admin' ? '/admin/login' : '/employee/login'; }
    if (!response.ok) throw new Error(data?.error || 'Request failed.');
    return data;
  }

  function setMessage(message, type = 'error') {
    const box = $('#modalMessage');
    box.textContent = message; box.className = `portal-message show ${type}`;
  }

  async function ensureAccess() {
    if (!token) { location.href = role === 'admin' ? '/admin/login' : '/employee/login'; return false; }
    const result = await api('/api/me');
    if (result.profile.role !== role) { sessionStorage.removeItem(tokenKey); location.href = role === 'admin' ? '/admin/login' : '/employee/login'; return false; }
    $('#profileName').textContent = result.profile.full_name || result.user.email;
    return true;
  }

  async function loadSummary() {
    const summary = await api(role === 'admin' ? '/api/admin/summary' : '/api/employee/summary');
    $('#statTotal').textContent = summary.total;
    $('#statNew').textContent = summary.new;
    $('#statInterested').textContent = summary.interested;
    $('#statFollowups').textContent = summary.followUpsPending;
    $('#statVerified').textContent = summary.verifiedEnrolments;
    if (role === 'admin') {
      $('#statInProgress').textContent = summary.enrolmentsInProgress;
      $('#statConversion').textContent = `${summary.conversionRate}%`;
      $('#conversionBar').style.width = `${Math.min(100, summary.conversionRate)}%`;
      $('#analyticsVisitors').textContent = summary.analytics.visitors;
      $('#analyticsViews').textContent = summary.analytics.pageViews;
      $('#analyticsForms').textContent = summary.analytics.formOpens;
      $('#analyticsPlanClicks').textContent = summary.analytics.planClicks;
      $('#analyticsPlanViews').textContent = summary.analytics.planSectionViews;
      $('#analyticsAbandons').textContent = summary.analytics.formAbandons;
      $('#analyticsSubmissions').textContent = summary.analytics.submissions;
      $('#sourceList').innerHTML = summary.analytics.sources.length ? summary.analytics.sources.map(item => {
        const max = Math.max(1, ...summary.analytics.sources.map(source => source.views));
        return `<div class="source-row"><span>${escapeHtml(item.source)}</span><div class="source-bar"><span style="width:${Math.round(item.views / max * 100)}%"></span></div><b class="source-count">${item.views}</b></div>`;
      }).join('') : '<p class="empty-state">No analytics yet. Anonymous analytics are recorded only when a visitor accepts the analytics option.</p>';
      const automation = summary.automation || { pending: 0, failed: 0, completed: 0, latestFailures: [] };
      $('#campaignList').innerHTML = (summary.analytics.campaigns || []).length ? summary.analytics.campaigns.map(item => `<div class="source-row"><span>${escapeHtml(item.campaign)}</span><div class="source-bar"><span style="width:100%"></span></div><b class="source-count">${item.views}</b></div>`).join('') : '<p class="empty-state">No campaign-tagged visits recorded yet.</p>';
      $('#automationStatus').innerHTML = `<div class="automation-counts"><span>Completed: <b>${automation.completed}</b></span><span>Pending / processing: <b>${automation.pending}</b></span><span class="automation-failed">Failed: <b>${automation.failed}</b></span></div>${automation.latestFailures.length ? automation.latestFailures.map(job => `<div class="automation-error"><b>${escapeHtml(job.job_type)}</b><span>${escapeHtml(job.last_error || 'No error detail')}</span></div>`).join('') : '<p class="empty-state">No failed automation jobs in the latest 100 jobs.</p>'}`;
    } else {
      $('#statContacted').textContent = summary.contacted;
    }
  }

  async function loadEmployees() {
    if (role !== 'admin') return;
    const result = await api('/api/admin/employees');
    employees = result.employees || [];
    $('#assignEmployee').innerHTML = '<option value="">Select employee</option>' + employees.map(employee => `<option value="${escapeHtml(employee.user_id)}">${escapeHtml(employee.full_name)}${employee.employee_id ? ` — ${escapeHtml(employee.employee_id)}` : ''}</option>`).join('');
  }

  async function loadLeads() {
    const q = $('#searchInput').value.trim();
    const status = $('#statusFilter').value;
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    if (role === 'admin') {
      const from = $('#fromDate')?.value; const to = $('#toDate')?.value;
      if (from) params.set('from', from); if (to) params.set('to', to);
    }
    const result = await api(`${role === 'admin' ? '/api/admin/leads' : '/api/employee/leads'}?${params.toString()}`);
    leads = result.leads || [];
    renderLeads();
  }

  function renderLeads() {
    const body = $('#leadRows');
    if (!leads.length) {
      body.innerHTML = `<tr><td colspan="${role === 'admin' ? 6 : 5}" class="empty-state">No enquiries found for these filters.</td></tr>`;
      $('#tableCount').textContent = '0 leads';
      return;
    }
    body.innerHTML = leads.map(lead => `<tr>
      <td><div class="lead-person"><span class="lead-id">${escapeHtml(lead.lead_id)}</span><b>${escapeHtml(lead.full_name)}</b><small>${escapeHtml(lead.email)} · ${escapeHtml(lead.mobile)}</small></div></td>
      <td>${escapeHtml(lead.professional_category)}</td>
      ${role === 'admin' ? `<td>${escapeHtml(lead.assigned_employee_name || 'Unassigned')}</td>` : ''}
      <td>${dateTimeText(lead.created_at || lead.submitted_at)}</td>
      <td><span class="status-pill" data-status="${escapeHtml(lead.lead_status)}">${escapeHtml(lead.lead_status)}</span></td>
      <td><button class="table-action" data-open-lead="${escapeHtml(lead.id)}">View / Update</button></td>
    </tr>`).join('');
    $('#tableCount').textContent = `Showing ${leads.length} lead${leads.length === 1 ? '' : 's'}${leads.length >= (role === 'admin' ? 1000 : 300) ? ' — list limit reached; refine your search' : ''}`;
    $$('[data-open-lead]').forEach(button => button.addEventListener('click', () => openLead(button.dataset.openLead)));
  }

  const $$ = selector => [...document.querySelectorAll(selector)];
  async function openLead(id) {
    try {
      const result = await api(`/api/leads/${encodeURIComponent(id)}`);
      selectedLead = result.lead;
      const lead = selectedLead;
      $('#detailTitle').textContent = `${lead.full_name} · ${lead.lead_id}`;
      const fields = [
        ['Email', lead.email], ['Mobile', lead.mobile], ['Professional category', lead.professional_category], ['Primary skills', lead.primary_skills],
        ['Experience level', lead.experience_level], ['Current status', lead.current_status], ['Preferred duration', lead.preferred_membership_duration],
        ['Additional questions', lead.additional_questions], ['Assigned employee', lead.assigned_employee_name], ['Employee ID', lead.employee_id],
        ['Lead source', lead.lead_source], ['Campaign source', lead.campaign_source], ['Submitted', dateTimeText(lead.created_at)],
        ['Enrolment status', lead.enrolment_status]
      ];
      $('#leadDetails').innerHTML = fields.map(([label, value]) => `<div class="detail-item"><small>${escapeHtml(label)}</small><b>${escapeHtml(value || '—')}</b></div>`).join('');
      $('#editStatus').value = lead.lead_status;
      if (role === 'admin') {
        $('#editEnrolment').value = lead.enrolment_status || 'Not Started';
        $('#assignEmployee').value = lead.assigned_to || '';
      }
      $('#noteHistory').innerHTML = (lead.lead_notes || []).length ? lead.lead_notes.map(note => `<div class="note-item"><p>${escapeHtml(note.note)}</p><small>${dateTimeText(note.created_at)}${note.next_follow_up_date ? ` · Next follow-up: ${dateText(note.next_follow_up_date)}` : ''}</small></div>`).join('') : '<p class="empty-state">No follow-up notes yet.</p>';
      $('#auditHistory').innerHTML = (result.audit || []).length ? result.audit.map(item => `<div class="note-item"><p>${escapeHtml(item.action.replaceAll('_', ' '))}</p><small>${dateTimeText(item.created_at)}</small></div>`).join('') : '<p class="empty-state">No recorded updates yet.</p>';
      $('#newNote').value = ''; $('#nextFollowUp').value = ''; $('#modalMessage').className = 'portal-message';
      $('#detailModal').hidden = false;
      document.body.style.overflow = 'hidden';
    } catch (error) { alert(error.message); }
  }

  async function saveLead() {
    if (!selectedLead) return;
    const body = { leadStatus: $('#editStatus').value };
    if (role === 'admin') {
      body.enrolmentStatus = $('#editEnrolment').value;
      body.assignedTo = $('#assignEmployee').value;
    }
    try {
      await api(`/api/leads/${encodeURIComponent(selectedLead.id)}`, { method: 'PATCH', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
      setMessage('Lead information updated.', 'success');
      await Promise.all([loadLeads(), loadSummary()]);
      const refreshed = await api(`/api/leads/${encodeURIComponent(selectedLead.id)}`);
      selectedLead = refreshed.lead;
    } catch (error) { setMessage(error.message); }
  }

  async function addNote() {
    if (!selectedLead) return;
    const note = $('#newNote').value.trim();
    const nextFollowUpDate = $('#nextFollowUp').value;
    if (note.length < 2) return setMessage('Write a follow-up note first.');
    try {
      await api(`/api/leads/${encodeURIComponent(selectedLead.id)}/notes`, { method: 'POST', body: JSON.stringify({ note, nextFollowUpDate }), headers: { 'Content-Type': 'application/json' } });
      setMessage('Follow-up note saved.', 'success');
      await openLead(selectedLead.id);
      await loadLeads(); await loadSummary();
    } catch (error) { setMessage(error.message); }
  }

  async function downloadExcel() {
    try {
      const response = await fetch('/api/admin/export', { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) {
        const result = await response.json(); throw new Error(result.error || 'Excel export failed.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = 'Talent_Forge_Membership_Leads.xlsx';
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    } catch (error) { alert(error.message); }
  }

  function setupEvents() {
    $('#signOut').addEventListener('click', () => { sessionStorage.removeItem(tokenKey); location.href = role === 'admin' ? '/admin/login' : '/employee/login'; });
    $('#refreshButton').addEventListener('click', refreshAll);
    $('#searchButton').addEventListener('click', loadLeads);
    $('#searchInput').addEventListener('keydown', event => { if (event.key === 'Enter') loadLeads(); });
    $('#statusFilter').addEventListener('change', loadLeads);
    $('#closeModal').addEventListener('click', closeModal);
    $('#detailModal').addEventListener('click', event => { if (event.target.id === 'detailModal') closeModal(); });
    $('#saveLead').addEventListener('click', saveLead);
    $('#addNote').addEventListener('click', addNote);
    if (role === 'admin') $('#exportButton').addEventListener('click', downloadExcel);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });
  }
  function closeModal() { $('#detailModal').hidden = true; document.body.style.overflow = ''; }

  async function refreshAll() {
    try { await Promise.all([loadSummary(), loadLeads()]); }
    catch (error) { console.error(error); alert(error.message); }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    setupEvents();
    try {
      const ok = await ensureAccess(); if (!ok) return;
      if (role === 'admin') await loadEmployees();
      await refreshAll();
      const leadId = new URLSearchParams(location.search).get('lead');
      if (leadId) openLead(leadId);
    } catch (error) {
      console.error(error); alert(error.message || 'Unable to load dashboard.');
    }
  });
})();
