# ZIONFORGE — AI Software Studio (MVP)

A branded, responsive personal software studio prototype. This first version includes a project brief workspace, guided/auto mode selector, starter ideas, local project history, and GitHub/Cloudflare deployment guides.

## Run locally

Because the interface is static, open `index.html` in a browser to explore the workspace. The project-history list is stored in that browser's local storage.

## Deploy the static app to Cloudflare Pages

1. Create a GitHub repository and upload the contents of this folder.
2. In Cloudflare, create a Pages project and connect the GitHub repository.
3. Leave the build command blank. Set the build output directory to `/`.
4. Deploy.

## Enable live AI project planning

The Pages Function at `functions/api/generate.js` calls the OpenAI Responses API from the server. It never exposes the API key to the browser.

1. Create an API key with your AI provider.
2. In Cloudflare Pages → Settings → Variables and Secrets, add `OPENAI_API_KEY` as an encrypted secret.
3. Optional: add `OPENAI_MODEL` as a plain variable if you want to use a different model available to your account.
4. Redeploy the project.

The Generate button currently falls back to a local starter plan if the AI endpoint is not configured. This is intentional; it does not pretend that live AI code generation is active.

## Current MVP limitations

- Live AI integration returns a project plan, not a complete multi-file codebase yet.
- GitHub and Cloudflare actions are step-by-step guides, not connected account actions.
- Project history is stored in the current browser only.
- Before production use, add authentication, durable project storage, rate limiting, usage limits, and stronger error handling.

## Security

Never put API keys in `app.js`, `index.html`, or a public GitHub repository. Use Cloudflare encrypted secrets.
