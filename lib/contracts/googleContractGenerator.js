import { google } from 'googleapis';
import { Readable } from 'stream';

function maskToken(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.length <= 12) return `${raw.slice(0, 4)}...`;
  return `${raw.slice(0, 6)}...${raw.slice(-4)}`;
}

function getGoogleAuth() {
  if (!google) {
    throw new Error('googleapis não está disponível no runtime.');
  }

  const clientId = String(process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim();
  const redirectUri = String(process.env.GOOGLE_OAUTH_REDIRECT_URI || '').trim();
  let refreshToken = String(process.env.GOOGLE_OAUTH_REFRESH_TOKEN || '').trim();

  refreshToken = refreshToken.replace(/^"(.*)"$/, '$1').trim();

  console.log('[googleContractGenerator] OAuth env diagnostics:', {
    hasClientId: Boolean(clientId),
    hasClientSecret: Boolean(clientSecret),
    hasRedirectUri: Boolean(redirectUri),
    hasRefreshToken: Boolean(refreshToken),
    refreshTokenMasked: maskToken(refreshToken),
  });

  if (!clientId) throw new Error('GOOGLE_OAUTH_CLIENT_ID não definida.');
  if (!clientSecret) throw new Error('GOOGLE_OAUTH_CLIENT_SECRET não definida.');
  if (!redirectUri) throw new Error('GOOGLE_OAUTH_REDIRECT_URI não definida.');
  if (!refreshToken) throw new Error('GOOGLE_OAUTH_REFRESH_TOKEN não definida.');

  let oauth2Client;
  try {
    oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  } catch (error) {
    console.error('[googleContractGenerator] erro ao criar OAuth2 client:', error);
    throw new Error(`Falha ao criar client OAuth2: ${error?.message || 'erro desconhecido'}`);
  }

  try {
    console.log('[googleContractGenerator] antes do setCredentials:', {
      oauth2CredentialsType: typeof oauth2Client.credentials,
      oauth2CredentialsIsArray: Array.isArray(oauth2Client.credentials),
      refreshTokenMasked: maskToken(refreshToken),
    });

    if (!oauth2Client.credentials || typeof oauth2Client.credentials !== 'object') {
      oauth2Client.credentials = {};
    }

    oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });

    console.log('[googleContractGenerator] depois do setCredentials:', {
      oauth2CredentialsType: typeof oauth2Client.credentials,
      oauth2CredentialsIsArray: Array.isArray(oauth2Client.credentials),
      hasRefreshToken: Boolean(oauth2Client?.credentials?.refresh_token),
      refreshTokenMasked: maskToken(oauth2Client?.credentials?.refresh_token),
    });
  } catch (error) {
    console.error('[googleContractGenerator] erro em setCredentials:', error);
    throw new Error(`Falha ao aplicar refresh token: ${error?.message || 'erro desconhecido'}`);
  }

  return oauth2Client;
}

function sanitizeFileName(value) {
  return String(value || 'Contrato')
    .replace(/[\\/:*?"<>|#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function monthFolderLabel(dateString) {
  const months = [
    '01 - Janeiro', '02 - Fevereiro', '03 - Março', '04 - Abril',
    '05 - Maio', '06 - Junho', '07 - Julho', '08 - Agosto',
    '09 - Setembro', '10 - Outubro', '11 - Novembro', '12 - Dezembro',
  ];

  const raw = String(dateString || '').slice(0, 10);
  const [year, month] = raw.split('-');

  return {
    year: year || String(new Date().getFullYear()),
    month: months[Number(month || 1) - 1] || months[0],
  };
}

async function findChildFolderByName(drive, parentId, name) {
  const q = [
    `'${parentId}' in parents`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    `trashed = false`,
    `name = '${name.replace(/'/g, "\\'")}'`,
  ].join(' and ');

  const res = await drive.files.list({
    q,
    fields: 'files(id,name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  return res?.data?.files?.[0] || null;
}

async function ensureFolder(drive, parentId, name) {
  const existing = await findChildFolderByName(drive, parentId, name);
  if (existing?.id) return existing.id;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id,name',
    supportsAllDrives: true,
  });

  return created.data.id;
}

function isTruthyTemplateValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'boolean') return value;

  const s = String(value).trim().toLowerCase();
  return !(s === '' || s === 'false' || s === '0');
}

