function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(isoDate) {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return String(isoDate);

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(date);
}

function hasMusicContent(item) {
  return Boolean(String(item?.songName || item?.referenceTitle || '').trim());
}

function sortByOrder(items) {
  return [...items].sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));
}

function getSectionLabel(sectionKey) {
  const labels = {
    cortejo: '💒 Cortejo',
    cerimonia: '🎼 Cerimônia',
    saida: '💐 Saída dos noivos',
    antessala: '🪑 Antessala',
    receptivo: '🎉 Receptivo',
  };

  return labels[sectionKey] || sectionKey;
}

function getMomentTitle(item, sectionKey, index) {
  if (sectionKey === 'cortejo') {
    return `ENTRADA ${index + 1}`;
  }

  return item.whoEnters || item.moment || item.label || `Momento ${index + 1}`;
}

function renderItem(item, sectionKey, index) {
  const momentTitle = getMomentTitle(item, sectionKey, index);
  const whoOrMoment = item.whoEnters || item.moment || '';
  const normalizedMomentTitle = String(momentTitle || '').trim().toLowerCase();
  const normalizedWhoOrMoment = String(whoOrMoment || '').trim().toLowerCase();
  const shouldRenderSubtitle = Boolean(whoOrMoment) && normalizedMomentTitle !== normalizedWhoOrMoment;
  const songTitle = item.songName || item.referenceTitle;
  const referenceText = item.referenceTitle || item.referenceLink;

  return `
    <article class="repertoire-item">
      <div class="moment-title">${escapeHtml(momentTitle)}</div>
      ${shouldRenderSubtitle ? `<div class="moment-subtitle">${escapeHtml(whoOrMoment)}</div>` : ''}
      <div class="music-line"><span class="icon">🎵</span><strong>Música:</strong> ${escapeHtml(songTitle)}</div>
      ${
        item.referenceLink || item.referenceTitle
          ? `<div class="meta-line reference"><span class="icon">🎼</span><strong>Referência:</strong> ${
              item.referenceLink
                ? `<a href="${escapeHtml(item.referenceLink)}">${escapeHtml(referenceText)}</a>`
                : `<span>${escapeHtml(referenceText)}</span>`
            }</div>`
          : ''
      }
      ${
        item.notes
          ? `<div class="meta-line notes"><span class="icon">📝</span><strong>Observação:</strong> ${escapeHtml(item.notes)}</div>`
          : ''
      }
    </article>
  `;
}

function renderSection(sectionKey, items) {
  if (!items.length) return '';

  return `
    <section class="section-block">
      <h2>${escapeHtml(getSectionLabel(sectionKey))}</h2>
      <div class="section-content">
        ${items.map((item, index) => renderItem(item, sectionKey, index)).join('')}
      </div>
    </section>
  `;
}

