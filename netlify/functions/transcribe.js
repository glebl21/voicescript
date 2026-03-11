// netlify/functions/transcribe.js
// Этот файл запускается на сервере Netlify — ключ AssemblyAI скрыт от пользователей

const ASSEMBLYAI_KEY = process.env.ASSEMBLYAI_KEY; // задаётся в Netlify Dashboard

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!ASSEMBLYAI_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured on server' }) };
  }

  try {
    const body = JSON.parse(event.body);
    const { action, upload_url, language_code, audio_url } = body;

    // ── STEP 1: Upload audio file ──
    if (action === 'upload') {
      const audioData = Buffer.from(body.audioBase64, 'base64');

      const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: {
          'Authorization': ASSEMBLYAI_KEY,
          'Content-Type': 'application/octet-stream',
        },
        body: audioData,
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.text();
        return { statusCode: uploadRes.status, headers, body: JSON.stringify({ error: err }) };
      }

      const data = await uploadRes.json();
      return { statusCode: 200, headers, body: JSON.stringify({ upload_url: data.upload_url }) };
    }

    // ── STEP 2: Start transcription ──
    if (action === 'start') {
      const transcriptRes = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: {
          'Authorization': ASSEMBLYAI_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audio_url: audio_url,
          language_code: language_code || 'ru',
          punctuate: true,
          format_text: true,
          speaker_labels: body.speaker_labels || false,
          auto_chapters: body.auto_chapters || false,
          summarization: body.summarization || false,
          summary_model: body.summarization ? 'informative' : undefined,
          summary_type: body.summarization ? 'bullets' : undefined,
        }),
      });

      if (!transcriptRes.ok) {
        const err = await transcriptRes.text();
        return { statusCode: transcriptRes.status, headers, body: JSON.stringify({ error: err }) };
      }

      const data = await transcriptRes.json();
      return { statusCode: 200, headers, body: JSON.stringify({ transcript_id: data.id }) };
    }

    // ── STEP 3: Poll status ──
    if (action === 'poll') {
      const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${body.transcript_id}`, {
        headers: { 'Authorization': ASSEMBLYAI_KEY },
      });

      if (!pollRes.ok) {
        const err = await pollRes.text();
        return { statusCode: pollRes.status, headers, body: JSON.stringify({ error: err }) };
      }

      const data = await pollRes.json();
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'Internal server error' }),
    };
  }
};
