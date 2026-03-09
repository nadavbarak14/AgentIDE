export function getLoginPageHtml(error?: string): string {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Adyx — Access Required</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #e5e5e5;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .container {
      width: 100%;
      max-width: 480px;
    }
    h1 {
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 8px;
      color: #fafafa;
    }
    .subtitle {
      color: #737373;
      font-size: 0.875rem;
      margin-bottom: 32px;
    }
    .form-group {
      margin-bottom: 16px;
    }
    label {
      display: block;
      font-size: 0.875rem;
      color: #a3a3a3;
      margin-bottom: 8px;
    }
    input {
      width: 100%;
      max-width: 500px;
      padding: 12px 16px;
      background: #171717;
      border: 1px solid #262626;
      border-radius: 8px;
      color: #fafafa;
      font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
      font-size: 0.875rem;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus {
      border-color: #525252;
    }
    input::placeholder {
      color: #525252;
    }
    button {
      width: 100%;
      padding: 12px;
      min-height: 44px;
      background: #fafafa;
      color: #0a0a0a;
      border: none;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover { background: #e5e5e5; }
    button:active { background: #d4d4d4; }
    button:disabled {
      background: #262626;
      color: #525252;
      cursor: not-allowed;
    }
    .error {
      background: #1c0a0a;
      border: 1px solid #7f1d1d;
      color: #fca5a5;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 0.875rem;
      margin-bottom: 16px;
      display: ${error ? 'block' : 'none'};
    }
    .spinner {
      display: none;
      width: 16px;
      height: 16px;
      border: 2px solid #525252;
      border-top-color: #0a0a0a;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
      margin: 0 auto;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="container">
    <h1>Adyx</h1>
    <p class="subtitle">Paste your access key to continue</p>
    <div id="error" class="error">${error || ''}</div>
    <form id="loginForm">
      <div class="form-group">
        <label for="accessKey">Access Key</label>
        <input
          type="text"
          id="accessKey"
          name="accessKey"
          placeholder="Paste your access key here..."
          autocomplete="off"
          spellcheck="false"
          autofocus
          required
        />
      </div>
      <button type="submit" id="submitBtn">
        <span id="btnText">Authenticate</span>
        <div id="btnSpinner" class="spinner"></div>
      </button>
    </form>
  </div>
  <script>
    const form = document.getElementById('loginForm');
    const errorEl = document.getElementById('error');
    const btnText = document.getElementById('btnText');
    const btnSpinner = document.getElementById('btnSpinner');
    const submitBtn = document.getElementById('submitBtn');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const accessKey = document.getElementById('accessKey').value.trim();
      if (!accessKey) return;

      errorEl.style.display = 'none';
      btnText.style.display = 'none';
      btnSpinner.style.display = 'block';
      submitBtn.disabled = true;

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessKey }),
        });
        const data = await res.json();
        if (res.ok && data.authenticated) {
          window.location.href = '/';
        } else {
          errorEl.textContent = data.error || 'Authentication failed';
          errorEl.style.display = 'block';
        }
      } catch {
        errorEl.textContent = 'Connection error. Please try again.';
        errorEl.style.display = 'block';
      } finally {
        btnText.style.display = 'inline';
        btnSpinner.style.display = 'none';
        submitBtn.disabled = false;
      }
    });
  </script>
</body>
</html>`;
}
