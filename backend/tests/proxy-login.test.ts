import { chromium } from 'playwright-core';

const SESSION_ID = process.env.SESSION_ID || 'f352010c-ef7f-4270-aef0-723600bf4483';
const HUB_URL = process.env.HUB_URL || 'http://127.0.0.1:3001';
const PROXY_BASE = `${HUB_URL}/api/sessions/${SESSION_ID}/proxy/3000`;

async function run() {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Collect console logs
  const consoleLogs: string[] = [];
  page.on('console', (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));

  // Track network requests for debugging
  const rscRequests: { url: string; status: number; headers: Record<string, string> }[] = [];
  page.on('response', (response) => {
    const url = response.url();
    if (url.includes('/proxy/3000') || url.includes('supabase')) {
      rscRequests.push({
        url: url.replace(HUB_URL, ''),
        status: response.status(),
        headers: response.headers(),
      });
    }
  });

  try {
    // 1. Navigate to login page through proxy
    console.log(`Navigating to: ${PROXY_BASE}/login`);
    await page.goto(`${PROXY_BASE}/login`, { waitUntil: 'networkidle', timeout: 30000 });
    console.log(`✓ Page loaded. URL: ${page.url()}`);
    console.log(`  window.location.pathname via JS: ${await page.evaluate(() => window.location.pathname)}`);

    // 2. Check login form is present
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');

    if (!(await emailInput.isVisible({ timeout: 10000 }))) {
      console.log('✗ Login form not found. Page content:');
      console.log((await page.content()).substring(0, 500));
      return;
    }
    console.log('✓ Login form visible');

    // 3. Fill in credentials
    await emailInput.fill('observer@bstat.dev');
    await passwordInput.fill('test1234');
    console.log('✓ Credentials filled');

    // 4. Click submit — capture ALL network activity immediately
    const postClickRequests: { method: string; url: string; headers: Record<string, string> }[] = [];
    const postClickResponses: { url: string; status: number; statusText: string }[] = [];
    page.on('request', (req) => {
      postClickRequests.push({ method: req.method(), url: req.url().replace(HUB_URL, ''), headers: req.headers() });
    });
    page.on('response', (res) => {
      postClickResponses.push({ url: res.url().replace(HUB_URL, ''), status: res.status(), statusText: res.statusText() });
    });
    page.on('requestfailed', (req) => {
      console.log(`  REQUEST FAILED: ${req.method()} ${req.url().replace(HUB_URL, '')} — ${req.failure()?.errorText}`);
    });

    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();
    console.log('✓ Submit clicked, waiting for response...');

    // 5. Wait and track URL changes over time
    for (let sec = 1; sec <= 10; sec++) {
      await page.waitForTimeout(1000);
      const url = await page.evaluate(() => window.location.pathname);
      const text = await page.evaluate(() => document.body?.innerText?.substring(0, 100) || '');
      const hasLogin = text.includes('Sign in') || text.includes('Login') || text.includes('Email');
      const hasObserver = text.includes('Observer');
      const shortText = text.replace(/\s+/g, ' ').substring(0, 150);
      console.log(`  [${sec}s] path=${url.replace(/\/api\/sessions\/[^/]+\/proxy\/3000/, '')} login=${hasLogin} observer=${hasObserver} text="${shortText}"`);
      if (hasObserver && !url.includes('/login')) {
        console.log('  ✓ Detected successful redirect!');
        break;
      }
    }

    const currentUrl = page.url();
    const currentPathname = await page.evaluate(() => window.location.pathname);
    console.log(`\n--- After login ---`);
    console.log(`URL: ${currentUrl}`);
    console.log(`pathname: ${currentPathname}`);

    // Check if we redirected away from login
    const stillOnLogin = currentPathname.includes('/login');

    if (stillOnLogin) {
      console.log('✗ FAILED: Still on login page after submit');

      // Check for errors on page
      const errorEl = page.locator('.text-destructive, [class*="error"], [class*="Error"]');
      if (await errorEl.count() > 0) {
        console.log(`  Error on page: ${await errorEl.first().textContent()}`);
      }

      // Check cookies
      const cookies = await context.cookies();
      console.log(`  Cookies set: ${cookies.length}`);
      for (const c of cookies) {
        console.log(`    ${c.name} = ${c.value.substring(0, 30)}... (path=${c.path})`);
      }

      // Check if page content changed (authenticated but not redirected)
      const pageText = await page.evaluate(() => document.body.innerText);
      const hasObserver = pageText.includes('Observer');
      console.log(`  Contains "Observer" text: ${hasObserver}`);

      // Try manual refresh
      console.log('\n  Trying manual refresh...');
      await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
      const afterRefreshUrl = page.url();
      const afterRefreshPath = await page.evaluate(() => window.location.pathname);
      console.log(`  After refresh URL: ${afterRefreshUrl}`);
      console.log(`  After refresh path: ${afterRefreshPath}`);
      const afterRefreshText = await page.evaluate(() => document.body.innerText);
      console.log(`  Contains "Observer" after refresh: ${afterRefreshText.includes('Observer')}`);
    } else {
      console.log('✓ SUCCESS: Redirected away from login!');

      // Verify authenticated content
      const pageText = await page.evaluate(() => document.body.innerText);
      console.log(`  Contains "Observer": ${pageText.includes('Observer')}`);
    }

    // Print ALL post-click network activity
    console.log('\n--- Network requests AFTER submit click ---');
    for (const r of postClickRequests) {
      const rsc = r.headers['rsc'] ? ' [RSC]' : '';
      const nextUrl = r.headers['next-url'] ? ` Next-URL=${r.headers['next-url']}` : '';
      console.log(`  → ${r.method} ${r.url.substring(0, 120)}${rsc}${nextUrl}`);
    }
    console.log('\n--- Network responses AFTER submit click ---');
    for (const r of postClickResponses) {
      console.log(`  ← ${r.status} ${r.url.substring(0, 120)}`);
    }

    // Print console logs (all, not just errors)
    console.log('\n--- Console output ---');
    for (const l of consoleLogs.slice(-20)) {
      console.log(`  ${l.substring(0, 300)}`);
    }

  } catch (err) {
    console.error('Test error:', err);
    await page.screenshot({ path: '/tmp/proxy-login-error.png' });
    console.log('Screenshot saved to /tmp/proxy-login-error.png');
  } finally {
    await browser.close();
  }
}

run().catch(console.error);
