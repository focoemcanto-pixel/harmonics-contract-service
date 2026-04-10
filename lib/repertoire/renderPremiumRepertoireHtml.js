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
  const songsMarkup = repertoire.songs.length
    ? repertoire.songs
        .map(
          (song, index) => `
            <li>
              <span class="index">${index + 1}.</span>
              <span class="title">${escapeHtml(song.title)}</span>
              ${song.artist ? `<span class="artist"> — ${escapeHtml(song.artist)}</span>` : ''}
              ${song.notes ? `<div class="notes">${escapeHtml(song.notes)}</div>` : ''}
            </li>`
        )
        .join('')
    : '<li>Nenhuma música cadastrada.</li>';

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
        ol { margin: 0; padding-left: 0; list-style: none; }
        li { padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
        .index { display: inline-block; min-width: 26px; font-weight: 700; }
        .title { font-weight: 600; }
        .artist { color: #4b5563; }
        .notes { font-size: 12px; color: #6b7280; margin-top: 4px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="title">${escapeHtml(repertoire.title)}</div>
        ${repertoire.subtitle ? `<div class="subtitle">${escapeHtml(repertoire.subtitle)}</div>` : ''}
        ${repertoire.eventDate ? `<div class="date">Data do evento: ${escapeHtml(formatDate(repertoire.eventDate))}</div>` : ''}
      </div>
      <ol>${songsMarkup}</ol>
    </body>
  </html>`;
}
