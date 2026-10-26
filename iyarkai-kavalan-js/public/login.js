const form = document.getElementById('loginForm');
const errorBox = document.getElementById('loginError');
const toggle = document.getElementById('togglePassword');
toggle?.addEventListener('click', () => {
  const input = document.getElementById('password');
  const visible = input.type === 'password';
  input.type = visible ? 'text' : 'password';
  toggle.textContent = visible ? 'Hide' : 'Show';
  toggle.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
});
form?.addEventListener('submit', async (event) => {
  event.preventDefault(); errorBox.textContent = '';
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true; button.innerHTML = 'Signing in…';
  try {
    const response = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: form.email.value, password: form.password.value }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to sign in.');
    window.location.href = data.redirect || '/index.html';
  } catch (error) {
    errorBox.textContent = error.message || 'Could not connect to the server.';
    button.disabled = false; button.innerHTML = 'Sign in <span>↗</span>';
  }
});
