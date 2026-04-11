import { getSupabaseAdminClient } from './supabaseAdminClient.js';

const DEFAULT_REPERTOIRE_TABLE = 'repertoires';
const REPERTOIRE_CONFIG_TABLE = 'repertoire_config';
const REPERTOIRE_ITEMS_TABLE = 'repertoire_items';
const REPERTOIRE_TOKENS_TABLE = 'repertoire_tokens';
const CONTRACTS_TABLE = 'contracts';
const PRECONTRACTS_TABLE = 'precontracts';

const TOKEN_COLUMNS = [
  'token',
  'access_token',
  'share_token',
  'pdf_token',
  'public_token',
  'client_token',
  'customer_token',
  'contract_token',
  'precontract_token',
  'token_publico',
  'publico_token',
];

const EVENT_ID_COLUMNS = [
  'event_id',
  'evento_id',
  'id_evento',
  'eventId',
  'eventoId',
  'idEvento',
];

const PRECONTRACT_ID_COLUMNS = ['precontract_id', 'pre_contract_id', 'id_precontract', 'precontrato_id'];

function normalizeSongList(payload) {
  const directList = payload?.songs || payload?.musicas || payload?.repertorio || payload?.setlist;
  if (Array.isArray(directList)) {
    return directList.map((item) => {
      if (typeof item === 'string') return { title: item };
      return {
        title: item?.title || item?.nome || item?.song || 'Música sem título',
        artist: item?.artist || item?.artista || '',
        notes: item?.notes || item?.observacoes || '',
      };
    });
  }

  return [];
}

function safeLog(payload) {
  try {
    console.log('[repertoire-pdf] token resolution', payload);
  } catch {
    // no-op
  }
}

function buildLookupCandidates(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return [];

  const candidates = [raw];
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber)) {
    candidates.unshift(asNumber);
  }

  return [...new Set(candidates)];
}

function isMissingSchemaError(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    error?.code === 'PGRST116' ||
    error?.code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('could not find the table') ||
    message.includes('column')
  );
}

async function findByToken({ supabase, table, columns, token, context }) {
  for (const column of columns) {
    const { data, error } = await supabase.from(table).select('*').eq(column, token).maybeSingle();

    if (error) {
      if (isMissingSchemaError(error)) {
        safeLog({
          token,
          strategy: context,
          status: 'skip-missing-schema',
          table,
          column,
          error: error.message,
        });
        continue;
      }

      throw new Error(`Erro ao buscar token (${context}) em ${table}.${column}: ${error.message}`);
    }

    if (data) {
      safeLog({
        token,
        strategy: context,
        status: 'match',
        table,
        column,
      });
      return { data, table, column };
    }
  }

  return null;
}

function toRepertoirePayload({ configRow, itemRows, fallbackRow }) {
  const base = configRow || fallbackRow || {};
  const normalizeSection = (sectionValue) =>
    String(sectionValue || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();

  const hasMusicContent = (item) => Boolean(String(item?.songName || item?.referenceTitle || '').trim());

  const normalizeItem = (item) => ({
    title: item?.song_name || item?.reference_title || '',
    songName: item?.song_name || '',
    referenceTitle: item?.reference_title || '',
    referenceLink: item?.reference_link || '',
    whoEnters: item?.who_enters || '',
    moment: item?.moment || '',
    notes: item?.notes || '',
    section: item?.section || '',
    order: item?.item_order ?? null,
  });

  const normalizedItems = Array.isArray(itemRows) ? itemRows.map(normalizeItem) : [];
  const fallbackSongs = normalizeSongList(base).map((song, index) => ({
    title: song?.title || '',
    songName: song?.title || '',
    referenceTitle: '',
    referenceLink: '',
    whoEnters: '',
    moment: '',
    notes: song?.notes || '',
    section: '',
    order: index + 1,
  }));

  const allItems = (normalizedItems.length ? normalizedItems : fallbackSongs).filter(hasMusicContent);
  const sections = {
    cortejo: [],
    cerimonia: [],
    saida: [],
    antessala: [],
    receptivo: [],
  };

  allItems.forEach((item) => {
    const normalizedSection = normalizeSection(item.section);
    if (normalizedSection === 'cortejo') sections.cortejo.push(item);
    if (normalizedSection === 'cerimonia') sections.cerimonia.push(item);
    if (normalizedSection === 'saida') sections.saida.push(item);
    if (normalizedSection === 'antessala') sections.antessala.push(item);
    if (normalizedSection === 'receptivo') sections.receptivo.push(item);
  });

  Object.values(sections).forEach((items) => {
    items.sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));
  });

  Object.entries(sections).forEach(([sectionName, items]) => {
    safeLog({
      strategy: 'to-repertoire-payload',
      status: 'section-normalization',
      section: sectionName,
      itemsCount: items.length,
      firstItem: items[0] || null,
    });
  });

  return {
    raw: {
      config: configRow || null,
      items: itemRows || [],
      fallback: fallbackRow || null,
    },
    title: base.title || base.nome || base.evento || 'Repertório — Cerimonial Musical',
    subtitle: base.subtitle || base.subtitulo || base.client_name || base.nome_cliente || '',
    eventDate: base.event_date || base.data_evento || base.date || null,
    clientName: base.client_name || base.nome_cliente || base.customer_name || '',
    eventTime: base.event_time || base.horario_evento || base.time || '',
    locationName: base.location_name || base.local_evento || base.location || '',
    formation: base.formation || base.formacao || '',
    generalNotes: base.general_notes || base.observacoes_gerais || '',
    cortejo: sections.cortejo,
    cerimonia: sections.cerimonia,
    saida: sections.saida,
    antessala: sections.antessala,
    receptivo: sections.receptivo,
    songs: allItems,
  };
}

