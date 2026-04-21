function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDateBR(value) {
  if (!value) return '';
  const str = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-');
    return `${d}/${m}/${y}`;
  }

  const date = new Date(str);
  if (Number.isNaN(date.getTime())) return str;

  return new Intl.DateTimeFormat('pt-BR').format(date);
}

function formatTime(value) {
  if (!value) return '';
  const str = String(value).trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(str)) return str.slice(0, 5);
  if (/^\d{2}:\d{2}$/.test(str)) return str;
  return str;
}

function compactText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeReferenceTitle(item) {
  return compactText(item?.referenceTitle || item?.reference_title || '');
}

function normalizeSongTitle(item) {
  return compactText(item?.songName || item?.song_name || item?.title || '');
}

function normalizeSecondaryLabel(item) {
  return compactText(
    item?.whoEnters ||
      item?.who_enters ||
      item?.moment ||
      item?.label ||
      item?.groupName ||
      item?.group_name ||
      ''
  );
}

function normalizeReferenceLink(item) {
  return compactText(item?.referenceLink || item?.reference_link || '');
}

function normalizeNotes(item) {
  return compactText(item?.notes || '');
}

function normalizeArtists(item) {
  return compactText(item?.artists || item?.artist || '');
}

function normalizeGenres(item) {
  return compactText(item?.genres || item?.genre || '');
}

function normalizeDuration(item) {
  return compactText(
    item?.duration ||
      item?.tempo ||
      item?.time ||
      item?.minutes ||
      item?.receptionDuration ||
      item?.reception_duration ||
      ''
  );
}

function hasRealSong(item) {
  return Boolean(normalizeSongTitle(item) || normalizeReferenceTitle(item));
}

function hasRelevantDescriptiveContent(item) {
  return Boolean(
    normalizeSongTitle(item) ||
      normalizeReferenceTitle(item) ||
      normalizeReferenceLink(item) ||
      normalizeDuration(item) ||
      normalizeGenres(item) ||
      normalizeArtists(item) ||
      normalizeNotes(item)
  );
}

function sortByOrder(items = []) {
  return [...items].sort(
    (a, b) => Number(a?.order || a?.item_order || 0) - Number(b?.order || b?.item_order || 0)
  );
}

function filterValidItems(items = []) {
  return sortByOrder(items).filter(hasRealSong);
}

const SECTION_ORDER = ['antesala', 'cortejo', 'cerimonia', 'saida', 'receptivo'];

const SECTION_DEFINITION = {
  antesala: { title: 'Antessala', icon: 'antessala' },
  cortejo: { title: 'Cortejo', icon: 'cortejo' },
  cerimonia: { title: 'Cerimônia', icon: 'ceremony' },
  saida: { title: 'Saída dos noivos', icon: 'exit', titleOverride: 'Saída dos noivos' },
  receptivo: { title: 'Receptivo', icon: 'reception' },
};

function normalizeSectionKey(value) {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();

  if (normalized === 'antessala') return 'antesala';
  return normalized;
}

function groupItemsBySection(payload = {}) {
  const grouped = {
    antesala: [],
    cortejo: [],
    cerimonia: [],
    saida: [],
    receptivo: [],
  };

  const sectionSources = [
    ['antesala', payload?.antesala],
    ['antesala', payload?.antessala],
    ['cortejo', payload?.cortejo],
    ['cerimonia', payload?.cerimonia],
    ['saida', payload?.saida],
    ['receptivo', payload?.receptivo],
  ];

  sectionSources.forEach(([section, items]) => {
    if (!Array.isArray(items)) return;
    grouped[section].push(...items);
  });

  if (Array.isArray(payload?.items)) {
    payload.items.forEach((item) => {
      const section = normalizeSectionKey(item?.section);
      if (!SECTION_ORDER.includes(section)) return;
      grouped[section].push(item);
    });
  }

  return grouped;
}

