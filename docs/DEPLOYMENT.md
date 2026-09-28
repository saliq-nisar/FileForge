# FileForge — Deployment Guide

This guide covers two ways to put FileForge online:

| Edition | Host | Cost | What works |
| --- | --- | --- | --- |
| **A. Standard (recommended start)** | Vercel | Free Hobby plan for personal and evaluation use | Every browser-based tool: PDF, editor, OCR, images, documents, compression, business, career, workspace, settings |
| **B. Full** | Your own server with Docker (VPS or cloud VM) | Free-tier VM or a small VPS | Everything in A, **plus** server conversions: Word/Excel/PowerPoint → PDF, PDF → PowerPoint, PDF/A, protect and unlock PDF |

> **Important — commercial use:** Vercel's free Hobby plan is intended for personal, non-commercial projects. If you deploy for a paying client or a business, use Vercel Pro (or Edition B). Check Vercel's current plan terms before launch.

No database, AI key or third-party service is needed for either edition.

---

## 0. Before you deploy

**Requirements:** Node.js 20.9 or newer (22 LTS recommended), a GitHub account and a Vercel account.

Run the full quality check locally:

```bash
npm install          # also copies engine assets into public/vendor
npm run check        # lint + typecheck + tests + production build
```

Optional end-to-end tests:

```bash
npx playwright install chromium
npm run test:e2e
```

### Put the project in Git

The project is not a Git repository yet. Create one and push it to GitHub:

```bash
git init
git add .
git commit -m "Initial FileForge release"
git branch -M main
# Create an empty repository on github.com first, then:
git remote add origin https://github.com/<you>/fileforge.git
git push -u origin main
```

(With the GitHub CLI you can use `gh repo create fileforge --private --source . --push` instead.)

`.gitignore` already excludes `node_modules`, `.next`, `.env*` (except `.env.example`), test output, and the generated `public/vendor` folder. The vendor folder is rebuilt automatically on every install and build.

---

## A. Deploy to Vercel (Standard edition)

### A1. Using the dashboard

1. Go to **vercel.com → Add New → Project** and import your GitHub repository.
2. Vercel detects **Next.js** automatically. Keep the defaults:
   - Install command: `npm install` (runs `postinstall`, which copies the PDF.js and OCR assets)
   - Build command: `npm run build` (runs `prebuild` first)
   - Output: automatic
3. Under **Environment Variables**, add:

   | Name | Value | Notes |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SITE_URL` | `https://your-project.vercel.app` | Used for canonical URLs, the sitemap and social previews |

   Leave everything else unset. In particular, **don't set** `LIBREOFFICE_PATH`, `QPDF_PATH` or `GHOSTSCRIPT_PATH`: those engines don't exist on Vercel.
4. Click **Deploy**. The first build takes about 1–2 minutes.

### A2. Using the CLI (alternative)

```bash
npm i -g vercel
vercel login
vercel            # preview deployment (answers: link project, keep defaults)
vercel env add NEXT_PUBLIC_SITE_URL production
vercel --prod     # production deployment
```

### A3. Custom domain

1. In Vercel, open **Project → Settings → Domains** and add `tools.yourdomain.com`.
2. Add the DNS record Vercel shows (usually a `CNAME` to `cname.vercel-dns.com`) at your domain registrar. HTTPS is issued automatically.
3. Update `NEXT_PUBLIC_SITE_URL` to `https://tools.yourdomain.com`, then **redeploy**.

   `NEXT_PUBLIC_*` values are built into the pages at build time, so changing the variable alone isn't enough.

### A4. How FileForge behaves on Vercel

- **Browser tools work fully.** The tools run on the visitor's device. Vercel only serves pages and static files, including the about 28 MB of OCR and PDF engine assets under `/vendor`, cached by the CDN.
- **Server-engine tools show "not enabled on this deployment".** This is expected: Vercel functions don't include LibreOffice, qpdf or Ghostscript. Users are told clearly, and nothing is uploaded.
- **The server job API is not meant for serverless.** Vercel functions have a request-body limit of about 4.5 MB. Jobs also run in-process, and serverless instances can pause or change between requests. The UI only uses this API for server-engine tools, which are disabled on Vercel, so users aren't affected. For server processing, use Edition B.
- **Security headers.** CSP, frame protection, `nosniff` and the referrer and permissions policies come from `next.config.ts` and apply automatically.

### A5. After deploying — checklist

Open these URLs on your deployment:

- [ ] `/api/health` → `{"status":"ok", …}`
- [ ] `/api/capabilities` → all engines `false` (correct on Vercel)
- [ ] `/sitemap.xml` and `/robots.txt` show your real domain (if not, fix `NEXT_PUBLIC_SITE_URL` and redeploy)
- [ ] `/vendor/tesseract/lang/eng.traineddata.gz` downloads (confirms the vendor assets were built)
- [ ] `/tools/merge-pdf` — merge two PDFs
- [ ] `/tools/ocr` — run OCR on a scan (the first run downloads the English model, about 3 MB)
- [ ] `/tools/png-to-jpg` — convert an image
- [ ] `/business/invoice/new` — download an invoice PDF
- [ ] Check security headers: `curl -I https://your-domain/` should show `content-security-policy` and `x-frame-options: DENY`
- [ ] Try it on a phone (320–414 px wide) and in dark mode

### A6. Updates and rollbacks

- Every push to `main` deploys to production. Other branches and pull requests get their own preview URLs.
- To roll back, open **Deployments**, pick a previous deployment, and choose **Promote to Production**. It takes effect instantly.

---

## B. Full edition on your own server (Docker)

