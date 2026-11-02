// Zionforge AI endpoint (Cloudflare Pages Function).
// Default: Cloudflare Workers AI through a binding named "AI" (free daily allowance, no key to leak).
// Optional: if there is no AI binding but OPENAI_API_KEY is set as a secret, OpenAI is used instead.

const MAX_PROMPT = 5000;
const MAX_FILES = 8;
const MAX_FILE_BYTES = 60000;
const ALLOWED_EXT = /\.(html|css|js|json|md|txt|svg|webmanifest)$/i;
const DEFAULT_CF_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const TIME_LIMIT_MS = 95000;

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

function listItem(line) {
  return line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim();
}

// Turns the AI's plain-text answer into a project object.
function parseProject(text, fallbackName) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const head = { name: '', summary: '', architecture: [], next: [], notes: '' };
  const files = [];
  let section = null;
  let cur = null;
  let truncated = false;

  for (const line of lines) {
    if (cur) {
      if (/^\s*@@@END\s*$/.test(line)) { files.push(cur); cur = null; continue; }
      if (/^\s*@@@FILE\s+/.test(line)) { cur.cut = true; files.push(cur); cur = null; /* fall through to start next */ }
      else { cur.lines.push(line); continue; }
    }
    const fm = line.match(/^\s*@@@FILE\s+(.+?)\s*$/);
    if (fm) { cur = { path: fm[1].replace(/^[`'"]+|[`'"]+$/g, ''), lines: [] }; section = 'file'; continue; }
    if (section === 'file') continue;

    let m;
    if ((m = line.match(/^\s*PROJECT_NAME:\s*(.*)$/i))) { head.name = m[1].trim(); section = 'name'; continue; }
    if ((m = line.match(/^\s*SUMMARY:\s*(.*)$/i))) { head.summary = m[1].trim(); section = 'summary'; continue; }
    if ((m = line.match(/^\s*ARCHITECTURE:\s*(.*)$/i))) { section = 'arch'; if (m[1].trim()) head.architecture.push(listItem(m[1])); continue; }
    if ((m = line.match(/^\s*NEXT_STEPS:\s*(.*)$/i))) { section = 'next'; if (m[1].trim()) head.next.push(listItem(m[1])); continue; }
    if ((m = line.match(/^\s*NOTES:\s*(.*)$/i))) { head.notes = m[1].trim(); section = 'notes'; continue; }

    const t = line.trim();
    if (!t) continue;
    if (section === 'summary') head.summary += ' ' + t;
    else if (section === 'arch') head.architecture.push(listItem(t));
    else if (section === 'next') head.next.push(listItem(t));
    else if (section === 'notes') head.notes += ' ' + t;
  }
  if (cur) { cur.cut = true; files.push(cur); truncated = true; }

  const seen = new Set();
  const out = [];
  for (const f of files) {
    if (f.cut) { truncated = true; continue; }       // never keep a half-written file
    const path = cleanPath(f.path);
    if (!path || seen.has(path)) continue;
    let body = f.lines.slice();
    while (body.length && !body[0].trim()) body.shift();
    while (body.length && !body[body.length - 1].trim()) body.pop();
    if (body.length && /^\s*```/.test(body[0])) body.shift();
    if (body.length && /^\s*```\s*$/.test(body[body.length - 1])) body.pop();
    const content = body.join('\n') + '\n';
    if (!content.trim()) continue;
    if (new TextEncoder().encode(content).length > MAX_FILE_BYTES) continue;
    seen.add(path);
    out.push({ path, content });
    if (out.length >= MAX_FILES) break;
  }

  const clean = (arr, n) => arr.map(s => s.slice(0, 300)).filter(Boolean).slice(0, n);
  let notes = head.notes.trim();
  if (/^none\.?$/i.test(notes)) notes = '';
  if (truncated) notes = (notes ? notes + ' ' : '') + 'The AI ran out of room, so one file was left out. Ask for a smaller first version to get everything.';

  return {
    project_name: (head.name || fallbackName || 'New project').slice(0, 80),
    summary: head.summary.trim().slice(0, 800),
    architecture: clean(head.architecture, 8),
    files: out,
    next_steps: clean(head.next, 8),
    notes: notes.slice(0, 800),
    truncated
  };
}

function buildInstructions(mode) {
  const style = mode === 'guided'
    ? 'Guided mode: add short, plain-English comments at the top of each file saying what it does. Keep ARCHITECTURE and NEXT_STEPS clear for a beginner.'
    : 'Auto mode: minimal comments. Keep ARCHITECTURE and NEXT_STEPS short.';
  return [
    'You are ZIONFORGE, the project builder of Healingzion Management Ventures (HMV). You write complete, working, SMALL web projects for a non-technical founder who publishes them on Cloudflare Pages from GitHub.',
    '',
    'Reply in EXACTLY this plain-text format and nothing else. No markdown code fences anywhere.',
    '',
    'PROJECT_NAME: <short name>',
    'SUMMARY: <2 to 3 plain sentences>',
    'ARCHITECTURE:',
    '- <short item, 3 to 5 items>',
    'NEXT_STEPS:',
    '- <short item, 3 to 5 items>',
    'NOTES: <limits or things to know, or the word none>',
    '@@@FILE index.html',
    '<complete file content>',
    '@@@END',
    '@@@FILE styles.css',
    '<complete file content>',
    '@@@END',
    '',
    'Rules:',
    '- Plain HTML, CSS and JavaScript only. No build step, no npm, no frameworks, no external scripts, CDNs or web fonts. System fonts only.',
    '- 3 to 5 files in total. Always include index.html and README.md (README explains publishing on Cloudflare Pages: Pages project, no build command, output directory "/").',
    '- Keep the whole project under 18 KB so it finishes quickly. If the idea is big, build the best small working first version and say what is left in NOTES.',
    '- Mobile-first, large readable text, labels on inputs, good contrast.',
    '- Never put API keys, passwords or secrets in any file. If the idea needs a database or login, build the front end with clear placeholders and explain the missing back end in NOTES. Do not pretend a back end exists.',
    '- Use only free or public-domain content (for example KJV or WEB Bible text, never copyrighted translations). Say so in NOTES.',
    '- File paths are simple names like index.html, styles.css, app.js, README.md.',
    '- Write every file completely. Never write "rest of code here".',
    style
  ].join('\n');
}

function withTimeout(promise, ms) {
  let t;
  const timeout = new Promise((_, reject) => { t = setTimeout(() => reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' })), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

async function viaWorkersAI(env, instructions, userText) {
  const out = await withTimeout(env.AI.run(env.AI_MODEL || DEFAULT_CF_MODEL, {
    messages: [{ role: 'system', content: instructions }, { role: 'user', content: userText }],
    max_tokens: 5000,
    temperature: 0.3
  }), TIME_LIMIT_MS);
  if (typeof out === 'string') return out;
  if (out && typeof out.response === 'string') return out.response;
  if (out && out.choices && out.choices[0] && out.choices[0].message) return String(out.choices[0].message.content || '');
  return '';
}

async function viaOpenAI(env, instructions, userText) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIME_LIMIT_MS);
  let res;
  try {
    res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Authorization': `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: env.OPENAI_MODEL || 'gpt-4.1-mini', instructions, input: userText, max_output_tokens: 6000 })
    });
  } finally { clearTimeout(timer); }
  if (!res.ok) {
    const e = new Error('openai ' + res.status);
    e.status = res.status;
    throw e;
  }
  const data = await res.json();
  return (data.output || []).flatMap(i => i.content || []).filter(c => c.type === 'output_text').map(c => c.text).join('\n');
}

export async function onRequestPost({ request, env }) {
  if (!env.AI && !env.OPENAI_API_KEY) {
    return json({ error: 'AI service is not connected. Add the Workers AI binding named AI in the Cloudflare Pages settings.' }, 503);
  }

  // Only accept requests that come from this site itself.
  const origin = request.headers.get('Origin');
  if (origin) {
    let ok = false;
    try { ok = new URL(origin).host === new URL(request.url).host; } catch (e) { ok = false; }
    if (!ok) return json({ error: 'Request not allowed.' }, 403);
  }
  if (Number(request.headers.get('Content-Length') || 0) > 20000) return json({ error: 'Request is too large.' }, 413);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'Invalid request.' }, 400); }

  const prompt = String(body.prompt || '').trim().slice(0, MAX_PROMPT);
  const projectName = String(body.projectName || '').trim().slice(0, 70) || 'New project';
  const mode = body.mode === 'auto' ? 'auto' : 'guided';
  if (!prompt) return json({ error: 'Please describe what you want to build.' }, 400);

  const instructions = buildInstructions(mode);
  const userText = `Project name: ${projectName}\nWhat the owner wants:\n${prompt}`;

  let text;
  try {
    text = env.AI ? await viaWorkersAI(env, instructions, userText) : await viaOpenAI(env, instructions, userText);
  } catch (e) {
    const msg = String((e && e.message) || '');
    if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      return json({ error: 'The AI took too long. Try a smaller idea and generate again.' }, 504);
    }
    if (e && e.status === 401) return json({ error: 'The AI key was rejected. Check OPENAI_API_KEY.' }, 502);
    if ((e && e.status === 429) || /allocation|quota|limit|neurons|too many|429/i.test(msg)) {
      return json({ error: "Today's free AI allowance is used up. It resets at 1:00 AM Nigerian time. Please try again then." }, 429);
    }
    return json({ error: 'The AI could not complete this request. Please try again.' }, 502);
  }

  const project = parseProject(text, projectName);
  if (!project.files.length) {
    return json({ error: 'The AI did not return usable files. Please try again, or describe a smaller first version.' }, 502);
  }
  if (!project.files.some(f => f.path === 'index.html')) {
    return json({ error: 'The AI forgot the main page (index.html). Please try again.' }, 502);
  }
  delete project.truncated;
  return json(project);
}

// Any other method gets a clear message instead of a blank error.
export async function onRequest() {
  return json({ error: 'Use POST.' }, 405);
    }