function renderIcon(name) {
  const icons = {
    brand: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="#7C3AED"></circle>
        <path d="M12 6.2l1.65 4.15L18 12l-4.35 1.65L12 17.8l-1.65-4.15L6 12l4.35-1.65L12 6.2z" fill="#fff"></path>
      </svg>
    `,
    bride: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8" r="4" fill="#F6C7D9"></circle>
        <path d="M5 21c1.8-4.6 4.1-6.9 7-6.9s5.2 2.3 7 6.9H5z" fill="#E9D5FF"></path>
        <path d="M9 5l3-2 3 2-1.2 1.6H10.2L9 5z" fill="#FBBF24"></path>
      </svg>
    `,
    date: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="5" width="18" height="16" rx="3" fill="#FCA5A5"></rect>
        <rect x="3" y="8" width="18" height="4" fill="#DC2626"></rect>
        <rect x="7" y="2.5" width="2" height="6" rx="1" fill="#1F2937"></rect>
        <rect x="15" y="2.5" width="2" height="6" rx="1" fill="#1F2937"></rect>
      </svg>
    `,
    location: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 22s6-6.3 6-11a6 6 0 10-12 0c0 4.7 6 11 6 11z" fill="#EF4444"></path>
        <circle cx="12" cy="11" r="2.5" fill="#fff"></circle>
      </svg>
    `,
    formation: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 3h8v10a4 4 0 11-2-3.46V5h-4v12a4 4 0 11-2-3.46V3z" fill="#F97316"></path>
      </svg>
    `,
    cortejo: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3l8 5v8l-8 5-8-5V8l8-5z" fill="#F5D0FE"></path>
        <path d="M12 7l4 2.5V14L12 16.5 8 14V9.5L12 7z" fill="#A855F7"></path>
      </svg>
    `,
    ceremony: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="9" cy="12" r="4.5" fill="#FCD34D"></circle>
        <circle cx="15" cy="12" r="4.5" fill="#FDE68A" opacity="0.95"></circle>
      </svg>
    `,
    exit: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 17c2.5-4.8 5.7-8.2 9.8-10.4 1.2-.7 2.9-.2 3.4 1.3.4 1.1 0 2.4-1 3.1-2.9 2-5.6 4.4-8 7H6z" fill="#F9A8D4"></path>
        <path d="M7 18h10.5a2.5 2.5 0 010 5H7a2.5 2.5 0 010-5z" fill="#EC4899"></path>
      </svg>
    `,
    reception: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="4" width="14" height="16" rx="3" fill="#FDE68A"></rect>
        <path d="M8 8h8M8 12h8M8 16h5" stroke="#92400E" stroke-width="1.8" stroke-linecap="round"></path>
      </svg>
    `,
    antessala: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="6" width="16" height="12" rx="2" fill="#BFDBFE"></rect>
        <rect x="7" y="9" width="10" height="6" rx="1.5" fill="#1D4ED8"></rect>
      </svg>
    `,
    music: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 4h8v10.2a3.3 3.3 0 11-1.8-2.95V6h-4v11.2A3.3 3.3 0 119.4 14.3V4z" fill="#7C3AED"></path>
      </svg>
    `,
    link: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M10.6 13.4l2.8-2.8M8 16a4 4 0 010-5.7l2.3-2.3a4 4 0 115.7 5.7l-.8.8M16 8a4 4 0 010 5.7l-2.3 2.3a4 4 0 11-5.7-5.7l.8-.8" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"></path>
      </svg>
    `,
    notes: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="3" width="14" height="18" rx="2" fill="#FEF3C7"></rect>
        <path d="M8 8h8M8 12h8M8 16h5" stroke="#B45309" stroke-width="1.6" stroke-linecap="round"></path>
      </svg>
    `,
    footer: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 21s-7-4.5-7-10a4 4 0 017-2.7A4 4 0 0119 11c0 5.5-7 10-7 10z" fill="#C084FC"></path>
      </svg>
    `,
  };

  return `<span class="icon icon-${name}">${icons[name] || ''}</span>`;
}

function renderMetaLine(icon, value, extraClass = '') {
  const text = compactText(value);
  if (!text) return '';

  return `
    <div class="meta-line ${extraClass}">
      ${renderIcon(icon)}
      <div class="meta-value">${escapeHtml(text)}</div>
    </div>
  `;
}

