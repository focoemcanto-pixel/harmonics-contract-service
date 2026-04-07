import { google } from 'googleapis';

function getGoogleAuth() {
  if (!google) {
    throw new Error('googleapis não está disponível no runtime.');
  }

  const clientId = String(process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim();
  const redirectUri = String(process.env.GOOGLE_OAUTH_REDIRECT_URI || '').trim();
  let refreshToken = String(process.env.GOOGLE_OAUTH_REFRESH_TOKEN || '').trim();

  refreshToken = refreshToken.replace(/^"(.*)"$/, '$1').trim();

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
    oauth2Client.setCredentials({
      refresh_token: refreshToken,
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
    '01 - Janeiro', '02 - Fevereiro', '03 - Março', '04 - Abril', '05 - Maio',
    '06 - Junho', '07 - Julho', '08 - Agosto', '09 - Setembro', '10 - Outubro',
    '11 - Novembro', '12 - Dezembro',
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

async function processConditionalBlocks(docs, documentId, templateData) {
  let guard = 0;
  while (guard < 20) {
    guard += 1;

    const doc = await docs.documents.get({ documentId });
    const bodyContent = doc?.data?.body?.content || [];
    const segments = collectTextSegments(bodyContent);
    const { fullText, map } = buildDocumentTextMap(segments);
    const blocks = findConditionalBlocks(fullText);

    if (!blocks.length) {
      return;
    }

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
              range: {
                startIndex,
                endIndex,
              },
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

    if (!requests.length) {
      return;
    }

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

  // Verifica se os parâmetros obrigatórios estão presentes
  if (!templateId || !rootFolderId) {
    console.error('Erro: templateId e rootFolderId são necessários!');
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
        body: Buffer.from(pdfBuffer),
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
    docId,
    docUrl: `https://docs.google.com/document/d/${docId}/edit`,
    pdfId: pdfCreated.data.id,
    pdfUrl: pdfCreated.data.webViewLink || `https://drive.google.com/file/d/${pdfCreated.data.id}/view`,
    folderYear: year,
    folderMonth: month,
  };
}
