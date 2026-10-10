# Deploying the frontend to Vercel

This repository contains a React/Vite frontend in the repository root and a
Django backend in `backend/`. The Vercel project described here deploys only
the frontend.

## Deployment order for this project

### 1. Create the Vercel frontend Preview

Deploy the frontend first with `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY`. This provides the Vercel URL needed for the backend
allowlist. At this stage, test the public pages, React Router navigation, and
Supabase-backed features. Django-backed reports, backups, notifications, and
some admin operations are expected to remain unavailable.

Before making the Preview public, confirm in the Supabase dashboard that the
repository's migrations have been applied and Row Level Security is enabled
on every browser-accessible table and storage bucket. The anon key is public
by design; data protection depends on the database policies.

### 2. Deploy Django on Render

After Render provides the backend's public HTTPS origin, configure these
backend environment variables:
   - `DEBUG=false`
   - `ALLOWED_HOSTS=api.example.com` (hostname only)
   - `CORS_ALLOWED_ORIGINS=https://your-project.vercel.app`
   - `CSRF_TRUSTED_ORIGINS=https://your-project.vercel.app`
   - `SITE_URL=https://api.example.com`

Use comma-separated values when more than one frontend origin is needed. The
backend settings preserve the local Vite origins for development and append
the deployed origins from these variables.

Render must use Supabase Postgres rather than the repository's local SQLite
file because Render's normal service filesystem is ephemeral.

#### Render web-service settings

Create a **Web Service** from the same repository and use the
`initial-progress` branch until the project is ready to merge into `main`.
Set **Root Directory** to `backend`, then configure:

| Setting | Value |
| --- | --- |
| Build Command | `pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate` |
| Start Command | `gunicorn aicsync.wsgi:application --bind 0.0.0.0:$PORT` |
| Health Check Path | `/api/health/` |

In Render's environment-variable settings, add `DEBUG=false`, a newly
generated `SECRET_KEY`, and `PYTHON_VERSION=3.13.5`. Render automatically
supplies its hostname to this project; add any custom API hostname (without
`https://`) to `ALLOWED_HOSTS`. Add the Vercel production URL to both
`CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS`. Configure the Supabase
Postgres connection with `DB_ENGINE=django.db.backends.postgresql` plus
`DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, and `DB_PORT` from Supabase's
Connect dialog. Keep all credentials in Render—not in Git.

Celery-powered backup automation additionally needs a managed Redis URL and
separate Render worker/scheduler services. Deploy the web service first; add
those services only when automated backups are ready to test.

### 3. Connect Vercel to Render

Copy the Render origin, without `/api` and without a trailing slash, into
Vercel as `VITE_API_BASE_URL`. For example: `https://api.example.com`. Redeploy
the Vercel Preview because Vite embeds environment variables at build time.
Test the complete system before promoting the frontend to Production.

## Import the project

1. Push this repository to GitHub, GitLab, or Bitbucket.
2. In Vercel, choose **Add New > Project** and import the repository.
3. Keep the **Root Directory** as the repository root (`./`), not `backend`.
4. This repository currently uses `main` as its default branch while the
   deployment work is on `initial-progress`. Prefer merging the tested changes
   into `main`. Otherwise, set **Settings > Environments > Production Branch**
   to `initial-progress` before treating the deployment as production.
5. Vercel should detect **Vite**. Confirm these settings:
   - Install Command: `npm install`
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Node.js Version: `24.x` (also pinned in `package.json`)

## Environment variables

Add the two Supabase variables in **Project Settings > Environment Variables**
for Preview now. Add `VITE_API_BASE_URL` after the Render deployment exists.
Before the final release, apply all three variables to Production too:

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | The project's Supabase URL |
| `VITE_SUPABASE_ANON_KEY` | The Supabase anon/publishable key |
| `VITE_API_BASE_URL` | Add after Render deploys: the Django origin, such as `https://api.example.com` |

Do not add `SUPABASE_SERVICE_ROLE_KEY`, Django's `AUTH_SECRET`, email
credentials, or Twilio credentials to Vercel. Variables prefixed with `VITE_`
are bundled into browser code and must be treated as public.

After adding or changing a Vite environment variable, redeploy the frontend;
Vite reads these values at build time.

## Supabase settings

In Supabase Authentication URL configuration, set the production Site URL to
the Vercel production URL. Add the production URL and any Vercel preview URLs
that need to complete authentication to the allowed redirect URLs.

## Verify the deployment

1. Open the home page and sign in with a test account.
2. Refresh a nested route such as `/student/home`; it should not return 404.
3. In browser developer tools, verify API calls use the public HTTPS backend,
   not `localhost` or `127.0.0.1`.
4. Confirm there are no CORS or mixed-content errors in the browser console.
5. Test one Supabase-backed action and one Django-backed action.

The root `vercel.json` sends unknown frontend paths to `index.html`, allowing
React Router to handle direct links and page refreshes.
