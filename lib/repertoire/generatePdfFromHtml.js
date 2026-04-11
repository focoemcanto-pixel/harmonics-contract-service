import { chromium } from 'playwright';

function getRuntimeEnvironment() {
  return {
    nodeEnv: process.env.NODE_ENV || 'undefined',
    render: Boolean(process.env.RENDER),
    renderServiceName: process.env.RENDER_SERVICE_NAME || null,
    platform: process.platform,
    arch: process.arch,
  };
}

export async function generatePdfFromHtml(html) {
  const browserType = 'chromium';
  const executablePath = chromium.executablePath();
  const runtimeEnvironment = getRuntimeEnvironment();

  console.log('[repertoire-pdf] playwright launch preflight', {
    playwrightLoaded: Boolean(chromium),
    browserType,
    executablePath,
    runtimeEnvironment,
  });

  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  } catch (error) {
    const message = String(error?.message || '');
    const browserMissing =
      message.includes("Executable doesn't exist") ||
      message.includes('Please run: npx playwright install');

    console.error('[repertoire-pdf] playwright launch failure', {
      browserType,
      executablePath,
      runtimeEnvironment,
      browserMissing,
      message,
      stack: error?.stack,
    });

    if (browserMissing) {
      const missingBrowserError = new Error(
        'Playwright Chromium não está instalado no ambiente de runtime. Execute `npx playwright install chromium` no Build Command do Render.'
      );
      missingBrowserError.name = 'PlaywrightBrowserMissingError';
      missingBrowserError.code = 'PLAYWRIGHT_BROWSER_MISSING';
      throw missingBrowserError;
    }

    throw error;
  }

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });

    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '18mm',
        right: '12mm',
        bottom: '18mm',
        left: '12mm',
      },
    });
  } finally {
    await browser.close();
  }
}