Use this when you need Word/Excel/PowerPoint → PDF, PDF → PowerPoint, PDF/A or password protection. Everything runs in one container on one machine.

### B1. Server options

- **Free:** some cloud providers offer "always free" virtual machines (for example, Oracle Cloud's free tier). Check their current terms.
- **Low cost:** any small VPS with **2 GB RAM or more**. LibreOffice needs memory for conversions.
- Free app platforms that sleep when idle or have 512 MB RAM are **not recommended**: LibreOffice conversions will be slow or fail.

The default job queue and temporary storage are **single-instance**. Run one container. Scaling to several instances needs a shared job store and storage; the interfaces are in `src/server`.

### B2. Add these two files to the project

`Dockerfile`:

```dockerfile
FROM node:22-bookworm-slim

# Optional server engines: LibreOffice (Office ↔ PDF), qpdf (encryption), Ghostscript (PDF/A)
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-core libreoffice-writer libreoffice-calc libreoffice-impress \
      qpdf ghostscript fonts-liberation fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# postinstall copies PDF.js/OCR assets, so the script must exist before npm ci
COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci

COPY . .

# NEXT_PUBLIC_* values are baked in at build time
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
RUN npm run build && chown -R node:node /app

ENV NODE_ENV=production \
    PORT=3000 \
    LIBREOFFICE_PATH=/usr/bin/soffice \
    QPDF_PATH=/usr/bin/qpdf \
    GHOSTSCRIPT_PATH=/usr/bin/gs \
    MAX_UPLOAD_MB=200 \
    TEMP_FILE_TTL_MINUTES=60

USER node
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
```

`.dockerignore`:

```
node_modules
.next
public/vendor
test-results
playwright-report
.git
.env*
```

### B3. Build and run

On the server (after installing Docker and cloning your repository):

```bash
docker build -t fileforge --build-arg NEXT_PUBLIC_SITE_URL=https://tools.yourdomain.com .
docker run -d --name fileforge --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  --memory 2g \
  fileforge
```

Check it:

```bash
curl http://127.0.0.1:3000/api/health
curl http://127.0.0.1:3000/api/capabilities   # engines should all be true
```

### B4. HTTPS with Caddy (simplest option)

Install Caddy and create `/etc/caddy/Caddyfile`:

```
tools.yourdomain.com {
    reverse_proxy 127.0.0.1:3000
}
```

Then run `sudo systemctl reload caddy`. Caddy obtains and renews the HTTPS certificate automatically. Point your domain's `A` record at the server's IP address.

If you use Nginx instead, set `client_max_body_size` to at least your `MAX_UPLOAD_MB` value, and pass `X-Forwarded-For` so per-visitor rate limiting works.

### B5. Updating

```bash
git pull
docker build -t fileforge --build-arg NEXT_PUBLIC_SITE_URL=https://tools.yourdomain.com .
docker rm -f fileforge
docker run -d --name fileforge --restart unless-stopped -p 127.0.0.1:3000:3000 --memory 2g fileforge
```

Temporary files live inside the container, in `/tmp/fileforge`. They are deleted after delivery or after `TEMP_FILE_TTL_MINUTES`, so no volume is needed.

### B6. Hybrid option

You can also keep the website on Vercel and run a separate Edition B server only for conversions. This needs a small change first: point the upload and job API calls in `src/services/api-client.ts` at that server, and add a CORS policy there. Until that change is made, use one edition or the other.

---

## Environment variables reference

All are optional. See `.env.example`.

| Variable | Where | Default | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Build time | `http://localhost:3000` | Canonical URLs, sitemap, Open Graph |
| `LIBREOFFICE_PATH` | Server | unset | Enables Office → PDF and PDF → PowerPoint |
| `QPDF_PATH` | Server | unset | Enables Protect / Unlock PDF |
| `GHOSTSCRIPT_PATH` | Server | unset | Enables PDF → PDF/A |
| `MAX_UPLOAD_MB` | Server | `200` | Upload limit for server tools |
| `TEMP_FILE_TTL_MINUTES` | Server | `60` | Maximum lifetime of temporary files |
| `AI_PROVIDER`, `AI_API_KEY` | Server | unset | Reserved for future optional AI; not used by any feature |

Never put secrets in `NEXT_PUBLIC_*` variables. Those values are visible in the browser.

---

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| OCR or PDF previews fail and `/vendor/...` returns 404 | Vendor assets weren't generated. Make sure the install step ran `postinstall` (don't use `--ignore-scripts`), or run `node scripts/copy-vendor-assets.mjs` before `npm run build`. |
| Build fails fetching fonts | The build downloads the Geist font from Google Fonts. The build machine needs internet access. |
| A tool says "isn't enabled on this deployment" | The engine path variable isn't set, or the binary isn't installed. Expected on Vercel; on Docker, check `/api/capabilities`. |
| Sitemap or social previews show `localhost` | `NEXT_PUBLIC_SITE_URL` was missing at build time. Set it and rebuild. |
| "Too many requests" on the server edition | The built-in per-IP rate limit was hit. Behind a proxy, make sure `X-Forwarded-For` is passed. Limits are in `src/server/security/index.ts`. |
| Office conversions time out | Give the container more memory (2 GB or more). The engine timeout is 120 seconds (`src/server/config.ts`). |

---

## Cost summary

| Setup | Monthly cost |
| --- | --- |
| Vercel Hobby (personal or evaluation) | Free |
| Vercel Pro (commercial) | Vercel's per-seat price; check the current pricing page |
| Free-tier cloud VM with Docker (full edition) | Free, within the provider's limits |
| Small VPS with 2 GB RAM (full edition) | A few dollars a month, depending on provider |
| Domain name | Registrar pricing (yearly) |
