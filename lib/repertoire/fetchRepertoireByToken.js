import { getSupabaseAdminClient } from './supabaseAdminClient.js';

const DEFAULT_REPERTOIRE_TABLE = 'repertoires';
const REPERTOIRE_CONFIG_TABLE = 'repertoire_config';
const REPERTOIRE_ITEMS_TABLE = 'repertoire_items';
const REPERTOIRE_TOKENS_TABLE = 'repertoire_tokens';
const CONTRACTS_TABLE = 'contracts';
const PRECONTRACTS_TABLE = 'precontracts';

const TOKEN_COLUMNS = ['token', 'access_token', 'share_token', 'pdf_token', 'public_token'];
const EVENT_ID_COLUMNS = ['event_id', 'evento_id'];

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
  const songsFromItems = Array.isArray(itemRows)
    ? itemRows.map((item) => ({
        title: item?.title || item?.song_title || item?.nome || item?.song || 'Música sem título',
        artist: item?.artist || item?.artista || '',
        notes: item?.notes || item?.observacoes || '',
      }))
    : [];

  const songs = songsFromItems.length ? songsFromItems : normalizeSongList(base);

  return {
    raw: {
      config: configRow || null,
      items: itemRows || [],
      fallback: fallbackRow || null,
    },
    title: base.title || base.nome || base.evento || 'Repertório Premium',
    subtitle: base.subtitle || base.subtitulo || base.client_name || base.nome_cliente || '',
    eventDate: base.event_date || base.data_evento || base.date || null,
    songs,
  };
}

async function fetchRepertoireByEventId({ supabase, eventId, token, fromFallback }) {
  const normalizedEventId = Number(eventId);

  if (!Number.isFinite(normalizedEventId) || normalizedEventId <= 0) {
    safeLog({
      token,
      strategy: 'event-id-resolution',
      status: 'invalid-event-id',
      eventId,
      fromFallback,
    });
    return null;
  }

  const configResults = await Promise.all(
    EVENT_ID_COLUMNS.map((column) =>
      supabase.from(REPERTOIRE_CONFIG_TABLE).select('*').eq(column, normalizedEventId).maybeSingle()
    )
  );

  let configRow = null;
  let configColumn = null;

  for (let index = 0; index < configResults.length; index += 1) {
    const result = configResults[index];
    const column = EVENT_ID_COLUMNS[index];

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
      break;
    }
  }

  const itemsResults = await Promise.all(
    EVENT_ID_COLUMNS.map((column) =>
      supabase
        .from(REPERTOIRE_ITEMS_TABLE)
        .select('*')
        .eq(column, normalizedEventId)
        .order('position', { ascending: true })
    )
  );

  let itemRows = [];
  let itemsColumn = null;

  for (let index = 0; index < itemsResults.length; index += 1) {
    const result = itemsResults[index];
    const column = EVENT_ID_COLUMNS[index];

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
      break;
    }
  }

  if (!configRow && itemRows.length === 0) {
    safeLog({
      token,
      strategy: 'event-id-resolution',
      status: 'not-found',
      eventId: normalizedEventId,
      fromFallback,
    });
    return null;
  }

  safeLog({
    token,
    strategy: 'event-id-resolution',
    status: 'resolved',
    eventId: normalizedEventId,
    fromFallback,
    configColumn,
    itemsColumn,
    hasConfig: Boolean(configRow),
    itemsCount: itemRows.length,
  });

  return toRepertoirePayload({ configRow, itemRows });
}

function extractEventId(row) {
  for (const column of EVENT_ID_COLUMNS) {
    const value = row?.[column];
    if (value != null && `${value}`.trim() !== '') {
      return value;
    }
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
  });

  const directRepertoire = await findByToken({
    supabase,
    table: repertoireTable,
    columns: TOKEN_COLUMNS,
    token: normalizedToken,
    context: 'direct-repertoire-token',
  });

  if (directRepertoire) {
    const directEventId = extractEventId(directRepertoire.data);
    if (directEventId) {
      const fromEvent = await fetchRepertoireByEventId({
        supabase,
        eventId: directEventId,
        token: normalizedToken,
        fromFallback: false,
      });

      if (fromEvent) {
        safeLog({
          token: normalizedToken,
          strategy: 'direct-repertoire-token',
          status: 'resolved-via-event-id',
          table: directRepertoire.table,
          column: directRepertoire.column,
          eventId: directEventId,
        });
        return fromEvent;
      }
    }

    safeLog({
      token: normalizedToken,
      strategy: 'direct-repertoire-token',
      status: 'resolved-direct-row',
      table: directRepertoire.table,
      column: directRepertoire.column,
      eventId: directEventId,
    });

    return toRepertoirePayload({ fallbackRow: directRepertoire.data });
  }

  const directConfig = await findByToken({
    supabase,
    table: REPERTOIRE_CONFIG_TABLE,
    columns: TOKEN_COLUMNS,
    token: normalizedToken,
    context: 'direct-repertoire-config-token',
  });

  if (directConfig) {
    const eventId = extractEventId(directConfig.data);
    if (eventId) {
      const fromEvent = await fetchRepertoireByEventId({
        supabase,
        eventId,
        token: normalizedToken,
        fromFallback: false,
      });

      if (fromEvent) {
        safeLog({
          token: normalizedToken,
          strategy: 'direct-repertoire-config-token',
          status: 'resolved-via-event-id',
          eventId,
        });
        return fromEvent;
      }
    }

    safeLog({
      token: normalizedToken,
      strategy: 'direct-repertoire-config-token',
      status: 'resolved-direct-config',
      eventId,
    });

    return toRepertoirePayload({ configRow: directConfig.data, itemRows: [] });
  }

  const tokenToEventStrategies = [
    { table: REPERTOIRE_TOKENS_TABLE, label: 'repertoire-token-table' },
    { table: CONTRACTS_TABLE, label: 'contracts-public-token' },
    { table: PRECONTRACTS_TABLE, label: 'precontracts-public-token' },
  ];

  for (const strategy of tokenToEventStrategies) {
    const found = await findByToken({
      supabase,
      table: strategy.table,
      columns: TOKEN_COLUMNS,
      token: normalizedToken,
      context: strategy.label,
    });

    if (!found) continue;

    const eventId = extractEventId(found.data);
    safeLog({
      token: normalizedToken,
      strategy: strategy.label,
      status: 'token-resolved',
      table: found.table,
      column: found.column,
      eventId,
    });

    if (!eventId) {
      continue;
    }

    const repertoire = await fetchRepertoireByEventId({
      supabase,
      eventId,
      token: normalizedToken,
      fromFallback: true,
    });

    if (repertoire) {
      safeLog({
        token: normalizedToken,
        strategy: strategy.label,
        status: 'resolved',
        eventId,
      });
      return repertoire;
    }
  }

  safeLog({
    token: normalizedToken,
    strategy: 'final',
    status: 'not-found',
  });

  return null;
}
