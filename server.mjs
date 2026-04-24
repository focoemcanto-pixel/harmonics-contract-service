import express from 'express';
import cors from 'cors';
import { generateGoogleContract } from './lib/contracts/googleContractGenerator.js';
import { fetchRepertoireByToken } from './lib/repertoire/fetchRepertoireByToken.js';
import { renderPremiumRepertoireHtml } from './lib/repertoire/renderPremiumRepertoireHtml.js';
import { generatePdfFromHtml } from './lib/repertoire/generatePdfFromHtml.js';
import { renderPremiumContractHtml } from './lib/contracts/renderPremiumContractHtml.js';

const app = express();

const PORT = Number(process.env.PORT || 3000);
const CONTRACT_SERVICE_API_KEY = String(
  process.env.CONTRACT_SERVICE_API_KEY || ''
).trim();
const ALLOWED_ORIGIN = String(process.env.ALLOWED_ORIGIN || '*').trim();

app.disable('x-powered-by');

app.use(
  cors({
    origin: ALLOWED_ORIGIN === '*' ? true : ALLOWED_ORIGIN,
    credentials: false,
  })
);

app.use(express.json({ limit: '10mb' }));

function maskValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.length <= 12) return `${raw.slice(0, 4)}...`;
  return `${raw.slice(0, 6)}...${raw.slice(-4)}`;
}

function requireApiKey(req, res, next) {
  return next();
}

function validateGeneratePayload(body) {
  const templateId = String(body?.templateId || '').trim();
  const rootFolderId = String(body?.rootFolderId || '').trim();
  const contractName = String(body?.contractName || '').trim();
  const eventDate = String(body?.eventDate || '').trim();
  const templateData =
    body?.templateData && typeof body.templateData === 'object' && !Array.isArray(body.templateData)
      ? body.templateData
      : null;

  const missing = [];
  if (!templateId) missing.push('templateId');
  if (!rootFolderId) missing.push('rootFolderId');
  if (!contractName) missing.push('contractName');
  if (!eventDate) missing.push('eventDate');
  if (!templateData) missing.push('templateData');

  return {
    valid: missing.length === 0,
    missing,
    payload: {
      templateId,
      rootFolderId,
      contractName,
      eventDate,
      templateData,
    },
  };
}

app.get('/health', (_req, res) => {
  return res.status(200).json({
    ok: true,
    service: 'harmonics-contract-service',
    message: 'Service is healthy',
    env: {
      hasGoogleClientId: Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID),
      hasGoogleClientSecret: Boolean(process.env.GOOGLE_OAUTH_CLIENT_SECRET),
      hasGoogleRedirectUri: Boolean(process.env.GOOGLE_OAUTH_REDIRECT_URI),
      hasGoogleRefreshToken: Boolean(process.env.GOOGLE_OAUTH_REFRESH_TOKEN),
      hasContractServiceApiKey: Boolean(CONTRACT_SERVICE_API_KEY),
      allowedOrigin: ALLOWED_ORIGIN || '*',
      port: PORT,
    },
  });
});

app.post('/api/contracts/generate', requireApiKey, async (req, res) => {
  try {
    const validation = validateGeneratePayload(req.body);

    if (!validation.valid) {
      return res.status(400).json({
        ok: false,
        message: `Payload inválido. Campos obrigatórios faltando: ${validation.missing.join(', ')}`,
      });
    }

    const {
      templateId,
      rootFolderId,
      contractName,
      eventDate,
      templateData,
    } = validation.payload;

    console.log('[contract-service] generate request received', {
      templateId,
      rootFolderId,
      contractName,
      eventDate,
      templateDataKeys: Object.keys(templateData || {}),
      apiKeyProvided: Boolean(req.headers['x-api-key']),
      googleRefreshTokenMasked: maskValue(process.env.GOOGLE_OAUTH_REFRESH_TOKEN),
    });

    const generated = await generateGoogleContract({
      templateId,
      rootFolderId,
      templateData,
      contractName,
      eventDate,
    });

    return res.status(200).json({
      ok: true,
      docId: generated.docId,
      docUrl: generated.docUrl,
      pdfId: generated.pdfId,
      pdfUrl: generated.pdfUrl,
      folderYear: generated.folderYear,
      folderMonth: generated.folderMonth,
    });
  } catch (error) {
    console.error('[contract-service] erro ao gerar contrato:', {
      message: error?.message,
      stack: error?.stack,
    });

    return res.status(500).json({
      ok: false,
      message: error?.message || 'Erro ao gerar contrato no Render.',
      errorType: error?.name || 'ContractServiceError',
    });
  }
});



