// Zionforge AI endpoint (Cloudflare Pages Function).
// The OpenAI key stays on the server as the secret OPENAI_API_KEY and is never sent to the browser.

const MAX_PROMPT = 5000;
const MAX_FILES = 8;
const MAX_FILE_BYTES = 60000;
const ALLOWED_EXT = /\.(html|css|js|json|md|txt|svg|webmanifest)$/i;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function cleanPath(p) {
  if (typeof p !== 'string') return null;
  const path = p.trim().replace(/^\.\//, '');
  if (!path || path.length > 80) return null;
  if (path.startsWith('/') || path.includes('..') || path.includes('\\') || path.includes('\0')) return null;
  if (!/^[A-Za-z0-9_\-./]+$/.test(path)) return null;
  if (!ALLOWED_EXT.test(path)) return null;
  return path;
}

function cleanList(v, max) {
  return (Array.isArray(v) ? v : []).map(x => String(x).slice(0, 300)).filter(Boolean).slice(0, max);
}

export async function onRequestPost({ request, env }) {
  if (!env.OPENAI_API_KEY) {
    return json({ error: 'AI service is not configured. Add OPENAI_API_KEY as a Cloudflare Pages secret.' }, 503);
  }

  // Only accept requests that come from this site itself.
  const origin = request.headers.get('Origin');
  if (origin) {
    let ok = false;
    try { ok = new URL(origin).host === new URL(request.url).host; } catch (e) { ok = false; }
    if (!ok) return json({ error: 'Request not allowed.' }, 403);
  }

  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > 20000) return json({ error: 'Request is too large.' }, 413);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'Invalid request.' }, 400); }

  const prompt = String(body.prompt || '').trim().slice(0, MAX_PROMPT);
  const projectName = String(body.projectName || '').trim().slice(0, 70) || 'New project';
  const mode = body.mode === 'auto' ? 'auto' : 'guided';
  if (!prompt) return json({ error: 'Please describe what you want to build.' }, 400);

  const style = mode === 'guided'
    ? 'Guided mode: write short, plain-English comments at the top of each file saying what it does, and keep "architecture" and "next_steps" clear for a beginner.'
    : 'Auto mode: keep comments minimal and keep "architecture" and "next_steps" short.';

  const instructions = [
    'You are ZIONFORGE, the project builder of Healingzion Management Ventures (HMV). You write complete, working, small web projects for a non-technical founder who will publish them on Cloudflare Pages from GitHub.',
    'Return ONLY one JSON object with exactly these keys:',
    '{"project_name": string, "summary": string (2 to 3 plain sentences), "architecture": string[] (3 to 6 short items), "files": [{"path": string, "content": string}], "next_steps": string[] (3 to 6 items), "notes": string (limits or things to know, may be empty)}',
    'Rules for the files:',
    '- Plain HTML, CSS and JavaScript only. No build step, no npm, no frameworks, no external scripts or CDNs. System fonts only.',
    '- Between 3 and 6 files. Always include index.html and a README.md that explains how to publish on Cloudflare Pages (Pages project, no build command, output directory "/").',
    '- Mobile-first, readable large text, accessible (labels, contrast, focus states).',
    '- Never put API keys, passwords or secrets in any file. If the idea needs a database or login, build the front end with clearly marked placeholders and explain the missing back end in "notes". Do not pretend a back end exists.',
    '- Keep every file under 40 KB and the whole project compact so it completes quickly. If the idea is large, build the best working first version and say what is left in "notes".',
    '- If the idea involves copyrighted material (for example Bible translations), use only free or public-domain content, or load it from a clearly named data file the owner can replace, and say so in "notes".',
    '- Paths are simple relative names like index.html, styles.css, app.js. No folders deeper than one level.',
    style
  ].join('\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 95000);

  let upstream;
  try {
    upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Authorization': `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || 'gpt-4.1-mini',
        instructions,
        input: `Project name: ${projectName}\nWhat the owner wants:\n${prompt}`,
        text: { format: { type: 'json_object' } },
        max_output_tokens: 7500
      })
    });
  } catch (e) {
    clearTimeout(timer);
    if (e && e.name === 'AbortError') {
      return json({ error: 'The AI took too long. Try a smaller idea and generate again.' }, 504);
    }
    return json({ error: 'Could not reach the AI service. Please try again.' }, 502);
  }
  clearTimeout(timer);

  if (!upstream.ok) {
    // Never echo provider details that could include account information.
    const hint = upstream.status === 401 ? 'The AI key was rejected. Check OPENAI_API_KEY.'
      : upstream.status === 429 ? 'The AI account is out of credit or too busy. Check billing and limits.'
      : `The AI provider returned an error (${upstream.status}). Check the key, model and billing.`;
    return json({ error: hint }, 502);
  }

  let result;
  try { result = await upstream.json(); } catch (e) { return json({ error: 'Unreadable AI response.' }, 502); }

  if (result.status === 'incomplete') {
    return json({ error: 'That project was too big to finish in one go. Try a smaller first version of the idea.' }, 502);
  }

  const output = (result.output || [])
    .flatMap(item => item.content || [])
    .filter(item => item.type === 'output_text')
    .map(item => item.text)
    .join('\n');

  let parsed;
  try {
    parsed = JSON.parse(output.replace(/^```json\s*/i, '').replace(/\s*```$/, ''));
  } catch (e) {
    return json({ error: 'The AI answer could not be read. Please try again.' }, 502);
  }

  // Validate and clean everything before it reaches the browser.
  const seen = new Set();
  const files = [];
  for (const f of Array.isArray(parsed.files) ? parsed.files : []) {
    const path = cleanPath(f && f.path);
    const content = f && typeof f.content === 'string' ? f.content : null;
    if (!path || content === null || seen.has(path)) continue;
    if (new TextEncoder().encode(content).length > MAX_FILE_BYTES) continue;
    seen.add(path);
    files.push({ path, content });
    if (files.length >= MAX_FILES) break;
  }

  if (!files.length) {
    return json({ error: 'The AI did not return usable files. Please try again.' }, 502);
  }

  return json({
    project_name: String(parsed.project_name || projectName).slice(0, 80),
    summary: String(parsed.summary || '').slice(0, 800),
    architecture: cleanList(parsed.architecture, 8),
    files,
    next_steps: cleanList(parsed.next_steps, 8),
    notes: String(parsed.notes || '').slice(0, 800)
  });
}

// Any other method gets a clear message instead of a blank error.
export async function onRequest() {
  return json({ error: 'Use POST.' }, 405);
}