async function fetchRepertoireByEventId({ supabase, eventId, token, fromFallback }) {
  const lookupCandidates = buildLookupCandidates(eventId);
  if (!lookupCandidates.length) {
    safeLog({
      token,
      strategy: 'event-id-resolution',
      status: 'invalid-event-id',
      eventId,
      fromFallback,
    });
    return null;
  }

  safeLog({
    token,
    strategy: 'event-id-resolution',
    status: 'event-id-candidates',
    eventId,
    fromFallback,
    lookupCandidates,
  });

  const configQueries = EVENT_ID_COLUMNS.flatMap((column) =>
    lookupCandidates.map((lookupValue) =>
      supabase
        .from(REPERTOIRE_CONFIG_TABLE)
        .select('*')
        .eq(column, lookupValue)
        .maybeSingle()
        .then((result) => ({ ...result, lookupValue, column }))
    )
  );
  const configResults = await Promise.all(configQueries);

  let configRow = null;
  let configColumn = null;
  let configLookupValue = null;

  for (const result of configResults) {
    const { column, lookupValue } = result;

    if (result.error) {
      if (isMissingSchemaError(result.error)) {
        safeLog({
          token,
          strategy: 'event-id-resolution',
          status: 'skip-missing-schema',
          table: REPERTOIRE_CONFIG_TABLE,
          column,
          error: result.error.message,
        });
        continue;
      }

      throw new Error(
        `Erro ao buscar configuração de repertório em ${REPERTOIRE_CONFIG_TABLE}.${column}: ${result.error.message}`
      );
    }

    if (result.data) {
      configRow = result.data;
      configColumn = column;
      configLookupValue = lookupValue;
      break;
    }
  }

  safeLog({
    token,
    strategy: 'event-id-resolution',
    status: 'config-query-result',
    eventId,
    found: Boolean(configRow),
    configColumn,
    configLookupValue,
  });

  const itemsQueries = EVENT_ID_COLUMNS.flatMap((column) =>
    lookupCandidates.map((lookupValue) =>
      supabase
        .from(REPERTOIRE_ITEMS_TABLE)
        .select('*')
        .eq(column, lookupValue)
        .order('item_order', { ascending: true })
        .then((result) => ({ ...result, lookupValue, column }))
    )
  );
  const itemsResults = await Promise.all(itemsQueries);

  let itemRows = [];
  let itemsColumn = null;
  let itemsLookupValue = null;

  for (const result of itemsResults) {
    const { column, lookupValue } = result;

    if (result.error) {
      if (isMissingSchemaError(result.error)) {
        safeLog({
          token,
          strategy: 'event-id-resolution',
          status: 'skip-missing-schema',
          table: REPERTOIRE_ITEMS_TABLE,
          column,
          error: result.error.message,
        });
        continue;
      }

      throw new Error(
        `Erro ao buscar itens de repertório em ${REPERTOIRE_ITEMS_TABLE}.${column}: ${result.error.message}`
      );
    }

    if (Array.isArray(result.data) && result.data.length) {
      itemRows = result.data;
      itemsColumn = column;
      itemsLookupValue = lookupValue;
      break;
    }
  }

  safeLog({
    token,
    strategy: 'event-id-resolution',
    status: 'items-query-result',
    eventId,
    found: itemRows.length > 0,
    itemsCount: itemRows.length,
    itemsColumn,
    itemsLookupValue,
  });

  if (!configRow && itemRows.length === 0) {
    safeLog({
      token,
      strategy: 'event-id-resolution',
      status: 'not-found',
      eventId,
      fromFallback,
    });
    return null;
  }

  safeLog({
    token,
    strategy: 'event-id-resolution',
    status: 'resolved',
    eventId,
    fromFallback,
    configColumn,
    configLookupValue,
    itemsColumn,
    itemsLookupValue,
    hasConfig: Boolean(configRow),
    itemsCount: itemRows.length,
  });

  return toRepertoirePayload({ configRow, itemRows });
}

