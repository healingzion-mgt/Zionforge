# Zionforge by Healingzion Management Ventures

Zionforge turns an idea written in everyday words into a small, complete web project (HTML, CSS and JavaScript) that can be previewed, downloaded as a zip and published on Cloudflare Pages.

## Files in this repository

- `index.html`, `styles.css`, `app.js` : the Zionforge website
- `functions/api/generate.js` : the server code that calls the AI (Cloudflare Pages Function)
- `hmv-logo.jpg`, `hmv-mark.png`, `favicon.png` : Healingzion Management Ventures branding

## Publishing (Cloudflare Pages)

1. Cloudflare: Workers & Pages, Create application, choose the **Pages** option, Import an existing Git repository.
2. Select this repository, branch `main`.
3. Framework preset: None. Build command: empty. Build output directory: `/`.
4. Save and Deploy.

Choose Pages, not Workers. This project has a `functions` folder, which only works on Pages.

## Turning the AI on

1. Create an API key with your AI provider and set a monthly spending limit on that account.
2. Cloudflare: your Pages project, Settings, Variables and secrets, Add.
3. Name: `OPENAI_API_KEY`, type: Secret, paste the key. Optional: `OPENAI_MODEL` as a plain variable.
4. Redeploy (Deployments, then Retry or push any small change).

Until the key is added, the Generate button shows a clearly labelled sample plan.

## Keeping it private

This studio is meant for its owner only. Protect both addresses with Cloudflare Access (Zero Trust, Access controls, Applications) and allow only the owner's email. Without that lock anyone who finds the address could spend the AI credit.

## Limits

- One request writes up to 8 small files and must finish in about 95 seconds, so large ideas should be built in stages.
- The project history is stored in the browser only. Download the zip to keep a permanent copy.
- Generated projects with logins or databases need a real back end that is built separately.

## Security

Never put API keys in `app.js`, `index.html` or any file in a public GitHub repository. Use Cloudflare encrypted secrets.