function collectTextSegments(bodyContent) {
  const segments = [];

  function walkElements(elements) {
    if (!Array.isArray(elements)) return;

    for (const el of elements) {
      if (
        el?.textRun?.content &&
        typeof el.startIndex === 'number' &&
        typeof el.endIndex === 'number'
      ) {
        segments.push({
          text: el.textRun.content,
          startIndex: el.startIndex,
          endIndex: el.endIndex,
        });
      }
    }
  }

  function walkTable(table) {
    const rows = table?.tableRows || [];
    for (const row of rows) {
      const cells = row?.tableCells || [];
      for (const cell of cells) {
        const content = cell?.content || [];
        walkContent(content);
      }
    }
  }

  function walkContent(content) {
    for (const item of content || []) {
      if (item?.paragraph?.elements) walkElements(item.paragraph.elements);
      if (item?.table) walkTable(item.table);
      if (item?.tableOfContents?.content) walkContent(item.tableOfContents.content);
    }
  }

  walkContent(bodyContent);
  return segments;
}

function buildDocumentTextMap(segments) {
  let fullText = '';
  const map = [];

  for (const seg of segments) {
    const text = String(seg.text || '');
    if (!text) continue;

    const textStart = fullText.length;
    fullText += text;
    const textEnd = fullText.length;

    map.push({
      textStart,
      textEnd,
      docStart: seg.startIndex,
      docEnd: seg.endIndex,
      text,
    });
  }

  return { fullText, map };
}

function textOffsetToDocIndex(map, offset) {
  for (const seg of map) {
    if (offset >= seg.textStart && offset < seg.textEnd) {
      return seg.docStart + (offset - seg.textStart);
    }
  }

  if (map.length && offset === map[map.length - 1].textEnd) {
    return map[map.length - 1].docEnd;
  }

  return null;
}

