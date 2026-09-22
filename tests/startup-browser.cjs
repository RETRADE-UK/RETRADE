/* Isolated UI regression tests. All requests are fulfilled from this checkout
 * or blocked; authentication and data are synthetic. Never contact Supabase. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const session = { user: { id: 'ui-test', email: 'ui@example.test', user_metadata: { full_name: 'Test User' } } };

function mockAuth(initialSession) {
  window.__fixtureSession = initialSession;
  window.__fixtureSignInCalls = 0;
  const listeners = [];
  window.supabase = { createClient() { return { auth: {
    async getSession() { await new Promise(r => setTimeout(r, 100)); return { data: { session: window.__fixtureSession } }; },
    onAuthStateChange(fn) { listeners.push(fn); return { data: { subscription: { unsubscribe() {} } } }; },
    async signInWithPassword({ password }) {
      window.__fixtureSignInCalls++;
      await new Promise(r => setTimeout(r, 100));
      if (password === 'bad') return { error: { message: 'Invalid login credentials' } };
      window.__fixtureSession = { user: { id: 'ui-test', email: 'ui@example.test', user_metadata: { full_name: 'Test User' } } };
      listeners.forEach(fn => fn('SIGNED_IN', window.__fixtureSession));
      // Reproduce the accepted-session/transient-response race.
      return { error: { message: 'Network error' } };
    }
  } }; } };
}

const fixture = `
loadFromSupabase=async function(){
  await new Promise(r=>setTimeout(r,300));
  DB=_buildPreviewDB();DB._userOwned=true;_previewMode=true;SUMMARY_PERIOD='30d';
  const key=currentMonthKey();DB[key]=DB[key]||[];
  for(let i=0;i<24;i++){
    const date=new Date();date.setDate(date.getDate()-(i%7));const ds=date.toISOString().slice(0,10);
    DB[key].push({id:'audit-'+i,item:'Test stock '+i,state:'sold',category:'Electronics',dateSourced:ds,dateListed:ds,dateSold:ds,salePrice:100+i*10,costPrice:40+i,postage:0,shippingCost:0,packagingCost:0,promoPercent:0,listingFee:0,salePlatform:'ebay_biz',returnHistory:[],parts:[]});
  }
};
_hydrateUserSettings=async()=>{};_startRealtimeSync=async()=>{};_stopRealtimeSync=()=>{};
saveDB=()=>{};_readSyncClockRevision=async()=>{};_refreshCloudOnResume=async()=>false;
`;

async function open(browser, { signedIn = false, mobile = false, reduced = false, slowCore = false, failedCore = false } = {}) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, isMobile: mobile, hasTouch: mobile, reducedMotion: reduced ? 'reduce' : 'no-preference', serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('/supabase-js@')) return route.fulfill({ contentType: 'text/javascript', body: `(${mockAuth.toString()})(${JSON.stringify(signedIn ? session : null)});` });
    if (url.origin !== 'http://retrade.test') return route.abort();
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/ integrity="[^"]*"/g, '') });
    const file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: 'Missing test asset' });
    if (url.pathname === '/app-core.js') {
      if (failedCore) return route.abort();
      if (slowCore) await new Promise(r => setTimeout(r, 6000));
      return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(file, 'utf8') + fixture });
    }
    const type = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }[path.extname(file)] || 'application/octet-stream';
    return route.fulfill({ contentType: type, body: fs.readFileSync(file) });
  });
  await page.goto('http://retrade.test/', { waitUntil: 'domcontentloaded' });
  return { page, context, errors };
}
async function settled(page) {
  await page.waitForFunction(() => window.__rtFeaturesReady && window.__rtLaunchSettled && !document.documentElement.classList.contains('rt-app-cold'), null, { timeout: 15000 });
}
async function checkFigures(page) {
  const values = await page.evaluate(() => [...document.querySelectorAll('#p-summary [data-cv]')].filter(e => e.getClientRects().length).map(e => ({ value: e.textContent, expected: (_CV_FMT[e.dataset.cvFmt] || _CV_FMT.k)(Number(e.dataset.cv)), target: Number(e.dataset.cv) })));
  assert(values.some(v => v.target > 1000), 'Populated fixture must exercise number animation');
  for (const value of values) assert.equal(value.value, value.expected, 'KPI must settle at its exact formatted target');
}
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    for (const options of [{ signedIn: true }, { signedIn: true, mobile: true }, { signedIn: true, reduced: true }]) {
      const { page, context, errors } = await open(browser, options);
      await settled(page);
      await checkFigures(page);
      assert.equal(await page.locator('.page.on').getAttribute('id'), 'p-summary');
      const chart = options.mobile ? '#summary-chart-svg-mobile' : '#summary-chart-svg';
      assert(await page.locator(chart + ' rect').count() > 0, 'Visible chart must render');
      if (!options.mobile && !options.reduced) {
        assert.equal(await page.locator('#summary-chart-svg-mobile rect').count(), 0, 'Hidden chart should defer SVG work');
        for (const tab of ['stock', 'monthly', 'accounts', 'summary']) {
          await page.evaluate(tab => goToTab(tab), tab);
          await page.waitForFunction(tab => document.querySelector('.page.on')?.id === 'p-' + tab, tab);
          await page.waitForFunction(() => (document.querySelector('.page.on')?.innerText || '').length > 50, null, { timeout: 5000 });
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForFunction(() => document.querySelector('#summary-chart-svg-mobile rect'));
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.waitForFunction(() => document.querySelector('#summary-chart-svg rect'));
        await page.evaluate(session => window.__rtAuthHandoff(session), session);
        assert.equal(await page.evaluate(() => document.documentElement.classList.contains('rt-app-cold')), false, 'Repeated session event must not restart cold motion');
      }
      assert.deepEqual(errors, []);
      console.log('PASS authenticated', JSON.stringify(options));
      await context.close();
    }
    const login = await open(browser);
    await settled(login.page);
    assert.equal(await login.page.evaluate(() => window.__rtLaunchPerf.brandHandoff), 'auth', 'Welcome must hand off to login rather than a fallback');
    await login.page.locator('#auth-email').fill('ui@example.test');
    await login.page.locator('#auth-pass').fill('bad');
    await login.page.evaluate(() => doSignIn());
    assert(await login.page.locator('#auth-error').isVisible(), 'Invalid credentials must still show an error');
    await login.page.locator('#auth-pass').fill('accepted');
    await login.page.evaluate(() => Promise.all([doSignIn(), doSignIn()]));
    await settled(login.page);
    await checkFigures(login.page);
    assert.equal(await login.page.evaluate(() => window.__fixtureSignInCalls), 2, 'Duplicate submit must produce one request');
    assert.equal(await login.page.locator('#auth-error').isVisible(), false, 'Accepted session must not show a false failure');
    assert.deepEqual(login.errors, []);
    console.log('PASS login handoff, rejected credentials, duplicate submit and transient response');
    await login.context.close();
    const slow = await open(browser, { slowCore: true });
    await slow.page.waitForTimeout(4500);
    assert.equal(await slow.page.locator('#rt-launch-brand').evaluate(e => getComputedStyle(e).opacity), '1', 'Slow core load must not uncover the app');
    await settled(slow.page);
    assert.equal(await slow.page.evaluate(() => window.__rtLaunchPerf.brandHandoff), 'auth');
    assert.deepEqual(slow.errors, []);
    console.log('PASS slow startup retains the welcome until auth is ready');
    await slow.context.close();
    const failed = await open(browser, { failedCore: true });
    await failed.page.getByRole('button', { name: 'Unable to load RETRADE. Tap to retry.' }).click({ trial: true });
    assert.deepEqual(failed.errors, []);
    console.log('PASS failed core load exposes an accessible retry');
    await failed.context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
