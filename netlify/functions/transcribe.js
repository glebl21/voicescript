 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/netlify/functions/transcribe.js b/netlify/functions/transcribe.js
index 46a9d1e53c81f41e867217d034a05ed5312fa866..fb0cbb2220a76755ea3bdd28d075e773da2cc42c 100644
--- a/netlify/functions/transcribe.js
+++ b/netlify/functions/transcribe.js
@@ -1,62 +1,108 @@
-const GROQ_KEY = process.env.GROQ_KEY;
+'use strict';
 
-exports.handler = async function(event) {
-  const headers = {
+function getGroqKey() {
+  return process.env.GROQ_KEY || process.env.GROQ_API_KEY || '';
+}
+
+function json(statusCode, headers, payload) {
+  return {
+    statusCode: statusCode,
+    headers: headers,
+    body: JSON.stringify(payload),
+  };
+}
+
+function sanitizeFileName(name, fallbackExt) {
+  var base = (name || ('audio.' + fallbackExt)).replace(/[\r\n"]/g, '_').trim();
+  return base || ('audio.' + fallbackExt);
+}
+
+exports.handler = async function handler(event) {
+  var headers = {
     'Access-Control-Allow-Origin': '*',
     'Access-Control-Allow-Headers': 'Content-Type',
     'Access-Control-Allow-Methods': 'POST, OPTIONS',
   };
 
-  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
-  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
-  if (!GROQ_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured' }) };
+  if (event.httpMethod === 'OPTIONS') {
+    return { statusCode: 200, headers: headers, body: '' };
+  }
+
+  if (event.httpMethod !== 'POST') {
+    return json(405, headers, { error: 'Method not allowed' });
+  }
+
+  var groqKey = getGroqKey();
+  if (!groqKey) {
+    return json(500, headers, {
+      error: 'API key not configured. Set GROQ_KEY (or GROQ_API_KEY) in Netlify environment variables.',
+    });
+  }
 
   try {
-    const body = JSON.parse(event.body);
-    const { audioBase64, fileName, language } = body;
+    var body = JSON.parse((event && event.body) || '{}');
+    var audioBase64 = body.audioBase64;
+    var fileName = body.fileName;
+    var language = body.language;
 
-    const audioBuffer = Buffer.from(audioBase64, 'base64');
+    if (!audioBase64 || typeof audioBase64 !== 'string') {
+      return json(400, headers, { error: 'audioBase64 is required' });
+    }
 
-    const boundary = '----GroqBoundary' + Date.now();
-    const ext = (fileName || 'audio.mp3').split('.').pop().toLowerCase();
-    const mimeTypes = {
-      mp3:'audio/mpeg', mp4:'video/mp4', wav:'audio/wav',
-      m4a:'audio/m4a', webm:'audio/webm', ogg:'audio/ogg',
-      flac:'audio/flac'
+    var audioBuffer = Buffer.from(audioBase64, 'base64');
+    var boundary = '----GroqBoundary' + Date.now();
+    var ext = String(fileName || 'audio.mp3').split('.').pop().toLowerCase();
+    var mimeTypes = {
+      mp3: 'audio/mpeg',
+      mp4: 'video/mp4',
+      wav: 'audio/wav',
+      m4a: 'audio/m4a',
+      webm: 'audio/webm',
+      ogg: 'audio/ogg',
+      flac: 'audio/flac',
     };
-    const mime = mimeTypes[ext] || 'audio/mpeg';
+    var mime = mimeTypes[ext] || 'audio/mpeg';
+    var safeFileName = sanitizeFileName(fileName, ext || 'mp3');
 
-    const parts = [];
-    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName || 'audio.' + ext}"\r\nContent-Type: ${mime}\r\n\r\n`));
+    var parts = [];
+    parts.push(Buffer.from('--' + boundary + '\r\n' +
+      'Content-Disposition: form-data; name="file"; filename="' + safeFileName + '"\r\n' +
+      'Content-Type: ' + mime + '\r\n\r\n'));
     parts.push(audioBuffer);
     parts.push(Buffer.from('\r\n'));
-    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-large-v3-turbo\r\n`));
+
+    parts.push(Buffer.from('--' + boundary + '\r\n' +
+      'Content-Disposition: form-data; name="model"\r\n\r\n' +
+      'whisper-large-v3-turbo\r\n'));
+
     if (language) {
-      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${language}\r\n`));
+      parts.push(Buffer.from('--' + boundary + '\r\n' +
+        'Content-Disposition: form-data; name="language"\r\n\r\n' +
+        String(language) + '\r\n'));
     }
-    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\ntext\r\n`));
-    parts.push(Buffer.from(`--${boundary}--\r\n`));
 
-    const formData = Buffer.concat(parts);
+    parts.push(Buffer.from('--' + boundary + '\r\n' +
+      'Content-Disposition: form-data; name="response_format"\r\n\r\n' +
+      'text\r\n'));
+    parts.push(Buffer.from('--' + boundary + '--\r\n'));
 
-    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
+    var response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
       method: 'POST',
       headers: {
-        'Authorization': 'Bearer ' + GROQ_KEY,
-        'Content-Type': `multipart/form-data; boundary=${boundary}`,
+        Authorization: 'Bearer ' + groqKey,
+        'Content-Type': 'multipart/form-data; boundary=' + boundary,
       },
-      body: formData,
+      body: Buffer.concat(parts),
     });
 
-    if (!res.ok) {
-      const err = await res.text();
-      return { statusCode: res.status, headers, body: JSON.stringify({ error: err }) };
+    if (!response.ok) {
+      var errorText = await response.text();
+      return json(response.status, headers, { error: errorText });
     }
 
-    const text = await res.text();
-    return { statusCode: 200, headers, body: JSON.stringify({ text: text.trim() }) };
-
-  } catch (err) {
-    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
+    var text = await response.text();
+    return json(200, headers, { text: String(text || '').trim() });
+  } catch (error) {
+    return json(500, headers, { error: error && error.message ? error.message : 'Unknown server error' });
   }
 };
 
EOF
)
