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
  const whoOrMoment = sectionKey === 'cortejo' ? item.whoEnters || item.moment || '' : '';
  const songTitle = item.songName || item.referenceTitle;

  return `
    <article class="repertoire-item">
      <div class="moment-title">${escapeHtml(momentTitle)}</div>
      ${whoOrMoment ? `<div class="moment-subtitle">${escapeHtml(whoOrMoment)}</div>` : ''}
      <div class="music-line"><span class="icon">🎵</span><strong>Música:</strong> ${escapeHtml(songTitle)}</div>
      ${
        item.referenceLink
          ? `<div class="meta-line reference"><span class="icon">🔗</span><strong>Referência:</strong> <a href="${escapeHtml(
              item.referenceLink
            )}">${escapeHtml(item.referenceLink)}</a></div>`
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
        @page { size: A4; margin: 16mm 14mm 16mm; }
        * { box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
          color: #1f2937;
          margin: 0;
          background: #fff;
          line-height: 1.42;
          font-size: 12px;
        }
        .document {
          width: 100%;
        }
        .header {
          padding-bottom: 10px;
          margin-bottom: 10px;
          border-bottom: 1px solid #e7e5e4;
        }
        .brand {
          font-size: 11px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #8b6c42;
          font-weight: 700;
          margin-bottom: 3px;
        }
        .title {
          margin: 0;
          font-size: 19px;
          font-weight: 800;
          letter-spacing: 0.01em;
          color: #111827;
          text-transform: uppercase;
        }
        .header-meta {
          margin-top: 7px;
          display: grid;
          gap: 4px;
        }
        .meta-row {
          font-size: 12px;
          color: #374151;
          word-break: break-word;
        }
        .meta-row strong { color: #111827; }

        .section-block {
          margin: 0 0 12px;
          page-break-inside: avoid;
        }
        .section-block h2 {
          margin: 0 0 6px;
          font-size: 14px;
          color: #111827;
          font-weight: 800;
          border-bottom: 1px solid #ece8e1;
          padding-bottom: 3px;
          page-break-after: avoid;
        }
        .section-content {
          display: grid;
          gap: 8px;
        }
        .repertoire-item {
          padding-left: 4px;
          page-break-inside: avoid;
        }
        .moment-title {
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.04em;
          color: #111827;
          text-transform: uppercase;
        }
        .moment-subtitle {
          font-size: 12px;
          color: #374151;
          margin-top: 1px;
          margin-bottom: 2px;
          font-weight: 600;
        }
        .music-line {
          font-size: 12px;
          color: #1f2937;
          margin-top: 2px;
          word-break: break-word;
        }
        .meta-line {
          margin-top: 2px;
          font-size: 10.5px;
          color: #6b7280;
          word-break: break-word;
        }
        .meta-line a {
          color: #6b7280;
          text-decoration: none;
        }
        .meta-line.reference a {
          text-decoration: underline;
          text-underline-offset: 1px;
        }
        .icon { margin-right: 4px; }

        .final-footer {
          margin-top: 12px;
          padding-top: 8px;
          border-top: 1px solid #e7e5e4;
          text-align: center;
          color: #6b7280;
          font-size: 11px;
          page-break-inside: avoid;
        }
        .final-footer .brandline {
          color: #4b5563;
          font-weight: 600;
          margin-bottom: 2px;
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
