function safe(value) {
  return String(value ?? '').trim();
}

function monthNamePT(index) {
  const months = [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
  ];
  return months[index] || '';
}

function formatMoneyBR(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0));
}

function formatDateBR(value) {
  if (!value) return '';
  const raw = String(value).slice(0, 10);
  const [y, m, d] = raw.split('-');
  if (!y || !m || !d) return safe(value);
  return `${d}/${m}/${y}`;
}

function formatTimeBR(value) {
  if (!value) return '';
  return String(value).slice(0, 5);
}

function buildFullAddress({
  street,
  number,
  complement,
  neighborhood,
  cep,
  city,
  state,
}) {
  const parts = [
    safe(street),
    safe(number) ? `nº ${safe(number)}` : '',
    safe(complement),
    safe(neighborhood),
    safe(cep) ? `CEP ${safe(cep)}` : '',
    safe(city),
    safe(state),
  ].filter(Boolean);

  return parts.join(', ');
}

function formatEventLocation(name, address) {
  const n = safe(name);
  const a = safe(address);

  if (n && a) return `${n} - ${a}`;
  return n || a || '';
}

function formatLongDatePT(value) {
  if (!value) return '';
  const raw = String(value).slice(0, 10);
  const [y, m, d] = raw.split('-').map(Number);
  if (!y || !m || !d) return safe(value);
  return `${d} de ${monthNamePT(m - 1)} de ${y}`;
}

function numberToPortuguese(value) {
  const n = Math.round(Number(value || 0) * 100) / 100;
  if (!Number.isFinite(n)) return '';

  const integer = Math.floor(n);
  const cents = Math.round((n - integer) * 100);

  const units = [
    'zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
    'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete',
    'dezoito', 'dezenove',
  ];
  const tens = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const hundreds = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

  function convert999(num) {
    if (num === 0) return '';
    if (num < 20) return units[num];
    if (num === 100) return 'cem';
    if (num < 100) {
      const t = Math.floor(num / 10);
      const u = num % 10;
      return u ? `${tens[t]} e ${units[u]}` : tens[t];
    }
    const h = Math.floor(num / 100);
    const rest = num % 100;
    return rest ? `${hundreds[h]} e ${convert999(rest)}` : hundreds[h];
  }

    function convertInt(num) {
    if (num === 0) return 'zero';
    if (num < 1000) return convert999(num);

    const thousands = Math.floor(num / 1000);
    const rest = num % 1000;

    let prefix = '';
    if (thousands === 1) {
      prefix = 'mil';
    } else if (thousands < 1000) {
      prefix = `${convert999(thousands)} mil`;
    } else {
      const millions = Math.floor(num / 1000000);
      const restMillions = num % 1000000;

      let millionPart = '';
      if (millions === 1) {
        millionPart = 'um milhão';
      } else {
        millionPart = `${convertInt(millions)} milhões`;
      }

      if (!restMillions) return millionPart;
      return `${millionPart} e ${convertInt(restMillions)}`;
    }

    if (!rest) return prefix;
    return `${prefix} e ${convert999(rest)}`;
  }

  const intText = convertInt(integer);
  const currencyText = integer === 1 ? 'real' : 'reais';

  if (!cents) return `${intText} ${currencyText}`;

  const centsText = convertInt(cents);
  const centsCurrency = cents === 1 ? 'centavo' : 'centavos';

  return `${intText} ${currencyText} e ${centsText} ${centsCurrency}`;
}

function buildExtrasText(precontract, event) {
  const extras = [];

  const receptionHours =
    Number(precontract?.reception_hours ?? event?.reception_hours ?? 0) || 0;
  const hasSound =
    Boolean(precontract?.has_sound ?? event?.has_sound ?? false);
  const hasTransport =
    Boolean(precontract?.has_transport ?? event?.has_transport ?? false);

  if (receptionHours > 0) {
    extras.push(`Receptivo de ${receptionHours}h`);
  }

  if (hasSound) {
    extras.push('Estrutura de som');
  }

  if (hasTransport) {
    extras.push('Deslocamento/Transporte');
  }

  return extras.length ? extras.join(' | ') : '';
}

function buildAddressFromRawPayload(clientForm) {
  return buildFullAddress({
    street: clientForm?.address_street,
    number: clientForm?.address_number,
    complement: clientForm?.address_complement,
    neighborhood: clientForm?.address_neighborhood,
    cep: clientForm?.address_cep,
    city: clientForm?.address_city,
    state: clientForm?.address_state,
  });
}
function toDateOnly(value) {
  const raw = String(value || '').slice(0, 10);
  if (!raw) return null;

  const [y, m, d] = raw.split('-').map(Number);
  if (!y || !m || !d) return null;

  return new Date(y, m - 1, d);
}

function formatDateToISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function subtractDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() - days);
  return copy;
}