export function renderPremiumRepertoireHtml(repertoire) {
  const sectionsOrder = ['cortejo', 'cerimonia', 'saida', 'antessala', 'receptivo'];

  const filteredSections = sectionsOrder
    .map((sectionKey) => {
      const sortedItems = sortByOrder(Array.isArray(repertoire[sectionKey]) ? repertoire[sectionKey] : []);
      const validItems = sortedItems.filter(hasMusicContent);
      return { sectionKey, items: validItems };
    })
    .filter((section) => section.items.length > 0);

  const clientName = repertoire.clientName || repertoire.subtitle || repertoire.title;
  const eventDate = formatDate(repertoire.eventDate);

  return `<!doctype html>
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <title>${escapeHtml(clientName || 'Repertório')}</title>
      <style>
        @page { size: A4; margin: 20mm 18mm 18mm; }
        * { box-sizing: border-box; }
        body {
          font-family: 'Aptos', 'Segoe UI', 'Inter', 'Helvetica Neue', Arial, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', 'Twemoji Mozilla', sans-serif;
          color: #2b2a28;
          margin: 0;
          background: #fff;
          line-height: 1.6;
          font-size: 12.5px;
          -webkit-font-smoothing: antialiased;
          text-rendering: optimizeLegibility;
        }
        .document {
          width: 100%;
        }
        .header {
          padding: 0 0 14px;
          margin: 0 0 22px;
          border-bottom: 1px solid #ece1d3;
        }
        .brand {
          margin-bottom: 7px;
          color: #6d5941;
          font-weight: 700;
          font-size: 12.5px;
          letter-spacing: 0.03em;
        }
        .title {
          margin: 0;
          font-size: 21px;
          font-weight: 900;
          letter-spacing: 0.035em;
          color: #221f1a;
          text-transform: uppercase;
        }
        .header-meta {
          margin-top: 11px;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px 14px;
        }
        .meta-row {
          font-size: 12.25px;
          color: #3d3935;
          word-break: break-word;
          display: flex;
          align-items: baseline;
          gap: 6px;
          min-height: 18px;
        }
        .meta-row strong { color: #22201d; font-weight: 700; }
        .meta-row.full-width { grid-column: 1 / -1; }
        .emoji {
          font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', 'Twemoji Mozilla', sans-serif;
          font-size: 1.05em;
          line-height: 1;
          vertical-align: -0.1em;
        }

        .section-block {
          margin: 0 0 24px;
          page-break-inside: avoid;
        }
        .section-block h2 {
          margin: 0 0 14px;
          font-size: 16px;
          color: #2d2924;
          font-weight: 800;
          border-bottom: 1px solid #ece1d3;
          padding-bottom: 7px;
          page-break-after: avoid;
          letter-spacing: 0.01em;
        }
        .section-content {
          display: grid;
          gap: 16px;
        }
        .repertoire-item {
          padding: 0 0 12px 2px;
          border-bottom: 1px solid #f3ebdf;
          page-break-inside: avoid;
        }
        .repertoire-item:last-child {
          border-bottom: 0;
          padding-bottom: 0;
        }
        .moment-title {
          font-size: 13.5px;
          font-weight: 800;
          letter-spacing: 0.04em;
          color: #25221e;
          text-transform: uppercase;
          margin-bottom: 3px;
        }
        .moment-subtitle {
          font-size: 12px;
          color: #54504a;
          margin-top: 0;
          margin-bottom: 7px;
          font-weight: 600;
        }
        .music-line {
          font-size: 14px;
          color: #1f2937;
          margin-top: 0;
          word-break: break-word;
          line-height: 1.5;
        }
        .meta-line {
          margin-top: 6px;
          font-size: 11px;
          color: #776c61;
          word-break: break-word;
          line-height: 1.45;
        }
        .meta-line a {
          color: #6f6256;
          text-decoration: none;
          word-break: break-all;
        }
        .meta-line.reference a {
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .icon {
          margin-right: 4px;
          font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', 'Twemoji Mozilla', sans-serif;
        }

        .final-footer {
          margin-top: 24px;
          padding-top: 12px;
          border-top: 1px solid #ece1d3;
          text-align: center;
          color: #776e66;
          font-size: 10.75px;
          page-break-inside: avoid;
        }
        .final-footer .brandline {
          color: #5a4f46;
          font-weight: 700;
          margin-bottom: 5px;
          letter-spacing: 0.015em;
        }
        @media print {
          .header { break-inside: avoid; }
          .repertoire-item { break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <main class="document">
        <header class="header">
          <div class="brand"><span class="emoji">🎵</span> Harmonics</div>
          <h1 class="title">Repertório — Cerimonial Musical</h1>
          <div class="header-meta">
            ${clientName ? `<div class="meta-row"><span class="emoji">👰</span> <strong>${escapeHtml(clientName)}</strong></div>` : ''}
            ${eventDate || repertoire.eventTime ? `<div class="meta-row"><span class="emoji">📅</span> ${escapeHtml(eventDate)}${eventDate && repertoire.eventTime ? ' às ' : ''}${escapeHtml(repertoire.eventTime || '')}</div>` : ''}
            ${repertoire.locationName ? `<div class="meta-row"><span class="emoji">📍</span> ${escapeHtml(repertoire.locationName)}</div>` : ''}
            ${repertoire.formation ? `<div class="meta-row"><span class="emoji">🎻</span> ${escapeHtml(repertoire.formation)}</div>` : ''}
            ${repertoire.generalNotes ? `<div class="meta-row full-width"><span class="emoji">💜</span> ${escapeHtml(repertoire.generalNotes)}</div>` : ''}
          </div>
        </header>

        ${filteredSections.map(({ sectionKey, items }) => renderSection(sectionKey, items)).join('')}

        <footer class="final-footer">
          <div class="brandline">💜 Harmonics Cerimonial Musical</div>
          <div>A trilha sonora perfeita para o seu momento mais especial</div>
        </footer>
      </main>
    </body>
  </html>`;
}
