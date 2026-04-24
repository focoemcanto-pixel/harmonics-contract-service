import express from 'express';
import cors from 'cors';
import { generateGoogleContract } from './lib/contracts/googleContractGenerator.js';
import { fetchRepertoireByToken } from './lib/repertoire/fetchRepertoireByToken.js';
import { renderPremiumRepertoireHtml } from './lib/repertoire/renderPremiumRepertoireHtml.js';
import { generatePdfFromHtml } from './lib/repertoire/generatePdfFromHtml.js';
import { renderPremiumContractHtml } from './lib/contracts/renderPremiumContractHtml.js';
import { getSupabaseAdminClient } from './lib/repertoire/supabaseAdminClient.js';

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

function getSupabaseSafe() {
  return getSupabaseAdminClient();
}

function parseCurrency(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toIsoDateOnly(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function normalizePaymentStatus(status) {
  const valid = new Set(['confirmado', 'pendente', 'em análise']);
  const normalized = String(status || '').trim().toLowerCase();
  return valid.has(normalized) ? normalized : null;
}

function normalizePaymentMethod(method) {
  const valid = new Set(['pix', 'cartão', 'dinheiro', 'transferência', 'outro']);
  const normalized = String(method || '').trim().toLowerCase();
  return valid.has(normalized) ? normalized : null;
}

function mapFormationToMusicians(formation) {
  const normalized = String(formation || '').trim().toLowerCase();
  const formationMap = {
    solo: 1,
    duo: 2,
    trio: 3,
    quarteto: 4,
    quinteto: 5,
  };
  return formationMap[normalized] || 0;
}

async function atualizarResumoEvento(eventId) {
  const supabase = getSupabaseSafe();
  const numericEventId = Number(eventId);
  if (!Number.isFinite(numericEventId)) {
    throw new Error('eventId inválido para atualizar resumo.');
  }

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select(
      'id,agreed_amount,musician_cost,sound_cost,extra_transport_cost,other_cost'
    )
    .eq('id', numericEventId)
    .single();

  if (eventError) throw eventError;

  const { data: payments, error: paymentsError } = await supabase
    .from('payments')
    .select('id,amount,status')
    .eq('event_id', numericEventId);

  if (paymentsError) throw paymentsError;

  const paidAmount = (payments || [])
    .filter((payment) => normalizePaymentStatus(payment.status) === 'confirmado')
    .reduce((acc, payment) => acc + parseCurrency(payment.amount), 0);

  const agreedAmount = parseCurrency(event.agreed_amount);
  const openAmount = Math.max(agreedAmount - paidAmount, 0);

  const costs =
    parseCurrency(event.musician_cost) +
    parseCurrency(event.sound_cost) +
    parseCurrency(event.extra_transport_cost) +
    parseCurrency(event.other_cost);

  const netAmount = agreedAmount - costs;

  const paymentStatus =
    paidAmount <= 0 ? 'pendente' : openAmount <= 0 ? 'quitado' : 'parcial';

  const { error: updateError } = await supabase
    .from('events')
    .update({
      paid_amount: paidAmount,
      open_amount: openAmount,
      payment_status: paymentStatus,
      net_amount: netAmount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', numericEventId);

  if (updateError) throw updateError;

  return {
    eventId: numericEventId,
    agreedAmount,
    paidAmount,
    openAmount,
    costs,
    netAmount,
    paymentStatus,
  };
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

app.delete('/api/automation-logs', requireApiKey, async (req, res) => {
  try {
    const supabase = getSupabaseSafe();
    const { ids, olderThanDays, status } = req.body || {};
    let query = supabase.from('automation_logs').delete().select('id');

    if (Array.isArray(ids) && ids.length > 0) {
      query = query.in('id', ids.map((id) => Number(id)).filter(Number.isFinite));
    } else {
      const days = Number(olderThanDays);
      if (Number.isFinite(days) && days > 0) {
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        query = query.lt('created_at', cutoff);
      }

      const normalizedStatus = String(status || '').trim().toLowerCase();
      if (normalizedStatus === 'falhas') query = query.eq('status', 'failed');
      if (normalizedStatus === 'enviados') query = query.eq('status', 'sent');
    }

    const { data, error } = await query;
    if (error) throw error;

    return res.status(200).json({
      ok: true,
      affectedCount: Array.isArray(data) ? data.length : 0,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error?.message || 'Erro ao excluir logs de automação.',
    });
  }
});

app.post('/api/payments/manual', requireApiKey, async (req, res) => {
  try {
    const supabase = getSupabaseSafe();
    const eventId = Number(req.body?.event_id);
    const amount = parseCurrency(req.body?.amount, NaN);
    const paymentDate = toIsoDateOnly(req.body?.payment_date);
    const paymentMethod = normalizePaymentMethod(req.body?.payment_method);
    const status = normalizePaymentStatus(req.body?.status);
    const notes = String(req.body?.notes || '').trim() || null;
    const receiptUrl = String(req.body?.receipt_url || '').trim() || null;
    const clientName = String(req.body?.client_name || '').trim() || null;

    if (!Number.isFinite(eventId)) {
      return res.status(400).json({ ok: false, message: 'event_id é obrigatório.' });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ ok: false, message: 'amount deve ser maior que 0.' });
    }
    if (!paymentDate) {
      return res.status(400).json({ ok: false, message: 'payment_date inválida.' });
    }
    if (!paymentMethod) {
      return res.status(400).json({ ok: false, message: 'payment_method inválido.' });
    }
    if (!status) {
      return res.status(400).json({ ok: false, message: 'status inválido.' });
    }

    const { data: inserted, error: insertError } = await supabase
      .from('payments')
      .insert({
        event_id: eventId,
        amount,
        payment_date: paymentDate,
        payment_method: paymentMethod,
        status,
        notes,
        receipt_url: receiptUrl,
        client_name: clientName,
        source: 'manual',
      })
      .select('*')
      .single();

    if (insertError) throw insertError;

    const resumo = await atualizarResumoEvento(eventId);

    return res.status(201).json({
      ok: true,
      payment: inserted,
      eventSummary: resumo,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error?.message || 'Erro ao inserir pagamento manual.',
    });
  }
});

app.get('/api/finance/cost-defaults', requireApiKey, async (_req, res) => {
  try {
    const supabase = getSupabaseSafe();
    const { data, error } = await supabase
      .from('finance_cost_defaults')
      .select('*')
      .eq('slug', 'default')
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    return res.status(200).json({
      ok: true,
      defaults:
        data || {
          slug: 'default',
          musician_unit_cost: 0,
          sound_default_cost: 0,
          transport_default_cost: 0,
          other_default_cost: 0,
          notes: null,
        },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error?.message || 'Erro ao buscar custos padrão.',
    });
  }
});

app.put('/api/finance/cost-defaults', requireApiKey, async (req, res) => {
  try {
    const supabase = getSupabaseSafe();
    const payload = {
      slug: 'default',
      musician_unit_cost: parseCurrency(req.body?.musician_unit_cost),
      sound_default_cost: parseCurrency(req.body?.sound_default_cost),
      transport_default_cost: parseCurrency(req.body?.transport_default_cost),
      other_default_cost: parseCurrency(req.body?.other_default_cost),
      notes: String(req.body?.notes || '').trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('finance_cost_defaults')
      .upsert(payload, { onConflict: 'slug' })
      .select('*')
      .single();

    if (error) throw error;

    return res.status(200).json({
      ok: true,
      defaults: data,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error?.message || 'Erro ao salvar custos padrão.',
    });
  }
});

app.post('/api/events/:id/apply-default-costs', requireApiKey, async (req, res) => {
  try {
    const supabase = getSupabaseSafe();
    const eventId = Number(req.params?.id);
    if (!Number.isFinite(eventId)) {
      return res.status(400).json({ ok: false, message: 'id do evento inválido.' });
    }

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id,formation,has_sound,has_transport,transport_price')
      .eq('id', eventId)
      .single();

    if (eventError) throw eventError;

    const { data: defaults, error: defaultsError } = await supabase
      .from('finance_cost_defaults')
      .select('*')
      .eq('slug', 'default')
      .single();

    if (defaultsError) throw defaultsError;

    const musicianCount = mapFormationToMusicians(event.formation);
    const musicianCost = parseCurrency(defaults.musician_unit_cost) * musicianCount;
    const soundCost = event.has_sound ? parseCurrency(defaults.sound_default_cost) : 0;
    const hasTransport = Boolean(event.has_transport) || parseCurrency(event.transport_price) > 0;
    const transportCost = hasTransport ? parseCurrency(defaults.transport_default_cost) : 0;
    const otherCost = parseCurrency(defaults.other_default_cost);

    const { data: updatedEvent, error: updateError } = await supabase
      .from('events')
      .update({
        musician_cost: musicianCost,
        sound_cost: soundCost,
        extra_transport_cost: transportCost,
        other_cost: otherCost,
        updated_at: new Date().toISOString(),
      })
      .eq('id', eventId)
      .select('*')
      .single();

    if (updateError) throw updateError;
    const summary = await atualizarResumoEvento(eventId);

    return res.status(200).json({
      ok: true,
      event: updatedEvent,
      eventSummary: summary,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error?.message || 'Erro ao aplicar custos padrão no evento.',
    });
  }
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
