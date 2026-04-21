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
function parseJsonSafe(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function deepFind(obj, paths = []) {
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

    const text = String(current ?? '').replace(/\s+/g, ' ').trim();
    if (text) return text;
  }

  return '';
}

function toRepertoirePayload({
  configRow,
  itemRows,
  fallbackRow,
  eventRow = null,
  contractRow = null,
  precontractRow = null,
}) {
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
  const contractRawPayload = parseJsonSafe(contractRow?.raw_payload);
  const contractPresetJson = parseJsonSafe(contractRow?.preset_json);
  const precontractRawPayload = parseJsonSafe(precontractRow?.raw_payload);
  const precontractPresetJson = parseJsonSafe(precontractRow?.preset_json);
  const eventRawPayload = parseJsonSafe(eventRow?.raw_payload);
  const eventPresetJson = parseJsonSafe(eventRow?.preset_json);

  const sourceObjects = [
    { label: 'configRow', value: configRow || {} },
    { label: 'fallbackRow', value: fallbackRow || {} },
    { label: 'eventRow', value: eventRow || {} },
    { label: 'contractRow', value: contractRow || {} },
    { label: 'precontractRow', value: precontractRow || {} },
    { label: 'rawPayload', value: rawPayload || {} },
    { label: 'presetJson', value: presetJson || {} },
    { label: 'contractRawPayload', value: contractRawPayload || {} },
    { label: 'contractPresetJson', value: contractPresetJson || {} },
    { label: 'precontractRawPayload', value: precontractRawPayload || {} },
    { label: 'precontractPresetJson', value: precontractPresetJson || {} },
    { label: 'eventRawPayload', value: eventRawPayload || {} },
    { label: 'eventPresetJson', value: eventPresetJson || {} },
  ];

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

  const findByKeysDeep = (obj, targetKeys = []) => {
    if (!obj || typeof obj !== 'object') return '';

    const normalizedTargets = targetKeys.map((key) => String(key).toLowerCase());
    const visited = new WeakSet();

    const walk = (value) => {
      if (!value || typeof value !== 'object') return '';

      if (visited.has(value)) return '';
      visited.add(value);

      if (Array.isArray(value)) {
        for (const item of value) {
          const found = walk(item);
          if (found) return found;
        }
        return '';
      }

      for (const [key, current] of Object.entries(value)) {
        if (normalizedTargets.includes(String(key).toLowerCase())) {
          const text = compact(current);
          if (text) return text;
        }
      }

      for (const current of Object.values(value)) {
        const found = walk(current);
        if (found) return found;
      }

      return '';
    };

    return walk(obj);
  };

  const findAcrossSources = (paths = [], fallbackKeys = []) => {
    for (const source of sourceObjects) {
      const foundByPath = deepFind(source.value, paths);
      if (foundByPath) return foundByPath;
    }

    if (fallbackKeys.length) {
      for (const source of sourceObjects) {
        const foundByKey = findByKeysDeep(source.value, fallbackKeys);
        if (foundByKey) return foundByKey;
      }
    }

    return '';
  };

  const hasRelevantPdfContent = (item) =>
    Boolean(
      firstFilled(
        item?.songName,
        item?.referenceTitle,
        item?.title,
        item?.referenceLink,
        item?.notes,
        item?.artists,
        item?.genres,
        item?.duration
      )
    );

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
    duration: firstFilled(
      item?.duration,
      item?.tempo,
      item?.time,
      item?.minutes,
      item?.reception_duration
    ),
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

  const allItems = (normalizedItems.length ? normalizedItems : fallbackSongs).filter(
    hasRelevantPdfContent
  );

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

  const previewPaths = {
    clientName: [
      'client_form.full_name',
      'client_form.nome_completo',
      'client.full_name',
      'client.name',
      'cliente.nome_completo',
      'cliente.nome',
      'contractor.full_name',
      'contractor.name',
      'contratante.nome_completo',
      'contratante.nome',
      'client_name',
      'nome_cliente',
      'customer_name',
      'nome_noivo',
    ],
    eventDate: [
      'client_form.event_date',
      'event.date',
      'evento.data',
      'wedding.date',
      'event_date',
      'data_evento',
    ],
    eventTime: [
      'client_form.event_time',
      'event.time',
      'evento.horario',
      'evento.hora',
      'wedding.time',
      'event_time',
      'hora_evento',
      'horario_evento',
    ],
    locationName: [
      'client_form.event_location_name',
      'client_form.event_location_address',
      'event.location_name',
      'event.location_address',
      'evento.local',
      'evento.endereco',
      'venue.name',
      'venue.address',
      'location_name',
      'event_location_name',
      'local_evento',
      'location_address',
      'event_location_address',
      'address',
      'endereco',
    ],
    formation: [
      'client_form.formation',
      'client_form.formacao',
      'event.formation',
      'evento.formacao',
      'formation',
      'formacao',
      'formacao_musical',
      'group_name',
      'ensemble_name',
    ],
  };

  const clientName = firstFilled(
    findAcrossSources(previewPaths.clientName, [
      'full_name',
      'nome_completo',
      'client_name',
      'nome_cliente',
      'customer_name',
      'contractor_name',
      'nome_noivo',
      'name',
      'nome',
    ]),
    base?.title,
    base?.nome
  );

  const eventDate = firstFilled(
    findAcrossSources(previewPaths.eventDate, [
      'event_date',
      'data_evento',
      'date',
      'wedding_date',
    ])
  );

  const eventTime = firstFilled(
    findAcrossSources(previewPaths.eventTime, [
      'event_time',
      'hora_evento',
      'horario_evento',
      'time',
      'horario',
    ])
  );

  const locationName = firstFilled(
    findAcrossSources(
      [
        'client_form.event_location_name',
        'event.location_name',
        'venue.name',
        'location_name',
        'event_location_name',
        'local_evento',
        'location',
        'local',
      ],
      [
        'location_name',
        'event_location_name',
        'venue_name',
        'local_evento',
        'location',
        'local',
        'venue',
      ]
    )
  );

  const addressLine = firstFilled(
    findAcrossSources(
      [
        'client_form.event_location_address',
        'event.location_address',
        'venue.address',
        'event_location_address',
        'event_address',
        'location_address',
        'venue_address',
        'endereco',
        'endereco_evento',
        'address',
      ],
      [
        'event_location_address',
        'event_address',
        'location_address',
        'venue_address',
        'address',
        'endereco',
        'endereco_evento',
      ]
    )
  );

  const neighborhood = firstFilled(
    findAcrossSources(['bairro', 'neighborhood', 'evento.bairro', 'event.neighborhood'], [
      'bairro',
      'neighborhood',
      'district',
    ])
  );

  const city = firstFilled(
    findAcrossSources(['cidade', 'city', 'evento.cidade', 'event.city'], ['cidade', 'city'])
  );

  const state = firstFilled(
    findAcrossSources(['estado', 'state', 'uf', 'evento.uf', 'event.state'], [
      'estado',
      'state',
      'uf',
    ])
  );

  const zipCode = firstFilled(
    findAcrossSources(['cep', 'zip_code', 'zipcode', 'evento.cep', 'event.zip_code'], [
      'cep',
      'zip_code',
      'zipcode',
    ])
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
    findAcrossSources(previewPaths.formation, [
      'formation',
      'formacao',
      'formacao_musical',
      'group_name',
      'ensemble_name',
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

  const sourceKeyMap = Object.fromEntries(
    sourceObjects.map((entry) => [entry.label, Object.keys(entry.value || {})])
  );

  const previewCandidates = Object.fromEntries(
    Object.entries(previewPaths).map(([key, paths]) => [
      key,
      findAcrossSources(paths, [
        key,
        key === 'clientName' ? 'name' : '',
        key === 'formation' ? 'formacao' : '',
      ].filter(Boolean)),
    ])
  );

  safeLog({
    strategy: 'to-repertoire-payload',
    status: 'hero-data-debug',
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
    sourceKeyMap,
    previewCandidates,
  });

  return {
    raw: {
      config: configRow || null,
      items: itemRows || [],
      fallback: fallbackRow || null,
      event: eventRow || null,
      contract: contractRow || null,
      precontract: precontractRow || null,
      rawPayload,
      presetJson,
      contractRawPayload,
      contractPresetJson,
      precontractRawPayload,
      precontractPresetJson,
      eventRawPayload,
      eventPresetJson,
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
    status: 'resolved-debug',
    eventId,
    hasEventRow: Boolean(eventRow),
    hasContractRow: Boolean(contractRow),
    hasPrecontractRow: Boolean(precontractRow),
    eventRowKeys: Object.keys(eventRow || {}),
    contractRowKeys: Object.keys(contractRow || {}),
    precontractRowKeys: Object.keys(precontractRow || {}),
    contractRawPayloadKeys: Object.keys(parseJsonSafe(contractRow?.raw_payload)),
    contractPresetJsonKeys: Object.keys(parseJsonSafe(contractRow?.preset_json)),
    precontractRawPayloadKeys: Object.keys(parseJsonSafe(precontractRow?.raw_payload)),
    precontractPresetJsonKeys: Object.keys(parseJsonSafe(precontractRow?.preset_json)),
    eventRawPayloadKeys: Object.keys(parseJsonSafe(eventRow?.raw_payload)),
    eventPresetJsonKeys: Object.keys(parseJsonSafe(eventRow?.preset_json)),
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
    eventRow,
    contractRow,
    precontractRow,
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
    return toRepertoirePayload({
      configRow: null,
      itemRows: [],
      fallbackRow: row,
    });
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

    return toRepertoirePayload({
      configRow: directConfig.data,
      itemRows: [],
      fallbackRow: null,
    });
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