app.post('/api/contracts/html-to-pdf', requireApiKey, async (req, res) => {
  try {
    const html = String(req.body?.html ?? '').trim();
    const responseFormat = String(req.body?.responseFormat || 'base64').trim().toLowerCase();
    const fileName =
      String(req.body?.fileName || 'contrato-premium.pdf')
        .trim()
        .replace(/[\/:*?"<>|#]/g, '') || 'contrato-premium.pdf';

    if (!html) {
      return res.status(400).json({
        ok: false,
        message: 'Campo html é obrigatório para gerar PDF.',
      });
    }

    const premiumHtml = renderPremiumContractHtml(html);
    const pdfBuffer = await generatePdfFromHtml(premiumHtml);

    if (responseFormat === 'binary') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
      return res.status(200).send(pdfBuffer);
    }

    return res.status(200).json({
      ok: true,
      fileName,
      mimeType: 'application/pdf',
      pdfBase64: pdfBuffer.toString('base64'),
      bytes: pdfBuffer.length,
    });
  } catch (error) {
    console.error('[contract-service] erro ao gerar PDF premium de contrato:', {
      message: error?.message,
      stack: error?.stack,
    });

    return res.status(500).json({
      ok: false,
      message: error?.message || 'Erro ao gerar PDF premium do contrato.',
      errorType: error?.name || 'ContractPdfServiceError',
    });
  }
});

app.get('/api/repertoire/pdf/:token', requireApiKey, async (req, res) => {
  try {
    const token = String(req.params?.token || '').trim();

    console.log('[contract-service] repertoire pdf request received', {
      token,
      tokenPreview: token ? `${token.slice(0, 6)}...${token.slice(-4)}` : null,
    });

    if (!token) {
      return res.status(400).json({
        ok: false,
        message: 'Token do repertório é obrigatório.',
      });
    }

    const repertoire = await fetchRepertoireByToken(token);

    if (!repertoire) {
      return res.status(404).json({
        ok: false,
        message: 'Repertório não encontrado para o token informado.',
      });
    }

    const html = renderPremiumRepertoireHtml(repertoire);
    const pdfBuffer = await generatePdfFromHtml(html);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'private, max-age=120');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="repertorio-premium-${token.slice(0, 8)}.pdf"`
    );

    return res.status(200).send(pdfBuffer);
  } catch (error) {
    console.error('[contract-service] erro ao gerar PDF premium de repertório:', {
      message: error?.message,
      stack: error?.stack,
      token: req.params?.token,
    });

    return res.status(500).json({
      ok: false,
      message: error?.message || 'Erro ao gerar PDF premium do repertório.',
      errorType: error?.name || 'RepertoirePdfServiceError',
    });
  }
});

app.use((req, res) => {
  return res.status(404).json({
    ok: false,
    message: `Rota não encontrada: ${req.method} ${req.originalUrl}`,
  });
});

app.listen(PORT, () => {
  console.log('[contract-service] server started', {
    port: PORT,
    healthUrl: `/health`,
    generateUrl: `/api/contracts/generate`,
    hasApiKey: Boolean(CONTRACT_SERVICE_API_KEY),
    allowedOrigin: ALLOWED_ORIGIN || '*',
  });
});