function extractFirstValue(row, columns) {
  for (const column of columns) {
    const value = row?.[column];
    if (value != null && `${value}`.trim() !== '') {
      return value;
    }
  }

  return null;
}

function extractEventId(row) {
  return extractFirstValue(row, EVENT_ID_COLUMNS);
}

function extractPrecontractId(row) {
  return extractFirstValue(row, PRECONTRACT_ID_COLUMNS);
}

async function resolveEventIdFromPrecontractId({ supabase, precontractId, token, source }) {
  const lookupCandidates = buildLookupCandidates(precontractId);
  if (!lookupCandidates.length) {
    safeLog({
      token,
      strategy: source,
      status: 'invalid-precontract-id',
      precontractId,
    });
    return null;
  }

  const idColumns = ['id', ...PRECONTRACT_ID_COLUMNS];
  for (const idColumn of idColumns) {
    for (const lookupValue of lookupCandidates) {
      const { data, error } = await supabase
        .from(PRECONTRACTS_TABLE)
        .select('*')
        .eq(idColumn, lookupValue)
        .maybeSingle();

      if (error) {
        if (isMissingSchemaError(error)) {
          safeLog({
            token,
            strategy: source,
            status: 'skip-missing-schema',
            table: PRECONTRACTS_TABLE,
            column: idColumn,
            lookupValue,
            error: error.message,
          });
          continue;
        }

        throw new Error(
          `Erro ao resolver precontract (${source}) em ${PRECONTRACTS_TABLE}.${idColumn}: ${error.message}`
        );
      }

      if (!data) {
        continue;
      }

      const eventId = extractEventId(data);
      safeLog({
        token,
        strategy: source,
        status: 'resolved-via-precontract',
        precontractId,
        lookupValue,
        matchedBy: `${PRECONTRACTS_TABLE}.${idColumn}`,
        eventId,
      });

      return eventId;
    }
  }

  safeLog({
    token,
    strategy: source,
    status: 'precontract-not-found',
    precontractId,
    lookupCandidates,
  });

  return null;
}

async function resolveRepertoireFromRow({
  supabase,
  token,
  row,
  strategy,
  table,
  column,
  fromFallback,
  allowDirectRowFallback,
}) {
  const eventId = extractEventId(row);
  const precontractId = extractPrecontractId(row);

  safeLog({
    token,
    strategy,
    status: 'row-match',
    table,
    column,
    eventId,
    precontractId,
  });

  if (eventId) {
    const fromEvent = await fetchRepertoireByEventId({
      supabase,
      eventId,
      token,
      fromFallback,
    });

    if (fromEvent) {
      safeLog({
        token,
        strategy,
        status: 'resolved-via-event-id',
        table,
        column,
        eventId,
      });
      return fromEvent;
    }
  }

  if (precontractId) {
    const eventIdFromPrecontract = await resolveEventIdFromPrecontractId({
      supabase,
      precontractId,
      token,
      source: strategy,
    });

    if (eventIdFromPrecontract) {
      const fromPrecontractEvent = await fetchRepertoireByEventId({
        supabase,
        eventId: eventIdFromPrecontract,
        token,
        fromFallback,
      });

      if (fromPrecontractEvent) {
        safeLog({
          token,
          strategy,
          status: 'resolved-via-precontract-event-id',
          eventId: eventIdFromPrecontract,
        });
        return fromPrecontractEvent;
      }
    }
  }

  if (allowDirectRowFallback) {
    safeLog({
      token,
      strategy,
      status: 'resolved-direct-row',
      table,
      column,
      eventId,
    });
    return toRepertoirePayload({ fallbackRow: row });
  }

  return null;
}