function renderSection(
  title,
  iconName,
  items,
  { titleOverride = '', allowDescriptiveContent = false, showConfigFields = false } = {}
) {
  const validItems = sortByOrder(items).filter((item) =>
    allowDescriptiveContent ? hasRelevantDescriptiveContent(item) : hasRealSong(item)
  );
  if (!validItems.length) return '';

  const heading = titleOverride || title;

  return `
    <section class="section">
      <div class="section-header">
        ${renderIcon(iconName)}
        <h2>${escapeHtml(heading)}</h2>
      </div>

      <div class="section-items">
        ${validItems
          .map((item, index) => {
            const musicTitle =
              normalizeSongTitle(item) || normalizeReferenceTitle(item) || 'Música sem título';
            const context = normalizeSecondaryLabel(item);
            const referenceTitle = normalizeReferenceTitle(item);
            const referenceLink = normalizeReferenceLink(item);
            const notes = normalizeNotes(item);
            const artists = normalizeArtists(item);
            const genres = normalizeGenres(item);
            const duration = normalizeDuration(item);
            const hasMusic = Boolean(normalizeSongTitle(item) || normalizeReferenceTitle(item));

            const itemHeading = compactText(
              item?.moment ||
                item?.whoEnters ||
                item?.who_enters ||
                item?.label ||
                item?.groupName ||
                item?.group_name ||
                `MOMENTO ${index + 1}`
            );

            const safeReferenceHref =
              referenceLink && /^https?:\/\//i.test(referenceLink) ? referenceLink : '';

            return `
              <article class="item">
                ${itemHeading ? `<div class="item-heading">${escapeHtml(itemHeading)}</div>` : ''}

                ${
                  hasMusic
                    ? `
                      <div class="item-line strong-line">
                        ${renderIcon('music')}
                        <span><strong>Música:</strong> ${escapeHtml(musicTitle)}</span>
                      </div>
                    `
                    : ''
                }

                ${
                  referenceTitle || safeReferenceHref
                    ? `
                      <div class="item-line muted-line">
                        ${renderIcon('link')}
                        <span>
                          <strong>Referência:</strong>
                          ${
                            safeReferenceHref
                              ? `<a href="${escapeHtml(safeReferenceHref)}" target="_blank" rel="noreferrer">${escapeHtml(referenceTitle || safeReferenceHref)}</a>`
                              : escapeHtml(referenceTitle)
                          }
                        </span>
                      </div>
                    `
                    : ''
                }

                ${
                  showConfigFields && duration
                    ? `
                      <div class="item-line muted-line">
                        ${renderIcon('formation')}
                        <span><strong>Duração:</strong> ${escapeHtml(duration)}</span>
                      </div>
                    `
                    : ''
                }

                ${
                  showConfigFields && genres
                    ? `
                      <div class="item-line muted-line">
                        ${renderIcon('music')}
                        <span><strong>Gêneros:</strong> ${escapeHtml(genres)}</span>
                      </div>
                    `
                    : ''
                }

                ${
                  showConfigFields && artists
                    ? `
                      <div class="item-line muted-line">
                        ${renderIcon('bride')}
                        <span><strong>Artistas:</strong> ${escapeHtml(artists)}</span>
                      </div>
                    `
                    : ''
                }

                ${
                  notes
                    ? `
                      <div class="item-line notes-line">
                        ${renderIcon('notes')}
                        <span><strong>Observação:</strong> ${escapeHtml(notes)}</span>
                      </div>
                    `
                    : ''
                }
              </article>
            `;
          })
          .join('')}
      </div>
    </section>
  `;
}

