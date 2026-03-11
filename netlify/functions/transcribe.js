diff --git a/netlify/functions/transcribe.js b/netlify/functions/transcribe.js
index 46a9d1e53c81f41e867217d034a05ed5312fa866..0cdc1768a9c5aeef8abadf2fe387031d75721876 100644
--- a/netlify/functions/transcribe.js
+++ b/netlify/functions/transcribe.js
@@ -1,62 +1,73 @@
-const GROQ_KEY = process.env.GROQ_KEY;
+function getGroqKey() {
+  return process.env.GROQ_KEY || process.env.GROQ_API_KEY || process.env.API_KEY;
+}
 
 exports.handler = async function(event) {
   const headers = {
     'Access-Control-Allow-Origin': '*',
     'Access-Control-Allow-Headers': 'Content-Type',
     'Access-Control-Allow-Methods': 'POST, OPTIONS',
   };
 
   if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
   if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
-  if (!GROQ_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured' }) };
+  const groqKey = getGroqKey();
+  if (!groqKey) {
+    return {
+      statusCode: 500,
+      headers,
+      body: JSON.stringify({
+        error: 'API key not configured. Set GROQ_KEY (or GROQ_API_KEY) in Netlify environment variables.',
+      }),
+    };
+  }
 
   try {
     const body = JSON.parse(event.body);
     const { audioBase64, fileName, language } = body;
 
     const audioBuffer = Buffer.from(audioBase64, 'base64');
 
     const boundary = '----GroqBoundary' + Date.now();
     const ext = (fileName || 'audio.mp3').split('.').pop().toLowerCase();
     const mimeTypes = {
       mp3:'audio/mpeg', mp4:'video/mp4', wav:'audio/wav',
       m4a:'audio/m4a', webm:'audio/webm', ogg:'audio/ogg',
       flac:'audio/flac'
     };
     const mime = mimeTypes[ext] || 'audio/mpeg';
 
     const parts = [];
     parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName || 'audio.' + ext}"\r\nContent-Type: ${mime}\r\n\r\n`));
     parts.push(audioBuffer);
     parts.push(Buffer.from('\r\n'));
     parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-large-v3-turbo\r\n`));
     if (language) {
       parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${language}\r\n`));
     }
     parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\ntext\r\n`));
     parts.push(Buffer.from(`--${boundary}--\r\n`));
 
     const formData = Buffer.concat(parts);
 
     const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
       method: 'POST',
       headers: {
-        'Authorization': 'Bearer ' + GROQ_KEY,
+        'Authorization': 'Bearer ' + groqKey,
         'Content-Type': `multipart/form-data; boundary=${boundary}`,
       },
       body: formData,
     });
 
     if (!res.ok) {
       const err = await res.text();
       return { statusCode: res.status, headers, body: JSON.stringify({ error: err }) };
     }
 
     const text = await res.text();
     return { statusCode: 200, headers, body: JSON.stringify({ text: text.trim() }) };
 
   } catch (err) {
     return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
   }
 };
