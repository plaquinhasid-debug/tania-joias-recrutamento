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
    return send(response, 200, 'EVENT_RECEIVED');
  } catch (error) {
    console.error('[WhatsApp webhook]', error);
    return send(response, 400, 'Requisição inválida');
  }
}