export function renderPremiumRepertoireHtml(payload = {}) {
  const clientName = compactText(payload?.clientName || payload?.subtitle || '');
  const eventDate = formatDateBR(payload?.eventDate);
  const eventTime = formatTime(payload?.eventTime);
  const locationName = compactText(payload?.locationName || '');
  const formation = compactText(payload?.formation || '');
  const generalNotes = compactText(payload?.generalNotes || '');

  const groupedSections = groupItemsBySection(payload);

  const dateTimeLine = [eventDate, eventTime ? `às ${eventTime}` : ''].filter(Boolean).join(' ');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Repertório — Cerimonial Musical</title>
  <style>
    @page {
      size: A4;
      margin: 18mm 16mm 16mm 16mm;
    }

    :root {
      --text: #241c2f;
      --muted: #6e6480;
      --line: #eadfef;
      --brand: #7C3AED;
      --accent: #8B5E34;
      --soft: #fbf8ff;
      --heading: #1f2740;
    }

    * {
      box-sizing: border-box;
    }

    html, body {
      margin: 0;
      padding: 0;
      color: var(--text);
      background: #fff;
      font-family:
        "Inter",
        "Segoe UI",
        "Helvetica Neue",
        Arial,
        "Apple Color Emoji",
        "Segoe UI Emoji",
        "Noto Color Emoji",
        sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body {
      font-size: 13px;
      line-height: 1.45;
    }

    .page {
      width: 100%;
    }

    .hero-card {
      background: #f5efff;
      border: 1px solid #dcccf8;
      border-radius: 24px;
      padding: 18px 20px 16px;
      margin-bottom: 18px;
    }

    .brand-line {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--brand);
      font-size: 14px;
      font-weight: 800;
      margin-bottom: 6px;
    }

    .title {
      font-size: 17px;
      line-height: 1.2;
      font-weight: 800;
      letter-spacing: 0.02em;
      margin: 0 0 12px;
      color: #6b4f8a;
      text-transform: uppercase;
    }

    .hero-name {
      font-size: 26px;
      line-height: 1.15;
      font-weight: 800;
      margin: 0 0 12px;
      color: #2e1f40;
    }

    .meta-grid {
      display: grid;
      gap: 8px;
    }

    .meta-line {
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }

    .meta-value {
      color: #6b4f8a;
      font-size: 13px;
      line-height: 1.45;
      font-weight: 500;
    }

    .section {
      margin: 14px 0 16px;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      border-bottom: 1px solid var(--line);
      padding-bottom: 6px;
      margin-bottom: 10px;
    }

    .section-header h2 {
      margin: 0;
      font-size: 16px;
      line-height: 1.2;
      font-weight: 800;
      color: var(--heading);
    }

    .section-items {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .item {
      break-inside: avoid;
      page-break-inside: avoid;
      padding-bottom: 8px;
      border-bottom: 1px solid #f0e7db;
    }

    .item:last-child {
      border-bottom: 0;
      padding-bottom: 0;
    }

    .item-heading {
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.04em;
      color: #1f2937;
      text-transform: uppercase;
      margin-bottom: 4px;
    }

    .item-line {
      display: flex;
      align-items: flex-start;
      gap: 7px;
      margin: 3px 0;
      color: #4b5563;
    }

    .strong-line {
      color: #1f2937;
      font-size: 13.5px;
    }

    .muted-line {
      color: #6b7280;
      font-size: 12.5px;
    }

    .notes-line {
      color: #6b7280;
      font-size: 12.5px;
    }

    .muted-line a {
      color: #6b7280;
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    .footer {
      margin-top: 22px;
      padding-top: 10px;
      border-top: 1px solid var(--line);
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 4px;
      color: var(--muted);
    }

    .footer strong {
      color: #5b3a86;
      font-size: 13px;
    }

    .general-notes {
      margin-top: 16px;
      padding-top: 8px;
      border-top: 1px solid var(--line);
    }

    .general-notes h3 {
      margin: 0 0 6px;
      font-size: 13px;
      font-weight: 800;
      color: var(--heading);
    }

    .general-notes p {
      margin: 0;
      color: #4b5563;
      line-height: 1.55;
    }

    .icon {
      width: 14px;
      height: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 14px;
      margin-top: 1px;
    }

    .icon svg {
      width: 14px;
      height: 14px;
      display: block;
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="hero-card">
      <div class="brand-line">
        ${renderIcon('music')}
        <span>Harmonics</span>
      </div>

      <h1 class="title">REPERTÓRIO — CERIMONIAL MUSICAL</h1>

      ${clientName ? `<div class="hero-name">${renderIcon('bride')} ${escapeHtml(clientName)}</div>` : ''}

      <div class="meta-grid">
        ${renderMetaLine('date', dateTimeLine)}
        ${renderMetaLine('location', locationName)}
        ${renderMetaLine('formation', formation)}
      </div>
    </section>

    ${SECTION_ORDER.map((section) => {
      const config = SECTION_DEFINITION[section];
      return renderSection(config.title, config.icon, groupedSections[section], {
        titleOverride: config.titleOverride || '',
      });
    }).join('')}

    ${
      generalNotes
        ? `
          <section class="general-notes">
            <h3>Observações gerais</h3>
            <p>${escapeHtml(generalNotes)}</p>
          </section>
        `
        : ''
    }

    <footer class="footer">
      <div class="brand-line" style="margin:0; color:#7c3aed; font-size:13px;">
        ${renderIcon('footer')}
        <strong>Harmonics Cerimonial Musical</strong>
      </div>
      <div>A trilha sonora perfeita para o seu momento mais especial</div>
    </footer>
  </main>
</body>
</html>`;
}
