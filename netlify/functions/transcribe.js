const DEEPGRAM_KEY = process.env.DEEPGRAM_KEY;

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!DEEPGRAM_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured on server' }) };

  try {
    const body = JSON.parse(event.body);
    const { action } = body;

    // ── UPLOAD: читаем base64 и отдаём обратно как upload_url = null (используем raw bytes) ──
    if (action === 'upload') {
      // Просто возвращаем base64 обратно — Deepgram примет его напрямую
      return { statusCode: 200, headers, body: JSON.stringify({ upload_url: body.audioBase64 }) };
    }

    // ── START + результат сразу (Deepgram не требует polling) ──
    if (action === 'start') {
      const { audio_url, language_code, speaker_labels, summarization } = body;

      const audioBytes = Buffer.from(audio_url, 'base64');

      const params = new URLSearchParams({
        language: language_code || 'ru',
        punctuate: 'true',
        diarize: speaker_labels ? 'true' : 'false',
      });

      const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
        method: 'POST',
        headers: {
          'Authorization': 'Token ' + DEEPGRAM_KEY,
          'Content-Type': 'audio/mpeg',
        },
        body: audioBytes,
      });

      if (!res.ok) {
        const err = await res.text();
        return { statusCode: res.status, headers, body: JSON.stringify({ error: err }) };
      }

      const data = await res.json();
      const transcript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';

      // Возвращаем сразу готовый текст
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ transcript_id: 'done', status: 'completed', text: transcript }),
      };
    }

    // ── POLL: Deepgram не нужен, но оставим для совместимости ──
    if (action === 'poll') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ status: 'completed', text: body.cached_text || '' }),
      };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Internal server error' }) };
  }
};
