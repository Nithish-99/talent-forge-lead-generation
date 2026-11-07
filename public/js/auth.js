(() => {
  const expectedRole = document.body.dataset.role;
  const tokenKey = 'tf_access_token';
  const showMessage = (text, type = 'error') => {
    const box = document.querySelector('#loginMessage');
    box.textContent = text; box.className = `portal-message show ${type}`;
  };
  document.addEventListener('DOMContentLoaded', async () => {
    const form = document.querySelector('#loginForm');
    const button = document.querySelector('#loginButton');
    let config;
    try {
      const response = await fetch('/api/config');
      config = await response.json();
      if (!config.supabaseUrl || !config.supabasePublicKey) showMessage('The login system is not configured yet. Ask the project administrator to complete Supabase setup.');
    } catch (_) { showMessage('Could not load application configuration. Refresh the page.'); }

    const existing = sessionStorage.getItem(tokenKey);
    if (existing) {
      try {
        const response = await fetch('/api/me', { headers: { Authorization: `Bearer ${existing}` } });
        const result = await response.json();
        if (response.ok && result.profile.role === expectedRole) location.href = expectedRole === 'admin' ? '/admin/dashboard' : '/employee/dashboard';
      } catch (_) { /* user can sign in again below */ }
    }

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!config?.supabaseUrl || !config?.supabasePublicKey) return showMessage('Supabase settings are missing.');
      const data = new FormData(form);
      const email = String(data.get('email') || '').trim().toLowerCase();
      const password = String(data.get('password') || '');
      button.disabled = true; button.textContent = 'Signing in…';
      try {
        const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', apikey: config.supabasePublicKey },
          body: JSON.stringify({ email, password })
        });
        const result = await response.json();
        if (!response.ok || !result.access_token) throw new Error(result.msg || result.message || result.error_description || 'Email or password is incorrect.');
        const token = result.access_token;
        const meResponse = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } });
        const me = await meResponse.json();
        if (!meResponse.ok) throw new Error(me.error || 'Your account is not authorised.');
        if (me.profile.role !== expectedRole) throw new Error(`This account is registered as ${me.profile.role}. Use the correct portal.`);
        sessionStorage.setItem(tokenKey, token);
        location.href = expectedRole === 'admin' ? '/admin/dashboard' : '/employee/dashboard';
      } catch (error) {
        showMessage(error.message || 'Sign in failed.');
        button.disabled = false; button.textContent = expectedRole === 'admin' ? 'Sign in to Admin Dashboard →' : 'Sign in to Employee Dashboard →';
      }
    });
  });
})();
