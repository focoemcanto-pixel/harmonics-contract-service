require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { getSupabaseAdmin } = require('./lib/supabase-admin');
const { buildContractTemplateData } = require('./lib/contracts/buildContractTemplateData');
const { generateGoogleContract } = require('./lib/contracts/googleContractGenerator');

const app = express();

app.use(express.json({ limit: '2mb' }));

app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN || 'https://app.bandaharmonics.com',
  })
);

function getReadableErrorMessage(error) {
  if (!error) return 'Erro interno ao gerar contrato.';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message || 'Erro interno ao gerar contrato.';
  try {
    return JSON.stringify(error);
  } catch {
    return 'Erro interno ao gerar contrato.';
  }
}

async function getContractContext({ contractId, precontractId, supabase }) {
  let contract = null;

  if (contractId) {
    const { data, error } = await supabase
      .from('contracts')
      .select('*')
      .eq('id', contractId)
      .single();

    if (error) throw new Error(`Erro ao buscar contract: ${error.message}`);
    contract = data;
  } else if (precontractId) {
    const { data, error } = await supabase
      .from('contracts')
      .select('*')
      .eq('precontract_id', precontractId)
      .maybeSingle();

    if (error) throw new Error(`Erro ao buscar contract por precontract: ${error.message}`);
    contract = data || null;
  }

  if (!contract && !precontractId) {
    throw new Error('Informe contractId ou precontractId.');
  }

  const targetPrecontractId = contract?.precontract_id || precontractId || null;
  if (!targetPrecontractId) throw new Error('PrecontractId não encontrado.');

  const { data: precontract, error: preError } = await supabase
    .from('precontracts')
    .select('*')
    .eq('id', targetPrecontractId)
    .single();

  if (preError) throw new Error(`Erro ao buscar precontract: ${preError.message}`);

  let contact = null;
  const targetContactId = contract?.contact_id || precontract?.contact_id || null;

  if (targetContactId) {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', targetContactId)
      .maybeSingle();

    if (error) throw new Error(`Erro ao buscar contact: ${error.message}`);
    contact = data || null;
  }

  let event = null;
  const targetEventId = contract?.event_id || precontract?.event_id || null;

  if (targetEventId) {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', targetEventId)
      .maybeSingle();

    if (error) throw new Error(`Erro ao buscar event: ${error.message}`);
    event = data || null;
  }

  return { contract, precontract, contact, event };
}

function getContractName(context) {
  const clientName =
    context.contact?.name ||
    context.precontract?.client_name ||
    context.event?.client_name ||
    'Cliente';

  const eventDate =
    context.event?.event_date ||
    context.precontract?.event_date ||
    new Date().toISOString().slice(0, 10);

  return `Contrato - ${clientName} - ${eventDate}`;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'harmonics-contract-service' });
});

app.post('/generate-contract', async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();

    const contractId = req.body?.contractId || null;
    const precontractId = req.body?.precontractId || null;
    const previewOnly = !!req.body?.previewOnly;

    const templateId = process.env.CONTRACT_TEMPLATE_DOC_ID;
    const rootFolderId = process.env.CONTRACTS_DRIVE_FOLDER_ID;

    if (!templateId) {
      return res.status(500).json({ ok: false, message: 'CONTRACT_TEMPLATE_DOC_ID não definida.' });
    }

    if (!rootFolderId) {
      return res.status(500).json({ ok: false, message: 'CONTRACTS_DRIVE_FOLDER_ID não definida.' });
    }

    const context = await getContractContext({
      contractId,
      precontractId,
      supabase,
    });

    const templateData = buildContractTemplateData(context);

    if (previewOnly) {
      return res.json({
        ok: true,
        mode: 'preview',
        templateData,
      });
    }

    const contractName = getContractName(context);
    const eventDate =
      context.event?.event_date ||
      context.precontract?.event_date ||
      new Date().toISOString().slice(0, 10);

    const generated = await generateGoogleContract({
      templateId,
      rootFolderId,
      templateData,
      contractName,
      eventDate,
    });

    if (context.contract?.id) {
      const { error: updateError } = await supabase
        .from('contracts')
        .update({
          doc_template_id: templateId,
          doc_url: generated.docUrl,
          pdf_url: generated.pdfUrl,
        })
        .eq('id', context.contract.id);

      if (updateError) {
        throw new Error(`Erro ao salvar links do contrato: ${updateError.message}`);
      }
    }

    return res.json({
      ok: true,
      mode: 'generated',
      docUrl: generated.docUrl,
      pdfUrl: generated.pdfUrl,
      pdfId: generated.pdfId,
      docId: generated.docId,
      folderYear: generated.folderYear,
      folderMonth: generated.folderMonth,
    });
  } catch (error) {
    console.error('[generate-contract] erro:', error);
    return res.status(500).json({
      ok: false,
      message: getReadableErrorMessage(error),
    });
  }
});

const port = Number(process.env.PORT || 3001);
app.listen(port, () => {
  console.log(`Contract service rodando na porta ${port}`);
});
