<div align="center">

# 🔥 GitRoast AI

### Your GitHub deserves a glow-up.

**An honest, constructive GitHub portfolio reviewer for students and developers.**  
Turn public GitHub data into a recruiter-style first impression, actionable fixes, and a way to measure progress.

[**🚀 Try GitRoast AI**](https://gitroast-ai-494460734333.asia-south1.run.app) · [**💻 Source code**](https://github.com/aeroslayys/GitRoast-AI) · [**✅ CI tests**](https://github.com/aeroslayys/GitRoast-AI/actions)

![Node.js](https://img.shields.io/badge/Node.js-20%2B-387c61?style=flat-square)
![Dependencies](https://img.shields.io/badge/runtime%20dependencies-0-4d7ca0?style=flat-square)
![Cloud Run](https://img.shields.io/badge/hosted%20on-Google%20Cloud%20Run-5c86a6?style=flat-square)
[![Tests](https://github.com/aeroslayys/GitRoast-AI/actions/workflows/test.yml/badge.svg)](https://github.com/aeroslayys/GitRoast-AI/actions/workflows/test.yml)

</div>

---

## 🌱 About the project

Students are told to *“build a GitHub portfolio”*—but rarely shown what makes one easy to understand. Empty bios, vague repository descriptions, missing READMEs, and projects without demos can hide genuinely interesting work.

**GitRoast AI** reviews a real **public personal GitHub profile** and answers three questions:

- **What would someone notice in a quick profile scan?**
- **What is making this portfolio hard to understand?**
- **What can its owner improve next, and did those changes help?**

It combines a **transparent, rules-based score** with **optional Google Gemini feedback** that is witty without being mean. The goal is better presentation, **not** to judge someone's skills, personality, or chances of being hired.

The interface uses a **muted Windows Vista Aero / Frutiger Aero aesthetic**, with frosted-glass panels, soft blue-grey colors, and responsive layouts.

## ✨ The experience: Review → Improve → Track

Instead of a long stack of separate dashboards, the report has **three tabs**:

| Stage | What you get |
| --- | --- |
| **01 · Review** | Profile summary, **0–100 portfolio-presentation score**, five-category breakdown, recruiter-style verdict, playful roast / kind mode, and an explicit **Gemini vs. rules** source label. |
| **02 · Improve** | Prioritized **Glow-Up Plan**, a collapsible list of sampled projects, and **one workshop** that brings README Doctor and Fix-It Studio together under one repository selector. |
| **03 · Track** | Save a baseline, recheck public GitHub metrics without Gemini, and compare scores and visible signals **before and after** changes. |

### Review — a first impression backed by evidence

Paste a GitHub username—**no GitHub login required**. The server reads public profile information and original, non-archived repositories via the GitHub REST API.

The **deterministic** score totals 100 points:

| Category | Maximum | What it measures |
| --- | ---: | --- |
| Profile basics | 20 | Name, bio, website link |
| Project clarity | 25 | Original repositories and useful descriptions |
| Documentation | 30 | Presence and depth of **sampled** READMEs |
| Recent work | 15 | Recent public repository activity |
| Discoverability | 10 | Repository topics and demo/homepage links |
| **Total** | **100** | **A presentation heuristic—not a hiring prediction** |

Gemini, when configured and available, writes the headline, verdict, roast, encouragement, and next-step suggestion. **Gemini never sets the numerical score.** If AI is unavailable, evidence-based feedback is shown with a **rules-based** label.

You can also **share a profile-specific report link**, copy a text summary, or download the report.

### Improve — one plan, one workshop

The **Glow-Up Plan** prioritizes specific improvements instead of giving generic advice. Check off tasks as you work; the first few are shown up front to reduce clutter.

The workshop offers two related tools for the **same selected repository**:

**⌕ README Doctor**

- Examines a public repository's README **on demand**.
- Checks seven visible documentation signals: overview, features, setup, usage, screenshots/demo, current status, and license information.
- Distinguishes **found**, **needs improvement**, **not detected**, and **unavailable** information.
- Identifies a practical first fix, with a copyable improvement plan.
- Uses deterministic checks; **no Gemini call** is needed.

**✦ Fix-It Studio**

- Creates editable drafts for a **GitHub bio**, repository description, and README outline.
- Uses **public profile and repository metadata** as evidence.
- Calls Gemini only when requested; otherwise, offers clearly labeled rules-based templates.
- Provides **copy** and **README Markdown download** options.
- Uses placeholders for unknown details. **Always verify suggested claims, commands, and features before publishing.**

**Nothing is automatically changed on GitHub.** The user remains in control of what they copy, edit, or publish.

### Track — see whether your improvements worked

1. Analyze your profile and **save a baseline**.
2. Update the bio, READMEs, descriptions, topics, or project demos on GitHub.
3. Select **Recheck GitHub now** to get fresh public-profile metrics, without Gemini.
4. Compare your total score, five categories, and visible repository signals.

Snapshots are stored in **browser localStorage**, separately for each username—not in a shared database. Clearing site data or switching browsers removes access to that local history. A fresh progress recheck does **not** automatically replace the main AI report; run another audit for that.

## 🛠️ Technology

| Layer | Technologies |
| --- | --- |
| Frontend | HTML5, responsive CSS, vanilla JavaScript |
| Visual design | CSS glassmorphism, SVG scenery, Vista / Frutiger Aero-inspired styling |
| Backend | Node.js 20+ built-in HTTP server; **zero runtime npm dependencies** |
| Public data | GitHub REST API |
| AI feedback & optional writing drafts | Google Gemini GenerateContent API |
| Hosting | Google Cloud Run with GitHub-connected build/deployment |
| Tests | Node.js built-in test runner + GitHub Actions |

There is **no frontend framework, database, Dockerfile, or bundled SDK** required to run the project.

## 🚀 Getting started

**Requirements:** Node.js 20+ and internet access for public GitHub requests.

~~~bash
git clone https://github.com/aeroslayys/GitRoast-AI.git
cd GitRoast-AI

# No npm install needed: no runtime packages
npm start
~~~

Open **http://localhost:8080**.

For a basic health check:

~~~bash
curl http://localhost:8080/health
~~~

### Optional Gemini configuration

The app runs in **rules-based mode without an API key**. To enable Gemini-generated feedback and on-demand writing drafts, provide a Gemini API key as a **server-side environment variable**:

~~~bash
# macOS / Linux
export GEMINI_API_KEY="YOUR_API_KEY"
npm start
~~~

You can also create your own local `.env` file using `.env.example` as a guide, then start Node with `node --env-file=.env server.js`. The normal `npm start` command does **not** automatically load `.env`.

| Variable | Required? | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | No | Enables Gemini feedback and optional Fix-It Studio generation |
| `GEMINI_MODEL` | No | Primary Gemini model; default: `gemini-3.5-flash-lite` |
| `GEMINI_BACKUP_MODEL` | No | Backup model used for eligible failures; default: `gemini-3.1-flash-lite` |
| `GITHUB_TOKEN` | No | Raises GitHub API request limits; stored **only on the server** |
| `PORT` | No | HTTP port; defaults to `8080` |

Model access and free-tier eligibility depend on your Google AI project. If a Gemini request fails, the app can fall back to **clearly labeled rules-based feedback or drafts**.

**Never commit secrets** or place a Gemini/GitHub token in frontend JavaScript.

## ☁️ Deployment

**Live app:** [GitRoast AI on Google Cloud Run](https://gitroast-ai-494460734333.asia-south1.run.app)

The project is set up for **Cloud Run source deployment** and **GitHub-connected continuous builds** from `main`. The Node server listens on `0.0.0.0` and honors the `PORT` environment variable supplied by Cloud Run.

For your own deployment:

1. Create a Google Cloud project, enable billing, and enable the necessary Cloud Run, Cloud Build, Artifact Registry, and Secret Manager APIs.
2. Store your Gemini API key in **Secret Manager**.
3. Give the Cloud Run **runtime service account** the **Secret Manager Secret Accessor** role on that secret.
4. Deploy this repository as a Cloud Run source service, or configure a GitHub-connected Cloud Build trigger.

Example manual source deployment:

~~~bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

gcloud run deploy gitroast-ai \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --set-secrets GEMINI_API_KEY=gitroast-gemini:latest
~~~

The name `gitroast-gemini` in this example assumes you created a secret with that name. Leave out `--set-secrets` if you want to deploy **rules-only mode**.

Cloud Run, Cloud Build, Secret Manager, and Gemini may incur **usage-based charges** depending on free tiers, quotas, and billing configuration.

## 🧪 Testing

~~~bash
npm test
~~~

The [GitHub Actions workflow](.github/workflows/test.yml) runs the test suite on pushes to `main` and pull requests. Tests cover profile validation, deterministic scoring, GitHub API handling, Gemini success/fallback, README Doctor, Fix-It Studio, progress tracking, browser event flows, and static asset serving.

## 🔒 Privacy, fairness & limitations

- **Public data only.** The analyzer is intended for public personal GitHub profiles; private repository contents are not part of the report.
- **No login or GitHub write access.** The app doesn't edit, star, or commit to users' repositories.
- **No predictive hiring claims.** Scores describe visible portfolio presentation, not ability or employability.
- **README sampling is limited.** The main report queries up to 300 repositories and samples READMEs for up to eight featured projects. README Doctor checks selected public README text on demand rather than running or validating project code.
- **Visible AI provenance.** Each report or writing draft identifies whether Gemini or deterministic rules produced it.
- **Some limits apply.** GitHub API quotas, caching, temporary API failures, and server request limits can affect availability. Normal reports are cached for approximately 10 minutes; progress rechecks request fresh metrics.
- **Local-only progress.** Baselines and progress comparisons remain in the browser. They are not portable across devices unless manually copied.
- **AI drafts require review.** Generated language can be inaccurate; bracketed placeholders signal missing evidence.

## 🤖 AI-assisted development

GitRoast AI was built with help from an **AI coding assistant** and uses **Gemini at runtime** for optional feedback and writing suggestions. The audit score itself is deterministic and implemented in [`engine.js`](engine.js). Source code, scoring rules, and tests are available in this repository.

## 💡 The idea behind GitRoast

**A useful roast should end with a fix.**

GitRoast AI exists to help students turn unfinished-looking GitHub profiles into clearer evidence of what they've actually built—without gatekeeping, needless negativity, or pretending a single score can define a developer.

---

<div align="center">

**Built for better portfolios, one commit at a time.**

[**Open the app ↗**](https://gitroast-ai-494460734333.asia-south1.run.app)

</div>
