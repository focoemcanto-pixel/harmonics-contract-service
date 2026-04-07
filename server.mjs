import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { generateGoogleContract } from './lib/contracts/googleContractGenerator';  // Caminho ajustado para o arquivo correto

const app = express();
app.use(express.json());

// Função para verificar as variáveis de ambiente necessárias
const validateEnv = () => {
  const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'GOOGLE_OAUTH_CLIENT_ID',
    'GOOGLE_OAUTH_CLIENT_SECRET',
    'GOOGLE_OAUTH_REDIRECT_URI',
    'GOOGLE_OAUTH_REFRESH_TOKEN',
  ];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      return { valid: false, error: `Variável de ambiente ${envVar} não definida` };
    }
  }

  return {
    valid: true,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    templateId: process.env.GOOGLE_TEMPLATE_DOC_ID,
    rootFolderId: process.env.GOOGLE_CONTRACTS_DRIVE_FOLDER_ID,
  };
};

// Função para obter o contexto do contrato
const getContractContext = async ({ contractId, precontractId, supabase }) => {
  const { data: contract } = await supabase
    .from('contracts')
    .select('*')
    .eq('id', contractId)
    .single();

  const { data: precontract } = await supabase
    .from('precontracts')
    .select('*')
    .eq('id', precontractId)
    .single();

  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', contract?.contact_id || precontract?.contact_id)
    .single();

  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('id', contract?.event_id || precontract?.event_id)
    .single();

  return { contract, precontract, contact, event };
};

// Função para gerar dados do template
const buildContractTemplateData = (context) => {
  const { contract, precontract, contact, event } = context;

  return {
    clientName: contact?.name || '',
    eventDate: event?.event_date || '',
    eventName: event?.event_name || '',
    contractValue: contract?.value || precontract?.value || '',
    // outros campos baseados no contexto...
  };
};

// Função para gerar nome do contrato
const getContractName = (context) => {
  return `${context.contract?.event_name || 'Contrato'} - ${context.contact?.name}`;
};

app.post('/generate-contract', async (req, res) => {
  try {
    const envCheck = validateEnv();

    if (!envCheck.valid) {
      return res.status(500).json({
        ok: false,
        message: envCheck.error,
      });
    }

    const {
      supabaseUrl,
      supabaseServiceRoleKey,
      templateId,
      rootFolderId,
    } = envCheck;

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const body = req.body;

    const contractId = body?.contractId || null;
    const precontractId = body?.precontractId || null;
    const previewOnly = !!body?.previewOnly;

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
        message: 'Template data gerado com sucesso.',
        ids: {
          contractId: context.contract?.id || null,
          precontractId: context.precontract?.id || null,
          contactId: context.contact?.id || null,
          eventId: context.event?.id || null,
        },
        templateData,
      });
    }

    if (!context.contract?.id && !context.precontract?.id) {
      throw new Error('Nenhum contexto válido encontrado para gerar o contrato.');
    }

    const contractName = getContractName(context);
    const eventDate =
      context.event?.event_date ||
      context.precontract?.event_date ||
      new Date().toISOString().slice(0, 10);

    console.log('[/api/contracts/generate] iniciando generateGoogleContract', {
      contractId: context.contract?.id || null,
      precontractId: context.precontract?.id || null,
      templateId,
      rootFolderId,
      contractName,
      eventDate,
    });

    let generated;

    try {
      generated = await generateGoogleContract({
        templateId,
        rootFolderId,
        templateData,
        contractName,
        eventDate,
        placeholderStyle: 'double_curly',
      });
    } catch (error) {
      console.error('Erro dentro de generateGoogleContract:', error);
      console.error('Erro REAL do GoogleContractGenerator:', error);
      throw error;
    }

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
      message: 'Contrato gerado com sucesso.',
      ids: {
        contractId: context.contract?.id || null,
        precontractId: context.precontract?.id || null,
        contactId: context.contact?.id || null,
        eventId: context.event?.id || null,
      },
      docUrl: generated.docUrl,
      pdfUrl: generated.pdfUrl,
      folderYear: generated.folderYear,
      folderMonth: generated.folderMonth,
      templateData,
    });
  } catch (error) {
    console.error('Erro em /api/contracts/generate:', error);
    return res.status(500).json({
      ok: false,
      message: error.message,
      errorType: error?.name || 'UnknownError',
    });
  }
});

// Inicia o servidor Express
app.listen(3001, () => {
  console.log('Server is running on port 3001');
});
