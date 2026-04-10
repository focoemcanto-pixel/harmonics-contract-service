import { getSupabaseAdminClient } from './supabaseAdminClient.js';

const DEFAULT_REPERTOIRE_TABLE = 'repertoires';
const TOKEN_COLUMNS = ['token', 'access_token', 'share_token', 'pdf_token'];

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

export async function fetchRepertoireByToken(token) {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) {
    throw new Error('Token do repertório é obrigatório.');
  }

  const supabase = getSupabaseAdminClient();
  const tableName = String(process.env.REPERTOIRE_TABLE || DEFAULT_REPERTOIRE_TABLE).trim();

  for (const tokenColumn of TOKEN_COLUMNS) {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .eq(tokenColumn, normalizedToken)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Erro ao buscar repertório no Supabase (${tokenColumn}): ${error.message}`);
    }

    if (data) {
      return {
        raw: data,
        title: data.title || data.nome || data.evento || 'Repertório Premium',
        subtitle: data.subtitle || data.subtitulo || data.client_name || data.nome_cliente || '',
        eventDate: data.event_date || data.data_evento || data.date || null,
        songs: normalizeSongList(data),
      };
    }
  }

  return null;
}
