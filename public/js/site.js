(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const money = amount => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
  let config = null;
  let selectedDuration = 12;
  let formStarted = false;
  let formSubmitted = false;

  function getVisitorId() {
    let id = localStorage.getItem('tf_visitor_id');
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
      localStorage.setItem('tf_visitor_id', id);
    }
    return id;
  }

  function readAttribution() {
    const params = new URLSearchParams(location.search);
    let referrerHost = 'Direct';
    try { if (document.referrer) referrerHost = new URL(document.referrer).hostname; } catch (_) { referrerHost = 'Direct'; }
    const source = params.get('utm_source') || referrerHost;
    return {
      source: source.slice(0, 200),
      campaign: (params.get('utm_campaign') || '').slice(0, 200),
      visitorId: getVisitorId()
    };
  }

  async function track(eventName, extra = {}) {
    if (localStorage.getItem('tf_analytics_consent') !== 'accepted') return;
    const attribution = readAttribution();
    try {
      await fetch('/api/public/events', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventName, visitorId: attribution.visitorId, source: attribution.source, campaign: attribution.campaign, page: location.pathname + location.hash, ...extra }),
        keepalive: eventName === 'form_abandon'
      });
    } catch (_) { /* Analytics must never interrupt a visitor's form submission. */ }
  }

  async function loadPlans() {
    const grid = $('#plansGrid');
    if (!grid) return;
    try {
      const response = await fetch('/api/membership-plans');
      if (!response.ok) throw new Error('Unable to load plans');
      const payload = await response.json();
      window.talentForgePlans = payload;
      renderPlans(payload);
    } catch (_) {
      grid.innerHTML = '<div class="loading-card">Membership plans are temporarily unavailable. Please use the official Talent Forge website for current details.</div>';
    }
  }

  function renderPlans(payload) {
    const grid = $('#plansGrid');
    if (!grid) return;
    grid.innerHTML = payload.plans.map(plan => {
      const fee = selectedDuration === 6 ? plan.fee6Months : plan.fee12Months;
      const range = `${money(plan.monthlyProjectValueMin)} – ${money(plan.monthlyProjectValueMax)}`;
      return `<article class="plan-card ${plan.popular ? 'popular' : ''}">${plan.popular ? '<span class="popular-label">POPULAR</span>' : ''}<span class="plan-level">LEVEL ${plan.level.toString().padStart(2, '0')}</span><h3>${escapeText(plan.name)}</h3><div class="plan-price">${money(fee)}<small> / ${selectedDuration} months</small></div><p class="plan-summary">${escapeText(plan.summary)}</p><div class="plan-detail"><b>${range}</b>Illustrative monthly project-value range</div><a class="plan-cta" data-plan="${escapeText(plan.name)}" href="#enquiry">Enquire about ${escapeText(plan.name)} →</a></article>`;
    }).join('');
    $$('.plan-cta').forEach(link => link.addEventListener('click', () => {
      track('plan_click', { plan: link.dataset.plan });
      const duration = $('[name="preferredMembershipDuration"]');
      if (duration) duration.value = `${selectedDuration} months`;
    }));
  }

  function escapeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  async function loadConfig() {
    try {
      const response = await fetch('/api/config', { cache: 'no-store' });
      config = await response.json();
      $('#employeeName').textContent = config.employeeName || 'Talent Forge Associate';
      $('#employeeDesignation').textContent = config.employeeDesignation || 'Talent Forge Associate';
      const privacyLink = $('#privacyPolicyLink');
      if (privacyLink && config.privacyPolicyUrl) { privacyLink.href = config.privacyPolicyUrl; privacyLink.hidden = false; }
      const emailLink = $('#employeeEmailLink');
      const phoneLink = $('#employeePhoneLink');
      const whatsappLink = $('#employeeWhatsappLink');
      if (config.employeeEmail) { emailLink.href = `mailto:${config.employeeEmail}`; emailLink.classList.remove('disabled'); }
      else emailLink.classList.add('disabled');
      if (config.employeePhone) { phoneLink.href = `tel:${config.employeePhone.replace(/[^+\d]/g, '')}`; phoneLink.classList.remove('disabled'); }
      else phoneLink.classList.add('disabled');
      if (config.employeeWhatsapp) { whatsappLink.href = `https://wa.me/${config.employeeWhatsapp.replace(/\D/g, '')}`; whatsappLink.target = '_blank'; whatsappLink.rel = 'noopener'; whatsappLink.classList.remove('disabled'); }
      else whatsappLink.classList.add('disabled');
      if (config.employeeEmail || config.employeePhone || config.employeeWhatsapp) $('#contactHint').textContent = 'Use the verified contact option above to reach the assigned Talent Forge Associate.';
      const submit = $('#submitEnquiry');
      if (submit && !config.formEnabled) {
        submit.disabled = true;
        submit.textContent = 'Enquiry form not yet enabled';
        showMessage(config.formDisabledReason || 'The enquiry form is being configured by the company.', 'error');
      }
    } catch (_) {
      showMessage('The page loaded, but configuration could not be retrieved. Please refresh later.', 'error');
    }
  }

  function showMessage(message, type) {
    const element = $('#formMessage');
    if (!element) return;
    element.textContent = message;
    element.className = `form-message show ${type}`;
  }

  function setFieldError(name, message) {
    const field = $(`[name="${name}"]`)?.closest('.field');
    if (!field) return;
    field.classList.toggle('invalid', Boolean(message));
    const error = $('.field-error', field);
    if (error) error.textContent = message || '';
  }

  function setupForm() {
    const form = $('#enquiryForm');
    if (!form) return;
    const attribution = readAttribution();
    $('#visitorId').value = attribution.visitorId;
    $('#leadSource').value = attribution.source;
    $('#campaignSource').value = attribution.campaign;
    $('#referrer').value = document.referrer || '';
    form.addEventListener('focusin', () => {
      if (!formStarted) { formStarted = true; track('form_open'); }
    }, { once: true });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const data = Object.fromEntries(new FormData(form).entries());
      data.privacyConsent = form.elements.privacyConsent.checked;
      data.visitorId = attribution.visitorId;
      data.leadSource = attribution.source;
      data.campaignSource = attribution.campaign;
      data.referrer = document.referrer || '';
      const submit = $('#submitEnquiry');
      submit.disabled = true;
      submit.textContent = 'Submitting…';
      showMessage('', '');
      $$('.field').forEach(field => field.classList.remove('invalid'));
      try {
        const response = await fetch('/api/public/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        const result = await response.json();
        if (!response.ok) {
          if (result.fields) Object.entries(result.fields).forEach(([name, message]) => setFieldError(name, message));
          throw new Error(result.error || 'Unable to submit your enquiry.');
        }
        formSubmitted = true;
        await track('form_submit');
        form.reset();
        showMessage(`${result.message} Your enquiry reference ID is ${result.leadId}. A confirmation email will contain the detailed membership page link. Enquiry submission is not membership enrolment.`, 'success');
        submit.textContent = 'Enquiry submitted ✓';
      } catch (error) {
        showMessage(error.message, 'error');
        submit.disabled = false;
        submit.textContent = 'Submit membership enquiry →';
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && formStarted && !formSubmitted) track('form_abandon');
    });
  }

  function setupSectionAnalytics() {
    if (typeof IntersectionObserver === 'undefined') return;
    const targets = ['#plans', '#who-can-join', '#how-it-works', '#faq'].map(selector => $(selector)).filter(Boolean);
    const seen = new Set();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !seen.has(entry.target.id)) {
          seen.add(entry.target.id);
          track('section_view', { section: entry.target.id });
        }
      });
    }, { threshold: 0.35 });
    targets.forEach(target => observer.observe(target));
  }

  function setupAnalyticsConsent() {
    const banner = $('#cookieBanner');
    if (!banner) return;
    if (!localStorage.getItem('tf_analytics_consent')) banner.hidden = false;
    $('#acceptAnalytics').addEventListener('click', () => {
      localStorage.setItem('tf_analytics_consent', 'accepted'); banner.hidden = true; track('page_view');
    });
    $('#declineAnalytics').addEventListener('click', () => {
      localStorage.setItem('tf_analytics_consent', 'declined'); banner.hidden = true;
    });
    if (localStorage.getItem('tf_analytics_consent') === 'accepted') track('page_view');
  }

  function setupNavigation() {
    const toggle = $('#menuToggle');
    const nav = $('#mainNav');
    if (toggle && nav) toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    $$('#mainNav a').forEach(link => link.addEventListener('click', () => nav?.classList.remove('open')));
    $$('.duration-button').forEach(button => button.addEventListener('click', () => {
      selectedDuration = Number(button.dataset.duration);
      $$('.duration-button').forEach(item => { item.classList.toggle('active', item === button); item.setAttribute('aria-pressed', String(item === button)); });
      if (window.talentForgePlans) renderPlans(window.talentForgePlans);
    }));
    $('#year').textContent = new Date().getFullYear();
  }

  document.addEventListener('DOMContentLoaded', () => {
    setupNavigation(); setupAnalyticsConsent(); setupSectionAnalytics(); setupForm(); loadConfig(); loadPlans();
  });
})();
