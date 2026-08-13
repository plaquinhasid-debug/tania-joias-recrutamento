import { createHmac, timingSafeEqual } from 'node:crypto';

export const config = {
  api: { bodyParser: false },
};

function send(response, status, body) {
  response.status(status).setHeader('Content-Type', 'text/plain; charset=utf-8').send(body);
}

function readRawBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        reject(new Error('Payload muito grande'));
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function validSignature(rawBody, signatureHeader) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret || !signatureHeader?.startsWith('sha256=')) return false;

  const received = signatureHeader.slice(7);
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  if (!/^[a-f0-9]{64}$/i.test(received) || received.length !== expected.length) return false;

  return timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(expected, 'hex'));
}

function summarize(payload) {
  const events = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      for (const message of value.messages ?? []) {
        events.push({
          kind: 'message',
          from: message.from,
          messageId: message.id,
          type: message.type,
          text: message.text?.body,
        });
      }
      for (const status of value.statuses ?? []) {
        events.push({
          kind: 'status',
          messageId: status.id,
          recipient: status.recipient_id,
          status: status.status,
        });
      }
    }
  }
  return events;
}

function supabaseHeaders(prefer) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

async function supabaseRequest(path, options = {}) {
  const baseUrl = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !key) throw new Error('Supabase do webhook nÃ£o configurado');

  const result = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...options,
    headers: { ...supabaseHeaders(options.prefer), ...options.headers },
  });
  if (!result.ok) throw new Error(`Supabase ${result.status}: ${await result.text()}`);
  return result;
}

async function saveInboundMessage(message, value) {
  const telefone = message.from;
  const contact = (value.contacts ?? []).find(item => item.wa_id === telefone);
  const now = new Date().toISOString();

  await supabaseRequest('whatsapp_contacts?on_conflict=telefone', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: JSON.stringify({
      telefone,
      nome: contact?.profile?.name ?? null,
      last_message_at: now,
      updated_at: now,
    }),
  });

  const inserted = await supabaseRequest('whatsapp_messages?on_conflict=meta_message_id', {
    method: 'POST',
    prefer: 'resolution=ignore-duplicates,return=representation',
    body: JSON.stringify({
      meta_message_id: message.id,
      telefone,
      direction: 'inbound',
      message_type: message.type,
      body: message.text?.body ?? null,
      raw_payload: message,
    }),
  });
  const rows = await inserted.json();
  return rows.length > 0;
}

async function sendAutomaticReply(to, replyToMessageId) {
  if (process.env.WHATSAPP_AUTO_REPLY_ENABLED !== 'true') return;

  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) throw new Error('Credenciais de envio do WhatsApp nÃ£o configuradas');

  const text = process.env.WHATSAPP_AUTO_REPLY_TEXT
    ?? 'OlÃ¡! Recebemos sua mensagem na Tania Joias. Em breve continuaremos seu atendimento por aqui. âœ¨';
  const result = await fetch(`https://graph.facebook.com/v26.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      context: { message_id: replyToMessageId },
      type: 'text',
      text: { preview_url: false, body: text },
    }),
  });
  if (!result.ok) throw new Error(`WhatsApp ${result.status}: ${await result.text()}`);

  const data = await result.json();
  const sentMessageId = data.messages?.[0]?.id;
  if (sentMessageId) {
    await supabaseRequest('whatsapp_messages', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({
        meta_message_id: sentMessageId,
        telefone: to,
        direction: 'outbound',
        message_type: 'text',
        body: text,
        status: 'accepted',
      }),
    });
  }
}

async function processPayload(payload) {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      for (const message of value.messages ?? []) {
        const isNew = await saveInboundMessage(message, value);
        if (isNew && message.type === 'text') {
          await sendAutomaticReply(message.from, message.id);
        }
      }
    }
  }
}

export default async function handler(request, response) {
  const url = new URL(request.url, `https://${request.headers.host ?? 'localhost'}`);

  if (request.method === 'GET') {
    const configuredToken = process.env.WHATSAPP_VERIFY_TOKEN;
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (configuredToken && mode === 'subscribe' && token === configuredToken) {
      return send(response, 200, challenge ?? '');
    }
    return send(response, 403, 'Token de verificação inválido');
  }

  if (request.method !== 'POST') return send(response, 405, 'Método não permitido');

  try {
    const rawBody = await readRawBody(request);
    if (!validSignature(rawBody, request.headers['x-hub-signature-256'])) {
      return send(response, 401, 'Assinatura inválida');
    }

    const payload = JSON.parse(rawBody.toString('utf8'));
    console.log('[WhatsApp webhook]', JSON.stringify(summarize(payload)));
    try {
      await processPayload(payload);
    } catch (processingError) {
      // A Meta deve receber 200 para nÃ£o reenviar indefinidamente. O erro fica
      // registrado para correÃ§Ã£o sem derrubar a entrega do webhook.
      console.error('[WhatsApp processing]', processingError);
    }
    return send(response, 200, 'EVENT_RECEIVED');
  } catch (error) {
    console.error('[WhatsApp webhook]', error);
    return send(response, 400, 'Requisição inválida');
  }
}
