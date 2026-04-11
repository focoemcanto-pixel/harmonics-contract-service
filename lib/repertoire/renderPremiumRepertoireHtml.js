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
    cortejo: 'Cortejo',
    cerimonia: 'Cerimônia',
    saida: 'Saída dos noivos',
    antessala: 'Antessala',
    receptivo: 'Receptivo',
  };

  return labels[sectionKey] || sectionKey;
}

function getMomentTitle(item, sectionKey, index) {
  if (sectionKey === 'cortejo') {
    return `ENTRADA ${index + 1}`;
  }

  if (sectionKey === 'saida') {
    return 'SAÍDA DOS NOIVOS';
  }

  return item.whoEnters || item.moment || item.label || `Momento ${index + 1}`;
}

function renderItemCard(item, sectionKey, index) {
  const momentTitle = getMomentTitle(item, sectionKey, index);
  const whoOrMoment = sectionKey === 'cortejo' ? item.whoEnters || item.moment || '' : '';
  const songTitle = item.songName || item.referenceTitle;

  return `
    <article class="music-card">
      <div class="moment-title">${escapeHtml(momentTitle)}</div>
      ${whoOrMoment ? `<div class="moment-subtitle">${escapeHtml(whoOrMoment)}</div>` : ''}
      <div class="music-line"><span class="icon">🎵</span><strong>Música:</strong> ${escapeHtml(songTitle)}</div>
      ${
        item.referenceLink
          ? `<div class="meta-line"><span class="icon">🔗</span><strong>Referência:</strong> <a href="${escapeHtml(
              item.referenceLink
            )}">${escapeHtml(item.referenceLink)}</a></div>`
          : ''
      }
      ${
        item.notes
          ? `<div class="meta-line notes"><span class="icon">📝</span><strong>Observações:</strong> ${escapeHtml(item.notes)}</div>`
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
      <div class="cards-grid">
        ${items.map((item, index) => renderItemCard(item, sectionKey, index)).join('')}
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

  return `<!doctype html>
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <title>${escapeHtml(clientName || 'Repertório')}</title>
      <style>
        @page { size: A4; margin: 24mm 16mm 18mm; }
        * { box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
          color: #18212f;
          margin: 0;
          background: #ffffff;
          line-height: 1.5;
        }
        .cover {
          min-height: calc(297mm - 42mm);
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          gap: 14px;
          page-break-after: always;
        }
        .brand {
          font-size: 14px;
          letter-spacing: 4px;
          text-transform: uppercase;
          color: #8d6c3f;
          font-weight: 700;
        }
        .main-title {
          font-size: 30px;
          letter-spacing: 1px;
          text-transform: uppercase;
          margin: 0;
          color: #101828;
        }
        .client {
          font-size: 26px;
          font-weight: 600;
          margin: 0;
          color: #1e293b;
        }
        .summary-card {
          width: 100%;
          max-width: 600px;
          border: 1px solid #e7ded0;
          border-radius: 16px;
          background: #fcfaf6;
          padding: 22px 26px;
          text-align: left;
          box-shadow: 0 10px 28px rgba(17, 24, 39, 0.08);
          margin-top: 12px;
        }
        .summary-row { margin: 10px 0; font-size: 14px; color: #334155; }
        .summary-label { font-weight: 700; color: #111827; margin-right: 8px; }
        .details-page { page-break-before: always; }
        .section-block { margin-bottom: 28px; }
        .section-block h2 {
          font-size: 24px;
          margin: 0 0 14px;
          color: #1f2937;
          border-bottom: 1px solid #e5e7eb;
          padding-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 0.8px;
        }
        .cards-grid { display: grid; gap: 12px; }
        .music-card {
          border: 1px solid #e9edf3;
          border-radius: 12px;
          padding: 14px 16px;
          background: #ffffff;
        }
        .moment-title {
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 0.5px;
          color: #0f172a;
          text-transform: uppercase;
        }
        .moment-subtitle {
          font-size: 14px;
          color: #334155;
          margin-top: 2px;
          margin-bottom: 8px;
          font-weight: 600;
        }
        .music-line, .meta-line {
          font-size: 13px;
          color: #243447;
          margin-top: 6px;
          word-break: break-word;
        }
        .meta-line a { color: #1d4ed8; text-decoration: none; }
        .meta-line.notes { color: #64748b; }
        .icon { margin-right: 6px; }
        .final-footer {
          margin-top: 24px;
          padding-top: 12px;
          border-top: 1px solid #e5e7eb;
          text-align: center;
          color: #6b7280;
          font-size: 12px;
        }
      </style>
    </head>
    <body>
      <main class="cover">
        <div class="brand">Harmonics</div>
        <h1 class="main-title">Repertório — Cerimonial Musical</h1>
        <h2 class="client">${escapeHtml(clientName || 'Cliente')}</h2>
        <section class="summary-card">
          ${repertoire.eventDate ? `<div class="summary-row"><span class="summary-label">Data:</span>${escapeHtml(formatDate(repertoire.eventDate))}</div>` : ''}
          ${repertoire.eventTime ? `<div class="summary-row"><span class="summary-label">Horário:</span>${escapeHtml(repertoire.eventTime)}</div>` : ''}
          ${repertoire.locationName ? `<div class="summary-row"><span class="summary-label">Local:</span>${escapeHtml(repertoire.locationName)}</div>` : ''}
          ${repertoire.formation ? `<div class="summary-row"><span class="summary-label">Formação:</span>${escapeHtml(repertoire.formation)}</div>` : ''}
          ${repertoire.generalNotes ? `<div class="summary-row"><span class="summary-label">Observações gerais:</span>${escapeHtml(repertoire.generalNotes)}</div>` : ''}
        </section>
      </main>

      <section class="details-page">
        ${filteredSections.map(({ sectionKey, items }) => renderSection(sectionKey, items)).join('')}
        <footer class="final-footer">
          <div><strong>Harmonics Cerimonial Musical</strong></div>
          <div>A trilha sonora perfeita para o seu momento mais especial</div>
        </footer>
      </section>
    </body>
  </html>`;
}
