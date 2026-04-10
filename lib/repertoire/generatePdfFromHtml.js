import { chromium } from 'playwright';

export async function generatePdfFromHtml(html) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

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
