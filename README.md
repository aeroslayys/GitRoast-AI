# 🔥 GitRoast AI

**Your code speaks. We translate.** A hackathon-ready GitHub profile reviewer that combines objective public-profile signals, Gemini-powered recruiter feedback, lighthearted roasts, and a prioritized improvement checklist.

![Node 20+](https://img.shields.io/badge/Node.js-20%2B-43853D) ![No runtime dependencies](https://img.shields.io/badge/Runtime%20deps-0-9c80ef) ![Cloud Run ready](https://img.shields.io/badge/Deploy-Google%20Cloud%20Run-5285ff)

## What it does

1. Enter any **public personal GitHub username** (no sign-in).
2. The Node.js backend reads the person's public profile and original, unarchived repositories using GitHub REST API.
3. It checks README files for up to **eight featured projects** and scores five transparent categories: profile basics (20), project clarity (25), documentation (30), recent work (15), and discoverability (10).
4. **Gemini** writes a recruiter-style verdict, supportive feedback, and a playful, non-cruel roast. If no key is configured, the app provides accurate rules-based feedback and marks it as *data-based* rather than pretending AI was used.
5. Users can switch between roast and kind modes, check off actionable fixes, copy a text summary, download a report, and share a profile URL like `?u=your-username`.

### Design principles

- **Constructive, not cruel.** Comment on observable portfolio presentation, not personal worth.
- **Evidence first.** Code quality, talent and employability cannot be measured from API metadata alone. The score is explicitly a heuristic, never a hiring prediction.
- **Honest limitations.** Up to 300 repos are queried, archived/forked projects are excluded, and README checks are sampled. Unknown README results are not called missing.
- **No keys on the client.** Gemini and optional GitHub credentials live only in the Node.js backend.

## Stack

- Frontend: semantic HTML, custom responsive CSS, vanilla JavaScript (no build tools, no CDN JavaScript)
- Backend: Node.js 20+ built-in HTTP server, no npm dependencies
- GitHub REST API: profiles, repos, README metadata
- AI: Google Gemini GenerateContent API, default `gemini-3.5-flash-lite`
- Hosting: Google Cloud Run source deployment

## Run locally

```bash
# clone and enter the repo
git clone https://github.com/aeroslayys/GitRoast-AI.git
cd GitRoast-AI

# no npm install necessary: 0 runtime dependencies
npm start
# open http://localhost:8080
```

Without a Gemini key, the app **still fully works**, but returns rules-based feedback rather than Gemini wording. For actual AI mode, set the environment variable (never commit a real key):

```bash
# macOS/Linux
export GEMINI_API_KEY="YOUR_API_KEY"
npm start
```

A `.env.example` is provided as a reference. Node does not automatically load `.env` files. To load a locally created `.env` with Node 20+ use `node --env-file=.env server.js` (or export variables from your shell). Set `GITHUB_TOKEN` optionally for a higher GitHub REST API rate limit, especially during a hackathon demo. **Never put API keys in the browser, README, or GitHub commits.** The server retries transient Gemini failures and can fall back to `gemini-3.1-flash-lite` before using clearly labeled data-based feedback.

## Deploy on Google Cloud Run

1. Install the [Google Cloud CLI](https://cloud.google.com/sdk/docs/install), create/select a Google Cloud project, enable billing, and sign in.
2. In Google Cloud Console, enable Cloud Run, Cloud Build, Artifact Registry and Secret Manager APIs as required.
3. Create a Secret Manager secret named **`gitroast-gemini`** holding your Gemini API key, and grant your Cloud Run runtime service account **Secret Manager Secret Accessor** on that secret.
4. From the repository folder run:

```bash
gcloud auth login
gcloud config set project YOUR_GOOGLE_CLOUD_PROJECT_ID

gcloud run deploy gitroast-ai \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --set-secrets GEMINI_API_KEY=gitroast-gemini:latest \
  --set-env-vars GEMINI_MODEL=gemini-3.5-flash-lite
```

Cloud Run's source deployment uses Google Cloud buildpacks automatically; **no Dockerfile or build step is needed**. The server binds to `0.0.0.0` and the injected `PORT` variable. The resulting `https://...run.app` URL is your Cloud Run submission link.

If you want to demo first without Gemini, omit `--set-secrets` and `--set-env-vars`, and the app will explicitly label feedback as data-based. For a higher GitHub API rate limit, provision an additional secret for `GITHUB_TOKEN` and map it as `GITHUB_TOKEN=YOUR_SECRET:latest`.

**Note:** Cloud Run and AI API usage can incur costs. Configure billing budgets and API quotas before making the service public.

## Testing

```bash
npm test
```

The tests cover GitHub username validation, score bounds and breakdown consistency, actionable suggestions for empty profiles, unknown README handling, mocked public GitHub API access, and Gemini 503 retry/fallback behavior. The static page and API route can also be smoke-tested with `curl http://localhost:8080/health`.

## Repository size

There are **no runtime npm dependencies** and no heavy images/fonts committed. The repo contains just source files, a README, and tests. `.gitignore` and `.gcloudignore` exclude caches, secrets, and local dependencies.

## Agent-assisted build disclosure

The initial implementation, UI, API adapter, audit heuristic, test suite, and deployment setup were created with help from an AI coding assistant. The scoring formulas are deterministic and documented in `engine.js`, not invented by the LLM. Feedback generation uses Gemini only when `GEMINI_API_KEY` is configured. Validate the application against live GitHub accounts after deployment and document subsequent manual adjustments in commits.

## Constraints and future ideas

GitHub API unauthenticated calls are rate limited; repeated reports are cached for ten minutes and the server limits requests per connection. In-memory cache and checked-off tasks are per-process/browser (not shared across Cloud Run instances). GitHub REST does not expose a reliable pinned-project list here, so the app ranks featured projects using observable metadata instead. Potential extensions: GitHub OAuth, authenticated repo analysis, an AI README coach, exportable social card, and richer trend tracking.

---

Made for the hackathon · Public data only · Built to make GitHub profiles better, not to judge people.