export async function fetchRepertoireByToken(token) {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) {
    throw new Error('Token do repertório é obrigatório.');
  }

  const supabase = getSupabaseAdminClient();
  const repertoireTable = String(process.env.REPERTOIRE_TABLE || DEFAULT_REPERTOIRE_TABLE).trim();

  safeLog({
    token: normalizedToken,
    strategy: 'start',
    status: 'token-received',
  });

  const directRepertoire = await findByToken({
    supabase,
    table: repertoireTable,
    columns: TOKEN_COLUMNS,
    token: normalizedToken,
    context: 'direct-repertoire-token',
  });

  if (directRepertoire) {
    const resolved = await resolveRepertoireFromRow({
      supabase,
      token: normalizedToken,
      row: directRepertoire.data,
      strategy: 'direct-repertoire-token',
      table: directRepertoire.table,
      column: directRepertoire.column,
      fromFallback: false,
      allowDirectRowFallback: true,
    });

    if (resolved) {
      return resolved;
    }

    safeLog({
      token: normalizedToken,
      strategy: 'direct-repertoire-token',
      status: 'match-found-but-unresolved',
      table: directRepertoire.table,
      column: directRepertoire.column,
    });
  }

  const directConfig = await findByToken({
    supabase,
    table: REPERTOIRE_CONFIG_TABLE,
    columns: TOKEN_COLUMNS,
    token: normalizedToken,
    context: 'direct-repertoire-config-token',
  });

  if (directConfig) {
    const resolved = await resolveRepertoireFromRow({
      supabase,
      token: normalizedToken,
      row: directConfig.data,
      strategy: 'direct-repertoire-config-token',
      table: directConfig.table,
      column: directConfig.column,
      fromFallback: false,
      allowDirectRowFallback: false,
    });

    if (resolved) {
      return resolved;
    }

    safeLog({
      token: normalizedToken,
      strategy: 'direct-repertoire-config-token',
      status: 'resolved-direct-config',
    });

    return toRepertoirePayload({ configRow: directConfig.data, itemRows: [] });
  }

  const tokenToEventStrategies = [
    { table: REPERTOIRE_TOKENS_TABLE, label: 'repertoire-token-table' },
    { table: CONTRACTS_TABLE, label: 'contracts-public-token' },
    { table: PRECONTRACTS_TABLE, label: 'precontracts-public-token' },
  ];

  for (const strategy of tokenToEventStrategies) {
    safeLog({
      token: normalizedToken,
      strategy: strategy.label,
      status: 'search-start',
      table: strategy.table,
    });

    const found = await findByToken({
      supabase,
      table: strategy.table,
      columns: TOKEN_COLUMNS,
      token: normalizedToken,
      context: strategy.label,
    });

    if (!found) {
      safeLog({
        token: normalizedToken,
        strategy: strategy.label,
        status: 'search-no-match',
        table: strategy.table,
      });
      continue;
    }

    safeLog({
      token: normalizedToken,
      strategy: strategy.label,
      status: 'search-match',
      table: found.table,
      column: found.column,
      eventId: extractEventId(found.data),
      precontractId: extractPrecontractId(found.data),
    });

    const resolved = await resolveRepertoireFromRow({
      supabase,
      token: normalizedToken,
      row: found.data,
      strategy: strategy.label,
      table: found.table,
      column: found.column,
      fromFallback: true,
      allowDirectRowFallback: false,
    });

    if (resolved) {
      return resolved;
    }

    safeLog({
      token: normalizedToken,
      strategy: strategy.label,
      status: 'match-found-but-unresolved',
      table: found.table,
      column: found.column,
    });
  }

  safeLog({
    token: normalizedToken,
    strategy: 'final',
    status: 'not-found',
  });

  return null;
}
