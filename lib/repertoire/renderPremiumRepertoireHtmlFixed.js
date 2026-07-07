import { renderPremiumRepertoireHtml as renderBasePremiumRepertoireHtml } from './renderPremiumRepertoireHtml.js';

function compactText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalize(value) {
  return compactText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isCortejoSection(item = {}) {
  const section = normalize(item?.section);
  return section === 'cortejo';
}

function isGenericEntranceLabel(value) {
  const text = normalize(value);
  return (
    !text ||
    text === 'entrada' ||
    text === 'cortejo' ||
    text === 'momento' ||
    text === 'momento musical' ||
    /^entrada\s*\d+$/.test(text)
  );
}

function fallbackCortejoLabel(index) {
  const labels = [
    'Entrada dos padrinhos',
    'Entrada do noivo',
    'Entrada dos pais',
    'Entrada de damas e pajens',
    'Entrada da noiva',
    'Entrada das alianças',
    'Entrada especial',
  ];

  return labels[index] || `Entrada ${index + 1}`;
}

function resolveCortejoEntryLabel(item = {}, index = 0) {
  const candidates = [
    item?.whoEnters,
    item?.who_enters,
    item?.label,
    item?.groupName,
    item?.group_name,
    item?.moment,
  ]
    .map(compactText)
    .filter(Boolean);

  const specific = candidates.find((candidate) => !isGenericEntranceLabel(candidate));
  return specific || fallbackCortejoLabel(index);
}

function normalizeCortejoList(items = []) {
  if (!Array.isArray(items)) return items;

  let cortejoIndex = 0;

  return items.map((item) => {
    if (!isCortejoSection(item)) return item;

    const entryLabel = resolveCortejoEntryLabel(item, cortejoIndex);
    cortejoIndex += 1;

    return {
      ...item,
      // O renderizador base prioriza `moment` no título do item.
      // Por isso gravamos aqui a descrição correta da entrada.
      moment: entryLabel,
      whoEnters: entryLabel,
      who_enters: entryLabel,
      label: entryLabel,
    };
  });
}

function normalizeSectionArray(items = [], sectionKey = '') {
  if (!Array.isArray(items)) return items;

  return normalizeCortejoList(
    items.map((item) => ({
      ...item,
      section: item?.section || sectionKey,
    }))
  );
}

export function renderPremiumRepertoireHtml(payload = {}) {
  const fixedPayload = {
    ...payload,
    items: normalizeCortejoList(payload?.items),
    songs: normalizeCortejoList(payload?.songs),
    cortejo: normalizeSectionArray(payload?.cortejo, 'cortejo'),
    raw: payload?.raw
      ? {
          ...payload.raw,
          items: normalizeCortejoList(payload.raw.items),
        }
      : payload?.raw,
  };

  return renderBasePremiumRepertoireHtml(fixedPayload);
}
