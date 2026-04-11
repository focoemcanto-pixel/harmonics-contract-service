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
  const whoOrMoment = sectionKey === 'cortejo' ? item.whoEnters || item.moment || '' : item.whoEnters || item.moment || '';
  const songTitle = item.songName || item.referenceTitle;
  const referenceText = item.referenceTitle || item.referenceLink;

  return `
    <article class="repertoire-item">
      <div class="moment-title">${escapeHtml(momentTitle)}</div>
      ${whoOrMoment ? `<div class="moment-subtitle">${escapeHtml(whoOrMoment)}</div>` : ''}
      <div class="music-line"><span class="icon">🎵</span><strong>Música:</strong> ${escapeHtml(songTitle)}</div>
      ${
        item.referenceLink || item.referenceTitle
          ? `<div class="meta-line reference"><span class="icon">🔗</span><strong>Referência:</strong> ${
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
          font-family: 'Aptos', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
          color: #2b2a28;
          margin: 0;
          background: #fff;
          line-height: 1.55;
          font-size: 12.5px;
        }
        .document {
          width: 100%;
        }
        .header {
          padding-bottom: 13px;
          margin-bottom: 18px;
          border-bottom: 1px solid #eee6db;
        }
        .brandline {
          margin-bottom: 6px;
          color: #6d5941;
          font-weight: 700;
          font-size: 13px;
        }
        .brand {
          display: inline;
        }
        .title {
          margin: 0;
          font-size: 23px;
          font-weight: 800;
          letter-spacing: 0.015em;
          color: #1f2937;
          text-transform: uppercase;
        }
        .header-meta {
          margin-top: 11px;
          display: grid;
          gap: 5px;
        }
        .meta-row {
          font-size: 13px;
          color: #363432;
          word-break: break-word;
        }
        .meta-row strong { color: #1f2937; font-weight: 700; }

        .section-block {
          margin: 0 0 18px;
          page-break-inside: avoid;
        }
        .section-block h2 {
          margin: 0 0 10px;
          font-size: 17px;
          color: #1f2937;
          font-weight: 800;
          border-bottom: 1px solid #ece3d6;
          padding-bottom: 6px;
          page-break-after: avoid;
        }
        .section-content {
          display: grid;
          gap: 12px;
        }
        .repertoire-item {
          padding-left: 2px;
          page-break-inside: avoid;
        }
        .moment-title {
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.05em;
          color: #1f2937;
          text-transform: uppercase;
          margin-bottom: 1px;
        }
        .moment-subtitle {
          font-size: 12.5px;
          color: #3f3c37;
          margin-top: 1px;
          margin-bottom: 4px;
          font-weight: 600;
        }
        .music-line {
          font-size: 13px;
          color: #1f2937;
          margin-top: 2px;
          word-break: break-word;
        }
        .meta-line {
          margin-top: 4px;
          font-size: 11.25px;
          color: #6b625a;
          word-break: break-word;
          line-height: 1.45;
        }
        .meta-line a {
          color: #6b625a;
          text-decoration: none;
          word-break: break-all;
        }
        .meta-line.reference a {
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .icon { margin-right: 4px; }

        .final-footer {
          margin-top: 18px;
          padding-top: 11px;
          border-top: 1px solid #eee6db;
          text-align: center;
          color: #6f665d;
          font-size: 11px;
          page-break-inside: avoid;
        }
        .final-footer .brandline {
          color: #564c43;
          font-weight: 700;
          margin-bottom: 4px;
        }
      </style>
    </head>
    <body>
      <main class="document">
        <header class="header">
          <div class="brand">🎵 Harmonics</div>
          <h1 class="title">Repertório — Cerimonial Musical</h1>
          <div class="header-meta">
            ${clientName ? `<div class="meta-row">👰 <strong>${escapeHtml(clientName)}</strong></div>` : ''}
            ${eventDate || repertoire.eventTime ? `<div class="meta-row">📅 ${escapeHtml(eventDate)}${eventDate && repertoire.eventTime ? ' às ' : ''}${escapeHtml(repertoire.eventTime || '')}</div>` : ''}
            ${repertoire.locationName ? `<div class="meta-row">📍 ${escapeHtml(repertoire.locationName)}</div>` : ''}
            ${repertoire.formation ? `<div class="meta-row">🎻 ${escapeHtml(repertoire.formation)}</div>` : ''}
            ${repertoire.generalNotes ? `<div class="meta-row">💜 ${escapeHtml(repertoire.generalNotes)}</div>` : ''}
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
