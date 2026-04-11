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

export function renderPremiumRepertoireHtml(repertoire) {
  const renderItems = (items) => {
    if (!Array.isArray(items) || !items.length) {
      return '<li>Nenhuma música cadastrada nesta seção.</li>';
    }

    return items
      .map((item, index) => {
        const title = item.songName || item.referenceTitle || item.title || 'Música sem título';
        const subtitle = item.whoEnters || item.moment || item.label || '';

        return `
          <li>
            <span class="index">${index + 1}.</span>
            <span class="title">${escapeHtml(title)}</span>
            ${subtitle ? `<div class="subtitle">${escapeHtml(subtitle)}</div>` : ''}
            ${
              item.referenceLink
                ? `<div class="reference">Referência: <a href="${escapeHtml(item.referenceLink)}">${escapeHtml(
                    item.referenceLink
                  )}</a></div>`
                : ''
            }
            ${item.notes ? `<div class="notes">Observações: ${escapeHtml(item.notes)}</div>` : ''}
          </li>`;
      })
      .join('');
  };

  const renderSection = (label, items) => `
    <section class="section">
      <h2>${escapeHtml(label)}</h2>
      <ol>${renderItems(items)}</ol>
    </section>
  `;

  return `<!doctype html>
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <title>${escapeHtml(repertoire.title)}</title>
      <style>
        body { font-family: Arial, sans-serif; color: #111827; margin: 32px; }
        .header { border-bottom: 2px solid #111827; padding-bottom: 12px; margin-bottom: 20px; }
        .title { font-size: 28px; font-weight: 700; }
        .subtitle { font-size: 14px; color: #4b5563; margin-top: 6px; }
        .date { font-size: 13px; color: #374151; margin-top: 4px; }
        .meta { font-size: 13px; color: #374151; margin-top: 4px; }
        .section { margin-top: 20px; }
        h2 { font-size: 18px; margin: 0 0 10px; text-transform: capitalize; }
        ol { margin: 0; padding-left: 0; list-style: none; }
        li { padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
        .index { display: inline-block; min-width: 26px; font-weight: 700; }
        .title { font-weight: 600; }
        .reference, .notes { font-size: 12px; color: #6b7280; margin-top: 4px; }
        .reference a { color: #2563eb; word-break: break-all; }
        .notes { font-size: 12px; color: #6b7280; margin-top: 4px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="title">${escapeHtml(repertoire.title)}</div>
        ${repertoire.subtitle ? `<div class="subtitle">${escapeHtml(repertoire.subtitle)}</div>` : ''}
        ${repertoire.eventDate ? `<div class="date">Data do evento: ${escapeHtml(formatDate(repertoire.eventDate))}</div>` : ''}
        ${repertoire.eventTime ? `<div class="meta">Horário: ${escapeHtml(repertoire.eventTime)}</div>` : ''}
        ${repertoire.locationName ? `<div class="meta">Local: ${escapeHtml(repertoire.locationName)}</div>` : ''}
        ${repertoire.formation ? `<div class="meta">Formação: ${escapeHtml(repertoire.formation)}</div>` : ''}
        ${repertoire.generalNotes ? `<div class="meta">Observações gerais: ${escapeHtml(repertoire.generalNotes)}</div>` : ''}
      </div>
      ${renderSection('cortejo', repertoire.cortejo)}
      ${renderSection('cerimonia', repertoire.cerimonia)}
      ${renderSection('saida', repertoire.saida)}
      ${renderSection('antessala', repertoire.antessala)}
      ${renderSection('receptivo', repertoire.receptivo)}
    </body>
  </html>`;
}
