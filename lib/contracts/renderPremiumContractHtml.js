function normalizeHtml(value) {
  return String(value ?? '').trim();
}

function hasFullDocument(html) {
  return /<\s*html[\s>]/i.test(html) && /<\s*body[\s>]/i.test(html);
}

function stripGoogleDocsNoise(html) {
  return html
    .replace(
      /\sstyle=(['"])([\s\S]*?)\1/gi,
      (_, quote, style) => {
        const sanitized = String(style || '')
          .replace(/(?:^|;)\s*width\s*:[^;]+;?/gi, ';')
          .replace(/(?:^|;)\s*max-width\s*:[^;]+;?/gi, ';')
          .replace(/(?:^|;)\s*font-size\s*:[^;]+;?/gi, ';')
          .replace(/(?:^|;)\s*line-height\s*:[^;]+;?/gi, ';')
          .replace(/(?:^|;)\s*margin(?:-[a-z]+)?\s*:[^;]+;?/gi, ';')
          .replace(/(?:^|;)\s*white-space\s*:\s*pre-wrap;?/gi, ';')
          .replace(/(?:^|;)\s*page-break-before\s*:[^;]+;?/gi, ';')
          .replace(/(?:^|;)\s*page-break-after\s*:[^;]+;?/gi, ';')
          .replace(/(?:^|;)\s*break-before\s*:[^;]+;?/gi, ';')
          .replace(/(?:^|;)\s*break-after\s*:[^;]+;?/gi, ';')
          .replace(/;;+/g, ';')
          .replace(/^;|;$/g, '')
          .trim();

        return sanitized ? ` style=${quote}${sanitized}${quote}` : '';
      }
    )
    .replace(/\sclass=(['"])(?:c\d+|kix-[^'"]+|docs-[^'"]+|ql-[^'"]+|Mso[^'"]*)\1/gi, '')
    .replace(/<\s*span\b([^>]*)\sstyle=(['"])[^'"]*white-space\s*:\s*pre-wrap[^'"]*\2([^>]*)>/gi, '<span$1$3>')
    .replace(/<\s*(?:p|div)\b[^>]*>\s*(?:&nbsp;|&#160;|<br\s*\/?\s*>|\s)*<\s*\/(?:p|div)>/gi, '');
}

function normalizeContractTitle(html) {
  const hasTitleHeading = /<h1\b[^>]*>[\s\S]*?contrato\s+de\s+presta(?:ç|c)[aã]o/i.test(html);
  if (hasTitleHeading) {
    return html;
  }

  const firstTitleBlockRegex = /<(p|div)\b[^>]*>([\s\S]*?contrato\s+de\s+presta(?:ç|c)[aã]o[\s\S]*?)<\/\1>/i;
  const match = html.match(firstTitleBlockRegex);

  if (!match) {
    return html;
  }

  const text = String(match[2] || '')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) {
    return html;
  }

  return html.replace(firstTitleBlockRegex, `<h1>${text}</h1>`);
}

function removeAggressivePageBreaks(html) {
  return html
    .replace(/\sstyle=(['"])[^'"]*page-break-before\s*:\s*always;?[^'"]*\1/gi, '')
    .replace(/\sstyle=(['"])[^'"]*break-before\s*:\s*page;?[^'"]*\1/gi, '')
    .replace(/\sstyle=(['"])[^'"]*page-break-after\s*:\s*always;?[^'"]*\1/gi, '')
    .replace(/\sstyle=(['"])[^'"]*break-after\s*:\s*page;?[^'"]*\1/gi, '');
}

function preprocessContractHtml(inputHtml) {
  const normalized = normalizeHtml(inputHtml);
  if (!normalized) {
    return normalized;
  }

  let html = normalized;
  html = stripGoogleDocsNoise(html);
  html = removeAggressivePageBreaks(html);
  html = normalizeContractTitle(html);

  return html;
}

const PREMIUM_DOCUMENT_CSS = `
  :root {
    color-scheme: only light;
    --text-color: #111827;
    --border-color: #e5e7eb;
  }

  @page {
    size: A4;
    margin: 22mm 24mm;
  }

  * {
    box-sizing: border-box;
  }

  html,
  body {
    margin: 0;
    padding: 0;
    font-family: Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.32;
    color: var(--text-color);
    background: #ffffff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  body {
    max-width: none;
  }

  .contract-document {
    width: 100%;
    max-width: none;
  }

  .contract-document,
  .contract-document * {
    font-family: Arial, sans-serif !important;
  }

  .contract-document * {
    max-width: 100%;
    word-break: normal;
    overflow-wrap: break-word;
  }

  h1,
  h2,
  h3,
  h4,
  .section-title,
  .clause-title {
    color: #111111;
    page-break-after: avoid;
    break-after: avoid;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  h1 {
    font-size: 20pt;
    font-weight: 800;
    line-height: 1.15;
    margin: 0 0 18px;
  }

  h2,
  h3 {
    font-size: 11.5pt;
    font-weight: 800;
    margin: 18px 0 8px;
  }

  p {
    margin: 0 0 8px;
    line-height: 1.32;
    font-size: 11pt;
  }

  strong,
  b {
    font-weight: 800;
  }

  ul,
  ol {
    margin: 6px 0 10px 20px;
    padding: 0;
  }

  li {
    margin-bottom: 4px;
    line-height: 1.32;
    font-size: 11pt;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    margin: 10px 0;
  }

  th,
  td {
    border: 1px solid var(--border-color);
    padding: 6px;
    vertical-align: top;
    text-align: left;
  }

  .signatures,
  .signature-block,
  .technical-record {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  span {
    white-space: normal !important;
  }

  .contract-document [style*='width'],
  .contract-document [style*='font-size'],
  .contract-document [style*='line-height'],
  .contract-document [style*='margin'],
  .contract-document [style*='page-break'],
  .contract-document [style*='break-before'] {
    width: auto !important;
    max-width: 100% !important;
    font-size: inherit !important;
    line-height: inherit !important;
    margin-top: 0 !important;
    margin-right: 0 !important;
    margin-left: 0 !important;
    break-before: auto !important;
    page-break-before: auto !important;
  }

  .contract-document > *:first-child {
    margin-top: 0 !important;
  }
`;

function injectCssIntoDocument(html) {
  if (/<\s*head[\s>]/i.test(html)) {
    return html.replace(/<\s*\/\s*head\s*>/i, `<style>${PREMIUM_DOCUMENT_CSS}</style></head>`);
  }

  return html.replace(/<\s*body[\s>]/i, `<head><style>${PREMIUM_DOCUMENT_CSS}</style></head><body`);
}

export function renderPremiumContractHtml(inputHtml) {
  const html = preprocessContractHtml(inputHtml);

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
