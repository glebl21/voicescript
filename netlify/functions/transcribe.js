// netlify/functions/transcribe.js
const ASSEMBLYAI_KEY = process.env.ASSEMBLYAI_KEY;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!ASSEMBLYAI_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured on server' }) };

  try {
    const body = JSON.parse(event.body);
    const { action } = body;

    // ── UPLOAD ──
    if (action === 'upload') {
      const audioData = Buffer.from(body.audioBase64, 'base64');
      const res = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: { 'Authorization': ASSEMBLYAI_KEY, 'Content-Type': 'application/octet-stream' },
        body: audioData,
      });
      if (!res.ok) return { statusCode: res.status, headers, body: JSON.stringify({ error: await res.text() }) };
      const data = await res.json();
      return { statusCode: 200, headers, body: JSON.stringify({ upload_url: data.upload_url }) };
    }

    // ── START ──
    if (action === 'start') {
      const { audio_url, language_code, speaker_labels, auto_chapters, summarization } = body;

      const payload = {
        audio_url,
        speech_models: ['universal-2'],
        language_code: language_code || 'ru',
        punctuate: true,
        format_text: true,
      };
      if (speaker_labels) payload.speaker_labels = true;
      if (auto_chapters) payload.auto_chapters = true;
      if (summarization) {
        payload.summarization = true;
        payload.summary_model = 'informative';
        payload.summary_type = 'bullets';
      }

      const res = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: { 'Authorization': ASSEMBLYAI_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return { statusCode: res.status, headers, body: JSON.stringify({ error: await res.text() }) };
      const data = await res.json();
      return { statusCode: 200, headers, body: JSON.stringify({ transcript_id: data.id }) };
    }

    // ── POLL ──
    if (action === 'poll') {
      const res = await fetch(`https://api.assemblyai.com/v2/transcript/${body.transcript_id}`, {
        headers: { 'Authorization': ASSEMBLYAI_KEY },
      });
      if (!res.ok) return { statusCode: res.status, headers, body: JSON.stringify({ error: await res.text() }) };
      const data = await res.json();
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Internal server error' }) };
  }
};
