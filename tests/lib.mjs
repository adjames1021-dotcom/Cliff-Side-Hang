// Shared helpers for the Playwright checks in this folder.
// Set LOCAL_CDN=/path/to/three-package to serve three.js from disk (handy offline or behind a proxy).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
export const { chromium } = pw.default || pw;

export const BASE = process.env.BASE_URL || 'http://localhost:8787';
export const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

export function launch() {
  return chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
}

const cacheDir = join(OUT, '.cache');
mkdirSync(cacheDir, { recursive: true });
function fetchViaCurl(url) {
  const f = join(cacheDir, createHash('sha1').update(url).digest('hex'));
  if (!existsSync(f)) execFileSync('curl', ['-sS', '-L', '-A', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36', '-o', f, url]);
  return readFileSync(f);
}

export async function newContext(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, ...opts });
  const cdn = process.env.LOCAL_CDN;
  if (cdn) {
    await ctx.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', (route) => {
      const path = new URL(route.request().url()).pathname.replace('/npm/three@0.160.0/', '');
      route.fulfill({ body: readFileSync(join(cdn, path)), contentType: 'application/javascript' });
    });
    await ctx.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/, (route) => {
      const url = route.request().url();
      try {
        route.fulfill({ body: fetchViaCurl(url), contentType: url.includes('googleapis') ? 'text/css' : 'font/woff2' });
      } catch { route.abort(); }
    });
  }
  return ctx;
}

export async function openPage(ctx, path = '/', { log = true } = {}) {
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  if (log) page.on('console', (m) => { if (m.type() === 'log' && process.env.VERBOSE) console.log('  [page]', m.text()); });
  await page.goto(BASE + path, { timeout: 120000 });
  await page.waitForFunction(() => window.__hh && document.getElementById('loading').classList.contains('done'), null, { timeout: 60000 });
  return page;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
export function check(ok, label) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
}
export function done() {
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exitCode = failures ? 1 : 0;
}
