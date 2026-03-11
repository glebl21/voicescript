// ── START (Deepgram) ──
if (action === 'start') {
  const { audio_url, language_code } = body;

  const res = await fetch(
    `https://api.deepgram.com/v1/listen?language=${language_code || 'ru'}&punctuate=true&diarize=${body.speaker_labels || false}&summarize=${body.summarization || false}`,
    {
      method: 'POST',
      headers: {
        'Authorization': 'Token ' + process.env.DEEPGRAM_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: audio_url }),
    }
  );
  if (!res.ok) return { statusCode: res.status, headers, body: JSON.stringify({ error: await res.text() }) };
  const data = await res.json();
  const text = data.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
  // Deepgram возвращает результат сразу — не нужен polling!
  return { statusCode: 200, headers, body: JSON.stringify({ transcript_id: 'done', text }) };
}
