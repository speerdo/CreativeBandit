import type { Browser } from 'puppeteer-core';

/*
 * Headless rendering for the §3.3 JS-content check.
 *
 * Two execution environments, one interface:
 *
 *   local / any machine with Chrome  - reuse the installed binary. Set
 *                                      CHROME_PATH to override.
 *   Vercel (Amazon Linux)            - @sparticuz/chromium ships a binary
 *                                      built for that runtime.
 *
 * Both are lazy `import()`s so the ~75MB of Chromium never loads on a scan
 * that does not reach this check, and never at module-eval time.
 */

const LOCAL_CANDIDATES = [
  process.env.CHROME_PATH,
  '/usr/local/bin/google-chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter((p): p is string => !!p);

/** Vercel sets this; used to pick the bundled Amazon Linux binary. */
function isServerless(): boolean {
  return !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
}

async function localExecutable(): Promise<string | null> {
  const { access } = await import('node:fs/promises');
  for (const candidate of LOCAL_CANDIDATES) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // try the next one
    }
  }
  return null;
}

export interface RenderedPage {
  url: string;
  html: string;
}

export class RenderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RenderUnavailableError';
  }
}

async function launch(): Promise<Browser> {
  const puppeteer = await import('puppeteer-core');

  if (isServerless()) {
    const chromium = (await import('@sparticuz/chromium')).default;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  const executablePath = await localExecutable();
  if (!executablePath) {
    throw new RenderUnavailableError('No Chrome binary available for rendering.');
  }

  return puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
}

export interface RenderOptions {
  /** Hard ceiling for the whole batch, not per page. */
  deadline?: number;
  perPageTimeoutMs?: number;
}

/**
 * Render a handful of URLs and return their post-JavaScript HTML.
 *
 * One browser, sequential pages. Rendering in parallel inside a serverless
 * function contends for the same constrained CPU and made the total slower
 * in testing, not faster.
 *
 * Never throws for a single bad page - a URL that will not render is simply
 * absent from the result, and the caller compares only what it got back.
 */
export async function renderPages(
  urls: string[],
  options: RenderOptions = {}
): Promise<RenderedPage[]> {
  const { deadline = Infinity, perPageTimeoutMs = 8000 } = options;
  if (urls.length === 0) return [];

  const out: RenderedPage[] = [];
  let browser: Browser | null = null;

  try {
    browser = await launch();

    for (const url of urls) {
      if (Date.now() >= deadline) break;

      const remaining = deadline - Date.now();
      const timeout = Math.min(perPageTimeoutMs, remaining);
      if (timeout <= 0) break;

      let page = null;
      try {
        page = await browser.newPage();

        /*
         * Block images, fonts and media. We compare text, so the bytes are
         * pure cost - and on an image-heavy WordPress page they are most of
         * the payload.
         */
        await page.setRequestInterception(true);
        page.on('request', (request) => {
          const type = request.resourceType();
          if (type === 'image' || type === 'font' || type === 'media') request.abort();
          else request.continue();
        });

        await page.goto(url, { waitUntil: 'networkidle2', timeout });
        out.push({ url, html: await page.content() });
      } catch {
        // Skip this page; a partial sample is still a usable comparison.
      } finally {
        await page?.close().catch(() => {});
      }
    }
  } finally {
    await browser?.close().catch(() => {});
  }

  return out;
}