function findConditionalBlocks(fullText) {
  const regex = /\{\{#([A-Z0-9_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
  const matches = [];
  let match;

  while ((match = regex.exec(fullText)) !== null) {
    const fullMatch = match[0];
    const key = match[1];
    const inner = match[2];
    const start = match.index;
    const end = start + fullMatch.length;

    const openMarker = `{{#${key}}}`;
    const closeMarker = `{{/${key}}}`;

    const openStart = start;
    const openEnd = openStart + openMarker.length;
    const closeEnd = end;
    const closeStart = closeEnd - closeMarker.length;

    matches.push({
      key,
      inner,
      start,
      end,
      openStart,
      openEnd,
      closeStart,
      closeEnd,
    });
  }

  return matches;
}

async function processConditionalBlocks(docs, documentId, templateData) {
  let guard = 0;

  while (guard < 20) {
    guard += 1;

    const doc = await docs.documents.get({ documentId });
    const bodyContent = doc?.data?.body?.content || [];
    const segments = collectTextSegments(bodyContent);
    const { fullText, map } = buildDocumentTextMap(segments);
    const blocks = findConditionalBlocks(fullText);

    if (!blocks.length) return;

    const requests = [];

    for (let i = blocks.length - 1; i >= 0; i -= 1) {
      const block = blocks[i];
      const keep = isTruthyTemplateValue(templateData[block.key]);

      if (!keep) {
        const startIndex = textOffsetToDocIndex(map, block.start);
        const endIndex = textOffsetToDocIndex(map, block.end);

        if (
          typeof startIndex === 'number' &&
          typeof endIndex === 'number' &&
          endIndex > startIndex
        ) {
          requests.push({
            deleteContentRange: {
              range: { startIndex, endIndex },
            },
          });
        }

        continue;
      }

      const closeStartIndex = textOffsetToDocIndex(map, block.closeStart);
      const closeEndIndex = textOffsetToDocIndex(map, block.closeEnd);

      if (
        typeof closeStartIndex === 'number' &&
        typeof closeEndIndex === 'number' &&
        closeEndIndex > closeStartIndex
      ) {
        requests.push({
          deleteContentRange: {
            range: {
              startIndex: closeStartIndex,
              endIndex: closeEndIndex,
            },
          },
        });
      }

      const openStartIndex = textOffsetToDocIndex(map, block.openStart);
      const openEndIndex = textOffsetToDocIndex(map, block.openEnd);

      if (
        typeof openStartIndex === 'number' &&
        typeof openEndIndex === 'number' &&
        openEndIndex > openStartIndex
      ) {
        requests.push({
          deleteContentRange: {
            range: {
              startIndex: openStartIndex,
              endIndex: openEndIndex,
            },
          },
        });
      }
    }

    if (!requests.length) return;

    await docs.documents.batchUpdate({
      documentId,
      requestBody: { requests },
    });
  }

  throw new Error('Não foi possível finalizar o processamento dos blocos condicionais.');
}

async function replaceSimplePlaceholders(docs, documentId, templateData) {
  const requests = [];

  Object.entries(templateData).forEach(([key, value]) => {
    requests.push({
      replaceAllText: {
        containsText: {
          text: `{{${key}}}`,
          matchCase: true,
        },
        replaceText: String(value ?? ''),
      },
    });
  });

  if (!requests.length) return;

  await docs.documents.batchUpdate({
    documentId,
    requestBody: { requests },
  });
}

export async function generateGoogleContract({
  templateId,
  rootFolderId,
  templateData,
  contractName,
  eventDate,
}) {
  if (!google) {
    throw new Error('googleapis não foi carregado corretamente no runtime.');
  }

  if (!templateId || !rootFolderId) {
    throw new Error('templateId e rootFolderId são necessários.');
  }

  console.log('[googleContractGenerator] Iniciando validação do template...', {
    templateId,
    rootFolderId,
    contractName,
    eventDate,
  });

  const auth = getGoogleAuth();
  const drive = google.drive({ version: 'v3', auth });
  const docs = google.docs({ version: 'v1', auth });

  try {
    await drive.files.get({
      fileId: templateId,
      fields: 'id,name,mimeType',
      supportsAllDrives: true,
    });
  } catch (error) {
    console.error('[googleContractGenerator] Erro ao acessar o template no Google Drive:', error);
    throw new Error('Falha ao acessar o template no Google Drive.');
  }

  const { year, month } = monthFolderLabel(eventDate);
  const yearFolderId = await ensureFolder(drive, rootFolderId, year);
  const monthFolderId = await ensureFolder(drive, yearFolderId, month);

  console.log('[googleContractGenerator] Pastas no Google Drive verificadas com sucesso', {
    year,
    month,
    yearFolderId,
    monthFolderId,
  });

  const copied = await drive.files.copy({
    fileId: templateId,
    requestBody: {
      name: sanitizeFileName(contractName),
      parents: [monthFolderId],
    },
    fields: 'id,name,webViewLink',
    supportsAllDrives: true,
  });

  const docId = copied.data.id;
  if (!docId) {
    throw new Error('Não foi possível copiar o template do contrato no Google Docs.');
  }

  console.log('[googleContractGenerator] Documento copiado com sucesso', {
    docId,
    copiedName: copied.data.name,
  });

  await processConditionalBlocks(docs, docId, templateData);
  await replaceSimplePlaceholders(docs, docId, templateData);

  console.log('[googleContractGenerator] Placeholders aplicados com sucesso', {
    docId,
  });

  let pdfBuffer;
  try {
    const pdfRes = await drive.files.export(
      {
        fileId: docId,
        mimeType: 'application/pdf',
      },
      { responseType: 'arraybuffer' }
    );

    pdfBuffer = Buffer.from(pdfRes.data, 'binary');
  } catch (error) {
    console.error('[googleContractGenerator] Erro ao exportar PDF:', error);
    throw new Error('Falha ao exportar o contrato para PDF no Google Drive.');
  }

  if (!pdfBuffer || !pdfBuffer.length) {
    throw new Error('O Google retornou um PDF vazio ao exportar o contrato.');
  }

  console.log('[googleContractGenerator] PDF exportado com sucesso', {
    docId,
    pdfBytes: pdfBuffer.length,
  });

  let pdfCreated;
  try {
    pdfCreated = await drive.files.create({
      requestBody: {
        name: `${sanitizeFileName(contractName)}.pdf`,
        parents: [monthFolderId],
      },
     media: {
  mimeType: 'application/pdf',
  body: Readable.from(pdfBuffer),
},
      fields: 'id,name,webViewLink,webContentLink',
      supportsAllDrives: true,
    });
  } catch (error) {
    console.error('[googleContractGenerator] Erro ao salvar PDF:', error);
    throw new Error(
      error?.response?.data?.error?.message ||
      error?.message ||
      'Falha ao salvar o PDF do contrato no Google Drive.'
    );
  }

  if (!pdfCreated?.data?.id) {
    throw new Error('O PDF foi exportado, mas não foi salvo corretamente no Google Drive.');
  }

  console.log('[googleContractGenerator] PDF salvo com sucesso', {
    pdfId: pdfCreated.data.id,
    pdfName: pdfCreated.data.name,
  });

  return {
    ok: true,
    docId,
    docUrl: `https://docs.google.com/document/d/${docId}/edit`,
    pdfId: pdfCreated.data.id,
    pdfUrl:
      pdfCreated.data.webViewLink ||
      `https://drive.google.com/file/d/${pdfCreated.data.id}/view`,
    folderYear: year,
    folderMonth: month,
  };
}
