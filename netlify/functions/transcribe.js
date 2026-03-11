'use strict';

function getGroqKey() {
  return process.env.GROQ_KEY || process.env.GROQ_API_KEY || '';
}

function json(statusCode, headers, payload) {
  return {
    statusCode: statusCode,
    headers: headers,
    body: JSON.stringify(payload),
  };
}

function sanitizeFileName(name, fallbackExt) {
  var base = (name || ('audio.' + fallbackExt)).replace(/[\r\n"]/g, '_').trim();
  return base || ('audio.' + fallbackExt);
}

exports.handler = async function handler(event) {
  var headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return json(405, headers, { error: 'Method not allowed' });
  }

  var groqKey = getGroqKey();
  if (!groqKey) {
    return json(500, headers, {
      error: 'API key not configured. Set GROQ_KEY (or GROQ_API_KEY) in Netlify environment variables.',
    });
  }

  try {
    var body = JSON.parse((event && event.body) || '{}');
    var audioBase64 = body.audioBase64;
    var fileName = body.fileName;
    var language = body.language;

    if (!audioBase64 || typeof audioBase64 !== 'string') {
      return json(400, headers, { error: 'audioBase64 is required' });
    }

    var audioBuffer = Buffer.from(audioBase64, 'base64');
    var boundary = '----GroqBoundary' + Date.now();
    var ext = String(fileName || 'audio.mp3').split('.').pop().toLowerCase();
    var mimeTypes = {
      mp3: 'audio/mpeg',
      mp4: 'video/mp4',
      wav: 'audio/wav',
      m4a: 'audio/m4a',
      webm: 'audio/webm',
      ogg: 'audio/ogg',
      flac: 'audio/flac',
    };
    var mime = mimeTypes[ext] || 'audio/mpeg';
    var safeFileName = sanitizeFileName(fileName, ext || 'mp3');

    var parts = [];
    parts.push(Buffer.from('--' + boundary + '\r\n' +
      'Content-Disposition: form-data; name="file"; filename="' + safeFileName + '"\r\n' +
      'Content-Type: ' + mime + '\r\n\r\n'));
    parts.push(audioBuffer);
    parts.push(Buffer.from('\r\n'));

    parts.push(Buffer.from('--' + boundary + '\r\n' +
      'Content-Disposition: form-data; name="model"\r\n\r\n' +
      'whisper-large-v3-turbo\r\n'));

    if (language) {
      parts.push(Buffer.from('--' + boundary + '\r\n' +
        'Content-Disposition: form-data; name="language"\r\n\r\n' +
        String(language) + '\r\n'));
    }

    parts.push(Buffer.from('--' + boundary + '\r\n' +
      'Content-Disposition: form-data; name="response_format"\r\n\r\n' +
      'text\r\n'));
    parts.push(Buffer.from('--' + boundary + '--\r\n'));

    var response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + groqKey,
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
      },
      body: Buffer.concat(parts),
    });

    if (!response.ok) {
      var errorText = await response.text();
      return json(response.status, headers, { error: errorText });
    }

    var text = await response.text();
    return json(200, headers, { text: String(text || '').trim() });
  } catch (error) {
    return json(500, headers, { error: error && error.message ? error.message : 'Unknown server error' });
  }
};