function buildSignatureStamp({ signatureName, signatureCpf, signedAt }) {
  const parts = [
    signatureName ? `Assinado por: ${signatureName}` : '',
    signatureCpf ? `CPF: ${signatureCpf}` : '',
    signedAt ? `Em: ${signedAt}` : '',
  ].filter(Boolean);

  return parts.join(' | ');
}

function buildDocumentHash({ contractId, token, signedAt }) {
  return [contractId, token, signedAt].filter(Boolean).join('::');
}

function buildContractTemplateData({
  contract,
  precontract,
  contact,
  event,
}) {
  const clientForm = contract?.raw_payload?.client_form || {};

  const clientName =
    safe(clientForm.full_name) ||
    safe(contact?.name) ||
    safe(precontract?.client_name) ||
    safe(event?.client_name);

  const cpf = safe(clientForm.cpf);
  const rg = safe(clientForm.rg);
  const maritalStatus = safe(clientForm.marital_status);
  const profession = safe(clientForm.profession);

  const eventDate =
    safe(clientForm.event_date) ||
    safe(event?.event_date) ||
    safe(precontract?.event_date);

  const eventTime =
    safe(clientForm.event_time) ||
    safe(event?.event_time) ||
    safe(precontract?.event_time);

  const eventLocationName =
    safe(clientForm.event_location_name) ||
    safe(event?.location_name) ||
    safe(precontract?.location_name);

  const eventLocationAddress =
    safe(clientForm.event_location_address) ||
    safe(event?.location_address) ||
    safe(precontract?.location_address);

  const formation =
    safe(event?.formation) || safe(precontract?.formation);

  const instruments =
    safe(event?.instruments) || safe(precontract?.instruments);

  const agreedAmount =
    Number(precontract?.agreed_amount ?? event?.agreed_amount ?? 0) || 0;

  const extrasText = buildExtrasText(precontract, event);
  const hasExtras = !!extrasText;

  const hasCard =
    Boolean(precontract?.payment_card) ||
    Boolean(event?.payment_card);

  const eventDateObj = toDateOnly(eventDate);

const calculatedSignalDate = eventDateObj
  ? formatDateToISO(subtractDays(eventDateObj, 14))
  : '';

const calculatedBalanceDate = eventDateObj
  ? formatDateToISO(subtractDays(eventDateObj, 2))
  : '';

const signalDate =
  safe(precontract?.signal_due_date) ||
  safe(event?.signal_due_date) ||
  calculatedSignalDate;

const balanceDate =
  safe(precontract?.balance_due_date) ||
  safe(event?.balance_due_date) ||
  calculatedBalanceDate;

  const cardDate =
    safe(precontract?.card_due_date) ||
    safe(event?.card_due_date) ||
    '';

  const signatureName =
    safe(contract?.signature_name) ||
    safe(clientForm.signer_name) ||
    clientName;

  const signatureCpf =
    safe(clientForm.signer_cpf) || cpf;

  const signedAt =
    safe(contract?.signed_at) ||
    safe(clientForm.signed_at);

  const fullAddress = buildAddressFromRawPayload(clientForm);

  const token =
    safe(contract?.public_token) ||
    safe(precontract?.public_token);

  const contractId = safe(contract?.id);

  return {
    CLIENTE_NOME: clientName,
    NOME: clientName,
    ASSINATURA: signatureName,
    ESTADO_CIVIL: maritalStatus,
    PROFISSAO: profession,
    CPF: cpf,
    RG: rg,
    ENDERECO: fullAddress,

    DATA_EVENTO: formatDateBR(eventDate),
    DATA_EVENTO_EXTENSO: formatLongDatePT(eventDate),
    HORA_EVENTO: formatTimeBR(eventTime),
    LOCAL_EVENTO: formatEventLocation(eventLocationName, eventLocationAddress),
    FORMACAO: formation,
    INSTRUMENTOS: instruments,

    VALOR_TOTAL: formatMoneyBR(agreedAmount),
    VALOR_TOTAL_EXTENSO: numberToPortuguese(agreedAmount),

    DATA_SINAL: signalDate ? formatDateBR(signalDate) : '',
    DATA_SALDO: balanceDate ? formatDateBR(balanceDate) : '',
    DATA_CARTAO: cardDate ? formatDateBR(cardDate) : '',

    EXTRAS: hasExtras,
    CARTAO: hasCard && !!cardDate,
    EXTRAS_TEXTO: hasExtras ? extrasText : '',

    ACEITE_NOME: signatureName,
    ACEITE_CPF: signatureCpf,
    ACEITE_IP: safe(contract?.signature_ip),
    ACEITE_ORIGEM: 'Sistema Harmonics',
    ACEITE_TERMO: 'Li e concordo com os termos do contrato.',
    ACEITE_DATAHORA: signedAt,

    CARIMBO_ASSINATURA: buildSignatureStamp({
      signatureName,
      signatureCpf,
      signedAt,
    }),

    TOKEN_CONTRATO: token,
    HASH_DOCUMENTO: buildDocumentHash({
      contractId,
      token,
      signedAt,
    }),
  };
}
module.exports = { buildContractTemplateData };
