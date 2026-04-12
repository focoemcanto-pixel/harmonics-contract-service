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

  const compact = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

  const firstFilled = (...values) => {
    for (const value of values) {
      const text = compact(value);
      if (text) return text;
    }
    return '';
  };

  const parseJsonSafe = (value) => {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  };

  const rawPayload = parseJsonSafe(base?.raw_payload);
  const presetJson = parseJsonSafe(base?.preset_json);

  const deepFind = (obj, paths = []) => {
    for (const path of paths) {
      const keys = path.split('.');
      let current = obj;

      for (const key of keys) {
        if (!current || typeof current !== 'object' || !(key in current)) {
          current = undefined;
          break;
        }
        current = current[key];
      }

      const text = compact(current);
      if (text) return text;
    }
    return '';
  };

  const hasMusicContent = (item) =>
    Boolean(firstFilled(item?.songName, item?.referenceTitle, item?.title));

  const normalizeItem = (item) => ({
    id: item?.id || null,
    title: firstFilled(item?.song_name, item?.reference_title, item?.title),
    songName: firstFilled(item?.song_name, item?.title),
    referenceTitle: firstFilled(item?.reference_title),
    referenceLink: firstFilled(item?.reference_link),
    whoEnters: firstFilled(item?.who_enters),
    moment: firstFilled(item?.moment),
    notes: firstFilled(item?.notes),
    section: firstFilled(item?.section),
    order: Number(item?.item_order ?? item?.order ?? 0),
    label: firstFilled(item?.label),
    groupName: firstFilled(item?.group_name),
    artists: firstFilled(item?.artists),
    genres: firstFilled(item?.genres),
  });

  const normalizedItems = Array.isArray(itemRows) ? itemRows.map(normalizeItem) : [];

  const fallbackSongs = normalizeSongList(base).map((song, index) => ({
    id: `fallback-${index + 1}`,
    title: firstFilled(song?.title),
    songName: firstFilled(song?.title),
    referenceTitle: '',
    referenceLink: '',
    whoEnters: '',
    moment: '',
    notes: firstFilled(song?.notes),
    section: '',
    order: index + 1,
    label: '',
    groupName: '',
    artists: firstFilled(song?.artist),
    genres: '',
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

  const clientName = firstFilled(
    base?.client_name,
    base?.clientName,
    base?.nome_cliente,
    base?.nomeCliente,
    base?.customer_name,
    base?.customerName,
    base?.contractor_name,
    base?.contractorName,
    base?.client_full_name,
    base?.clientFullName,
    base?.nome_noivo,
    base?.nomeNoivo,
    base?.nome_cliente_noivo,
    base?.nomeClienteNoivo,
    base?.bride_groom_name,
    base?.brideGroomName,
    deepFind(rawPayload, [
      'client_name',
      'nome_cliente',
      'customer_name',
      'contractor_name',
      'nome_noivo',
      'cliente.nome',
      'cliente.nome_completo',
      'client.name',
      'client.full_name',
      'contratante.nome',
      'contratante.nome_completo',
    ]),
    deepFind(presetJson, [
      'client_name',
      'nome_cliente',
      'customer_name',
      'contractor_name',
      'nome_noivo',
      'cliente.nome',
      'cliente.nome_completo',
      'client.name',
      'client.full_name',
      'contratante.nome',
      'contratante.nome_completo',
    ]),
    base?.title,
    base?.nome
  );

  const eventDate = firstFilled(
    base?.event_date,
    base?.eventDate,
    base?.data_evento,
    base?.dataEvento,
    base?.date,
    deepFind(rawPayload, [
      'event_date',
      'data_evento',
      'evento.data',
      'evento.data_evento',
      'event.date',
      'wedding.date',
    ]),
    deepFind(presetJson, [
      'event_date',
      'data_evento',
      'evento.data',
      'evento.data_evento',
      'event.date',
      'wedding.date',
    ])
  );

  const eventTime = firstFilled(
    base?.event_time,
    base?.eventTime,
    base?.horario_evento,
    base?.horarioEvento,
    base?.hora_evento,
    base?.horaEvento,
    base?.time,
    base?.horario,
    deepFind(rawPayload, [
      'event_time',
      'horario_evento',
      'hora_evento',
      'evento.horario',
      'evento.hora',
      'event.time',
      'wedding.time',
    ]),
    deepFind(presetJson, [
      'event_time',
      'horario_evento',
      'hora_evento',
      'evento.horario',
      'evento.hora',
      'event.time',
      'wedding.time',
    ])
  );

  const locationName = firstFilled(
    base?.location_name,
    base?.locationName,
    base?.event_location_name,
    base?.eventLocationName,
    base?.venue_name,
    base?.venueName,
    base?.local_evento,
    base?.localEvento,
    base?.location,
    base?.local,
    deepFind(rawPayload, [
      'location_name',
      'event_location_name',
      'venue_name',
      'local_evento',
      'evento.local',
      'event.location_name',
      'event.venue_name',
    ]),
    deepFind(presetJson, [
      'location_name',
      'event_location_name',
      'venue_name',
      'local_evento',
      'evento.local',
      'event.location_name',
      'event.venue_name',
    ])
  );

  const addressLine = firstFilled(
    base?.event_address,
    base?.eventAddress,
    base?.location_address,
    base?.locationAddress,
    base?.venue_address,
    base?.venueAddress,
    base?.address,
    base?.endereco,
    base?.endereco_evento,
    base?.enderecoEvento,
    base?.full_address,
    base?.fullAddress,
    deepFind(rawPayload, [
      'event_address',
      'location_address',
      'venue_address',
      'endereco',
      'endereco_evento',
      'evento.endereco',
      'event.address',
      'venue.address',
    ]),
    deepFind(presetJson, [
      'event_address',
      'location_address',
      'venue_address',
      'endereco',
      'endereco_evento',
      'evento.endereco',
      'event.address',
      'venue.address',
    ])
  );

  const neighborhood = firstFilled(
    base?.neighborhood,
    base?.bairro,
    base?.district,
    base?.location_neighborhood,
    base?.locationNeighborhood,
    deepFind(rawPayload, ['bairro', 'neighborhood', 'evento.bairro', 'event.neighborhood']),
    deepFind(presetJson, ['bairro', 'neighborhood', 'evento.bairro', 'event.neighborhood'])
  );

  const city = firstFilled(
    base?.city,
    base?.cidade,
    base?.location_city,
    base?.locationCity,
    deepFind(rawPayload, ['cidade', 'city', 'evento.cidade', 'event.city']),
    deepFind(presetJson, ['cidade', 'city', 'evento.cidade', 'event.city'])
  );

  const state = firstFilled(
    base?.state,
    base?.estado,
    base?.uf,
    deepFind(rawPayload, ['estado', 'state', 'uf', 'evento.uf', 'event.state']),
    deepFind(presetJson, ['estado', 'state', 'uf', 'evento.uf', 'event.state'])
  );

  const zipCode = firstFilled(
    base?.zip_code,
    base?.zipCode,
    base?.cep,
    deepFind(rawPayload, ['cep', 'zip_code', 'zipcode', 'evento.cep', 'event.zip_code']),
    deepFind(presetJson, ['cep', 'zip_code', 'zipcode', 'evento.cep', 'event.zip_code'])
  );

  const fullLocation = firstFilled(
    [locationName, addressLine].filter(Boolean).join(' - '),
    [locationName, neighborhood, city, state].filter(Boolean).join(' - '),
    [addressLine, neighborhood, city, state, zipCode].filter(Boolean).join(' - '),
    locationName,
    addressLine,
    neighborhood
  );

  const formation = firstFilled(
    base?.formation,
    base?.formacao,
    base?.formacao_musical,
    base?.formacaoMusical,
    base?.group_name,
    base?.groupName,
    base?.ensemble_name,
    base?.ensembleName,
    deepFind(rawPayload, [
      'formation',
      'formacao',
      'formacao_musical',
      'group_name',
      'ensemble_name',
      'evento.formacao',
      'event.formation',
    ]),
    deepFind(presetJson, [
      'formation',
      'formacao',
      'formacao_musical',
      'group_name',
      'ensemble_name',
      'evento.formacao',
      'event.formation',
    ])
  );

  const generalNotes = firstFilled(
    base?.general_notes,
    base?.generalNotes,
    base?.observacoes_gerais,
    base?.observacoesGerais,
    deepFind(rawPayload, ['general_notes', 'observacoes_gerais', 'event.notes']),
    deepFind(presetJson, ['general_notes', 'observacoes_gerais', 'event.notes'])
  );

  safeLog({
    strategy: 'to-repertoire-payload',
    status: 'hero-data-preview',
    hero: {
      clientName,
      eventDate,
      eventTime,
      locationName,
      addressLine,
      neighborhood,
      city,
      state,
      zipCode,
      fullLocation,
      formation,
    },
    rawPayloadKeys: Object.keys(rawPayload || {}),
    presetJsonKeys: Object.keys(presetJson || {}),
    baseKeys: Object.keys(base || {}),
  });

  return {
    raw: {
      config: configRow || null,
      items: itemRows || [],
      fallback: fallbackRow || null,
      rawPayload,
      presetJson,
    },
    title: firstFilled(base?.title, base?.nome, base?.evento, 'Repertório — Cerimonial Musical'),
    subtitle: firstFilled(base?.subtitle, base?.subtitulo, clientName),
    eventDate,
    clientName,
    eventTime,
    locationName: fullLocation,
    formation,
    generalNotes,
    cortejo: sections.cortejo,
    cerimonia: sections.cerimonia,
    saida: sections.saida,
    antessala: sections.antessala,
    receptivo: sections.receptivo,
    songs: allItems,
  };
}
async function fetchEventMetaByEventId({ supabase, eventId, token }) {
  const lookupCandidates = buildLookupCandidates(eventId);
  if (!lookupCandidates.length) return {};

  const tryMaybeSingle = async (table, column, lookupValue) => {
    const { data, error } = await supabase.from(table).select('*').eq(column, lookupValue).maybeSingle();

    if (error) {
      if (isMissingSchemaError(error)) {
        safeLog({
          token,
          strategy: 'event-meta',
          status: 'skip-missing-schema',
          table,
          column,
          lookupValue,
          error: error.message,
        });
        return null;
      }

      throw new Error(`Erro ao buscar metadados do evento em ${table}.${column}: ${error.message}`);
    }

    return data || null;
  };

  let eventRow = null;
  let contractRow = null;
  let precontractRow = null;

  for (const lookupValue of lookupCandidates) {
    if (!eventRow) {
      eventRow = await tryMaybeSingle('events', 'id', lookupValue);
    }

    if (!contractRow) {
      contractRow = await tryMaybeSingle('contracts', 'event_id', lookupValue);
    }

    if (!precontractRow) {
      precontractRow = await tryMaybeSingle('precontracts', 'event_id', lookupValue);
    }
  }

  safeLog({
    token,
    strategy: 'event-meta',
    status: 'resolved',
    eventId,
    hasEventRow: Boolean(eventRow),
    hasContractRow: Boolean(contractRow),
    hasPrecontractRow: Boolean(precontractRow),
  });

  return {
    eventRow,
    contractRow,
    precontractRow,
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
    status: 'query-result',
    eventId,
    hasConfig: Boolean(configRow),
    itemsCount: itemRows.length,
    configColumn,
    configLookupValue,
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

  const { eventRow, contractRow, precontractRow } = await fetchEventMetaByEventId({
    supabase,
    eventId,
    token,
  });

  const mergedBase = {
    ...(eventRow || {}),
    ...(precontractRow || {}),
    ...(contractRow || {}),
    ...(configRow || {}),
  };

  safeLog({
    token,
    strategy: 'event-id-resolution',
    status: 'meta-merged',
    eventId,
    preview: {
      client_name:
        mergedBase?.client_name ||
        mergedBase?.nome_cliente ||
        mergedBase?.customer_name ||
        mergedBase?.nome_noivo ||
        null,
      event_date: mergedBase?.event_date || mergedBase?.data_evento || null,
      event_time:
        mergedBase?.event_time ||
        mergedBase?.horario_evento ||
        mergedBase?.hora_evento ||
        null,
      location_name:
        mergedBase?.location_name ||
        mergedBase?.local_evento ||
        mergedBase?.location ||
        null,
      formation:
        mergedBase?.formation ||
        mergedBase?.formacao ||
        mergedBase?.formacao_musical ||
        null,
    },
  });

  return toRepertoirePayload({
    configRow: mergedBase,
    itemRows,
    fallbackRow: null,
  });
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
    return ({ fallbackRow: row });
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

    return ({ configRow: directConfig.data, itemRows: [] });
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
