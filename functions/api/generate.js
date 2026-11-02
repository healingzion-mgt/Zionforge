export async function onRequestPost({ request, env }) {
  if (!env.OPENAI_API_KEY) {
    return Response.json({ error: 'AI service is not configured. Add OPENAI_API_KEY as a Cloudflare Pages secret.' }, { status: 503 });
  }
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON request.' }, { status: 400 }); }
  const prompt = String(body.prompt || '').trim().slice(0, 5000);
  const projectName = String(body.projectName || 'New project').slice(0, 100);
  const mode = body.mode === 'auto' ? 'auto' : 'guided';
  if (!prompt) return Response.json({ error: 'Please provide a project description.' }, { status: 400 });
  const instructions = `You are ZIONFORGE, a careful software architect helping one user build web applications. Return ONLY valid JSON with keys project_name, summary, architecture (array), files (array), next_steps (array). Do not claim code has been generated when it has not. Explain the recommended stack and security considerations in architecture. Mode: ${mode}.`;
  const upstream = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: env.OPENAI_MODEL || 'gpt-4.1-mini', instructions, input: `Project name: ${projectName}\nUser request: ${prompt}`, max_output_tokens: 1200 })
  });
  if (!upstream.ok) {
    const detail = await upstream.text();
    return Response.json({ error: `AI provider returned ${upstream.status}. Check the API key, model and account access.`, detail: detail.slice(0, 500) }, { status: 502 });
  }
  const result = await upstream.json();
  const output = (result.output || []).flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join('\n');
  try {
    const parsed = JSON.parse(output.replace(/^```json\s*/i, '').replace(/\s*```$/, ''));
    return Response.json(parsed, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'The AI response could not be read as a project plan.' }, { status: 502 });
  }
}
