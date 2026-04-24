function normalizeHtml(value) {
  return String(value ?? '').trim();
}

function hasFullDocument(html) {
  return /<\s*html[\s>]/i.test(html) && /<\s*body[\s>]/i.test(html);
}

const PREMIUM_DOCUMENT_CSS = `
  :root {
    color-scheme: only light;
    --text-color: #111827;
    --muted-color: #4b5563;
    --brand-color: #5b21b6;
    --border-color: #e5e7eb;
  }

  * {
    box-sizing: border-box;
  }

  html,
  body {
    margin: 0;
    padding: 0;
    font-family: 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: var(--text-color);
    font-size: 12pt;
    line-height: 1.55;
    background: #ffffff;
  }

  body {
    padding: 22mm 16mm;
    max-width: 210mm;
    margin: 0 auto;
  }

  h1,
  h2,
  h3,
  h4 {
    color: #111111;
    line-height: 1.3;
    margin: 0 0 10px;
    page-break-after: avoid;
  }

  h1 {
    font-size: 22pt;
    margin-bottom: 14px;
  }

  h2 {
    font-size: 17pt;
    margin-top: 18px;
  }

  h3 {
    font-size: 14pt;
    margin-top: 12px;
  }

  p,
  li {
    margin: 0 0 9px;
    color: var(--text-color);
  }

  strong,
  b {
    font-weight: 700;
  }

  em,
  i {
    font-style: italic;
  }

  ul,
  ol {
    margin: 0 0 10px 20px;
    padding: 0;
  }

  hr {
    border: 0;
    border-top: 1px solid var(--border-color);
    margin: 14px 0;
  }

  blockquote {
    border-left: 4px solid #c4b5fd;
    margin: 12px 0;
    padding: 8px 12px;
    color: var(--muted-color);
    background: #faf5ff;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 14px 0;
    table-layout: fixed;
  }

  th,
  td {
    border: 1px solid var(--border-color);
    padding: 8px;
    vertical-align: top;
    text-align: left;
    word-break: break-word;
  }

  .contract-document {
    width: 100%;
  }

  .contract-document img {
    max-width: 100%;
    height: auto;
  }

  .contract-document > *:first-child {
    margin-top: 0;
  }

  .contract-document > *:last-child {
    margin-bottom: 0;
  }

  @page {
    size: A4;
    margin: 16mm 12mm 18mm;
  }
`;

function injectCssIntoDocument(html) {
  if (/<\s*head[\s>]/i.test(html)) {
    return html.replace(/<\s*\/\s*head\s*>/i, `<style>${PREMIUM_DOCUMENT_CSS}</style></head>`);
  }

  return html.replace(/<\s*body[\s>]/i, `<head><style>${PREMIUM_DOCUMENT_CSS}</style></head><body`);
}

export function renderPremiumContractHtml(inputHtml) {
  const html = normalizeHtml(inputHtml);
  if (!html) {
    throw new Error('HTML final do contrato não enviado.');
  }

  if (hasFullDocument(html)) {
    return injectCssIntoDocument(html);
  }

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Contrato Premium</title>
    <style>${PREMIUM_DOCUMENT_CSS}</style>
  </head>
  <body>
    <article class="contract-document">${html}</article>
  </body>
</html>`;
}
