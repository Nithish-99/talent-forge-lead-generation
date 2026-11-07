(() => {
  const money = amount => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
  const escapeText = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  document.addEventListener('DOMContentLoaded', async () => {
    const year = document.querySelector('#year'); if (year) year.textContent = new Date().getFullYear();
    try {
      const response = await fetch('/api/membership-plans');
      if (!response.ok) throw new Error('Could not retrieve plans');
      const payload = await response.json();
      document.querySelector('#comparisonRows').innerHTML = payload.plans.map(plan => `<tr><td>${escapeText(plan.name)}</td><td>${money(plan.fee6Months)}</td><td>${money(plan.fee12Months)}</td><td>${money(plan.monthlyProjectValueMin)} – ${money(plan.monthlyProjectValueMax)}</td></tr>`).join('');
    } catch (_) {
      document.querySelector('#comparisonRows').innerHTML = '<tr><td colspan="4">Membership information is temporarily unavailable. Please check the official website.</td></tr>';
    }
  });
})();
