 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/netlify/functions/transcribe.js b/netlify/functions/transcribe.js
index 46a9d1e53c81f41e867217d034a05ed5312fa866..de9ad9d6c75cfb7077b69d2b92e995c2e649656e 100644
--- a/netlify/functions/transcribe.js
+++ b/netlify/functions/transcribe.js
@@ -1,62 +1,100 @@
-const GROQ_KEY = process.env.GROQ_KEY;
+'use strict';
 
-exports.handler = async function(event) {
+function getGroqKey() {
+  return process.env.GROQ_KEY || process.env.GROQ_API_KEY;
+}
+
+function json(statusCode, headers, payload) {
+  return {
+    statusCode,
+    headers,
+    body: JSON.stringify(payload),
+  };
+}
+
+exports.handler = async function handler(event) {
   const headers = {
     'Access-Control-Allow-Origin': '*',
     'Access-Control-Allow-Headers': 'Content-Type',
     'Access-Control-Allow-Methods': 'POST, OPTIONS',
   };
 
-  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
-  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
-  if (!GROQ_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured' }) };
+  if (event.httpMethod === 'OPTIONS') {
+    return { statusCode: 200, headers, body: '' };
+  }
+
+  if (event.httpMethod !== 'POST') {
+    return json(405, headers, { error: 'Method not allowed' });
+  }
+
+  const groqKey = getGroqKey();
+  if (!groqKey) {
+    return json(500, headers, {
+      error: 'API key not configured. Set GROQ_KEY (or GROQ_API_KEY) in Netlify environment variables.',
+    });
+  }
 
   try {
-    const body = JSON.parse(event.body);
+    const body = JSON.parse(event.body || '{}');
     const { audioBase64, fileName, language } = body;
 
+    if (!audioBase64) {
+      return json(400, headers, { error: 'audioBase64 is required' });
+    }
+
     const audioBuffer = Buffer.from(audioBase64, 'base64');
+    const boundary = `----GroqBoundary${Date.now()}`;
 
-    const boundary = '----GroqBoundary' + Date.now();
     const ext = (fileName || 'audio.mp3').split('.').pop().toLowerCase();
     const mimeTypes = {
-      mp3:'audio/mpeg', mp4:'video/mp4', wav:'audio/wav',
-      m4a:'audio/m4a', webm:'audio/webm', ogg:'audio/ogg',
-      flac:'audio/flac'
+      mp3: 'audio/mpeg',
+      mp4: 'video/mp4',
+      wav: 'audio/wav',
+      m4a: 'audio/m4a',
+      webm: 'audio/webm',
+      ogg: 'audio/ogg',
+      flac: 'audio/flac',
     };
     const mime = mimeTypes[ext] || 'audio/mpeg';
 
+    const safeFileName = fileName || `audio.${ext}`;
     const parts = [];
-    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName || 'audio.' + ext}"\r\nContent-Type: ${mime}\r\n\r\n`));
+
+    parts.push(
+      Buffer.from(
+        `--${boundary}\r\n` +
+          `Content-Disposition: form-data; name="file"; filename="${safeFileName}"\r\n` +
+          `Content-Type: ${mime}\r\n\r\n`
+      )
+    );
     parts.push(audioBuffer);
     parts.push(Buffer.from('\r\n'));
     parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-large-v3-turbo\r\n`));
+
     if (language) {
       parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${language}\r\n`));
     }
+
     parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\ntext\r\n`));
     parts.push(Buffer.from(`--${boundary}--\r\n`));
 
-    const formData = Buffer.concat(parts);
-
-    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
+    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
       method: 'POST',
       headers: {
-        'Authorization': 'Bearer ' + GROQ_KEY,
+        Authorization: `Bearer ${groqKey}`,
         'Content-Type': `multipart/form-data; boundary=${boundary}`,
       },
-      body: formData,
+      body: Buffer.concat(parts),
     });
 
-    if (!res.ok) {
-      const err = await res.text();
-      return { statusCode: res.status, headers, body: JSON.stringify({ error: err }) };
+    if (!response.ok) {
+      const errorText = await response.text();
+      return json(response.status, headers, { error: errorText });
     }
 
-    const text = await res.text();
-    return { statusCode: 200, headers, body: JSON.stringify({ text: text.trim() }) };
-
-  } catch (err) {
-    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
+    const text = await response.text();
+    return json(200, headers, { text: text.trim() });
+  } catch (error) {
+    return json(500, headers, { error: error.message });
   }
 };
 
EOF
)
