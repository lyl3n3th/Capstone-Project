# Vercel frontend deployment

This repository is a React single-page application built with Vite. Vercel
serves the generated `dist` folder. The root `vercel.json` keeps React Router
URLs working on direct visits and refreshes, including `/student/login`,
`/admin/dashboard`, and `/staff/login`.

## Before creating the Vercel project

1. Run the frontend checks from the repository root:

   ```powershell
   npm.cmd run lint
   npm.cmd run build
   ```

2. Commit and push the intended frontend changes to the Git branch that Vercel
   will deploy. Vercel deploys the Git commit, not uncommitted files on this
   computer.

3. Have the production Supabase project URL and its **anon/publishable** key
   ready. Never use a Supabase service-role key in the frontend.

## Create the project in Vercel

1. In Vercel, choose **Add New**, then **Project**, and import the Git repository.
2. Set the **Root Directory** to `.` (the repository root). Do not select
   `backend`.
3. Confirm these build settings:

   | Setting | Value |
   | --- | --- |
   | Framework preset | Vite |
   | Node.js Version | 24.x |
   | Install command | Automatically detected from `package-lock.json` |
   | Build command | `npm run build` |
   | Output directory | `dist` |

   Node 24.x is also declared in `package.json`, so the version is consistent
   even if a different version is selected in the Vercel UI.

## Add Vercel environment variables

Open **Project Settings**, then **Environment Variables**, and add these variables to
both **Production** and **Preview** (use a separate Supabase project for
Preview if you have one):

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | Your Supabase project URL, such as `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | The Supabase anon/publishable key |
| `VITE_API_BASE_URL` | Your Render backend's HTTPS base URL, with no trailing slash, such as `https://aicsync-api.onrender.com` |

`VITE_*` values are embedded in the browser bundle. The Supabase anon key is
designed for browser use when Row Level Security is configured; it is not a
server secret. Do **not** put any of the following in Vercel or prefix them
with `VITE_`: `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_SECRET`, SMTP credentials,
Twilio credentials, or database passwords.

The frontend can be deployed before Render exists, but API-backed features
(reports, backups, alumni, and email-notification actions) will not work until
`VITE_API_BASE_URL` is set to the deployed Render URL and Vercel is redeployed.
Without that variable, those requests target `localhost`, which is the site
visitor's computer and cannot reach the backend.

## First deployment checks

1. Deploy the project and open the generated `*.vercel.app` URL.
2. Open these URLs directly (not only through in-app navigation):

   - `/student/login`
   - `/staff/login`
   - `/admin/dashboard`

   Each should load the app or redirect to its login page, rather than showing
   a Vercel 404.

3. In browser developer tools, verify there are no missing `VITE_SUPABASE_*`
   errors. Once Render is deployed, verify API calls target its HTTPS domain,
   not `localhost`.

## Required handoff when Render is deployed

Set `VITE_API_BASE_URL` to the final Render URL in Vercel for Production and
Preview, then redeploy the corresponding Vercel deployments. Configure the
Django backend's CORS allow-list to include the exact Vercel production domain
and any Preview domains that need to access it. A Vercel deployment cannot
remove a CORS restriction enforced by the backend.
