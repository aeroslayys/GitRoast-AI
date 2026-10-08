# Architecture and Code Quality

GitRoast AI is a dependency-free Node.js 20+ runtime and vanilla JavaScript frontend. The existing public 100-point score is **deterministic**; Gemini only generates optional natural-language feedback.

## Backend module responsibilities

| Location | Responsibility |
| --- | --- |
| **server.js** | HTTP entrypoint, strict headers, request dispatch and startup |
| **http/assets.js** | Allowlisted static files, no arbitrary client filesystem paths |
| **http/response.js** | Consistent no-store JSON responses |
| **http/request-identity.js** | Explicit trusted-proxy request identity |
| **http/request-controls.js** | Reusable fixed-window quotas and bounded in-flight promise caches |
| **http/profile-routes.js** | Cached profile audits and deliberately uncached score rechecks |
| **http/improvement-routes.js** | On-demand README, editing and file-path inspection endpoints |
| **engine.js** | Thin backwards-compatible export surface |
| **core/github.js** | GitHub pagination, featured-repo selection and README sampling |
| **core/scoring.js** | Pure 100-point score and priority logic |
| **core/feedback.js** | Deterministic text fallback and optional Gemini call |
| **core/shared.js** | Tiny shared pure functions |
| **score-explain.js** | Exact earned/max category evidence without changing scoring |
| **improvement-plan.js** | Evidence links, projections, seven-day action plan |
| **ai-guardrails.js** | Validates generated feedback structure and common unsupported claims |
| **repo-evidence.js** | Inspects public file paths without reading or executing code |
| **readme-doctor.js** | On-demand public README text analysis |
| **fixit.js** | Editable text drafts and fallback |

## Data flow and contracts

1. The server accepts GET only, sets security headers and directs known URLs to domain-specific handlers.
2. Each handler validates input, enforces its own rate limit, and optionally reuses a bounded promise cache. The progress recheck intentionally bypasses the audit cache and Gemini.
3. GitHub collection inspects public repositories only, caps enumeration at 300 entries, samples up to eight READMEs, and limits README concurrency to four.
4. The deterministic score remains Profile basics 20, Project clarity 25, Documentation 30, Recent work 15, Discoverability 10. Explanations cannot alter the score.
5. AI failures use a rules-based fallback. Generated drafts require manual verification.

An unavailable README is **unknown**, not proof of absence. Inspecting a repository filename does not prove working code, passing tests or deployment. The optional role assessment cannot affect portfolio health scores.

## Safety and tradeoffs

- Secrets stay on the server; GitHub write permissions are not needed.
- Quotas and caches are **per instance**. Multiple Cloud Run instances require a separate shared store for coordinated quotas.
- Only deployments with a correctly configured trusted proxy count should set TRUSTED_PROXY_HOPS.
- The GitHub API, Gemini, and browser-local storage are external or ephemeral dependencies; no user data is retained in a database.
- Client-side CSS includes several layered Vista/Aero and tool-specific stylesheets. Cascading-style consolidation is future technical debt because reducing files without visual regressions would risk changes to the design.

## Verification

Run **npm run check** to syntax-verify all JS files and then execute the Node.js unit and integration tests. Run **npm test** for tests alone. GitHub Actions performs these checks on push and separately starts a local app for Playwright Chromium desktop/mobile and deep-link/feature smoke tests.

The browser tests deliberately mock GitHub/Gemini endpoints to keep CI deterministic. A separate, real Cloud Run smoke check is required before any production rollout. Production does not require npm install.
