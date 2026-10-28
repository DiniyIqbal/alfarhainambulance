# Bubblewrap / Android TWA Setup

## 1. Configure only public browser credentials

Copy `.env.example` to `.env` locally and set only the Supabase project URL
and anon/publishable key. Never place a Supabase secret key, service-role key,
database password or signing keystore in this web project.

## 2. Deploy the updated source to Vercel

Vercel should run:

```bash
npm ci
npm run build
```

The output directory is `dist`.

## 3. Verify the public manifest

Open the following URL after deployment:

```text
https://YOUR-VERCEL-DOMAIN/manifest.webmanifest
```

It must return JSON publicly, without a login page, deployment-protection page
or 404 response. These icon URLs must also load:

```text
https://YOUR-VERCEL-DOMAIN/icons/icon-192.png
https://YOUR-VERCEL-DOMAIN/icons/icon-512.png
```

## 4. Initialise Bubblewrap

Run this from a new empty directory:

```powershell
$manifestUrl = "https://YOUR-VERCEL-DOMAIN/manifest.webmanifest"
bubblewrap init --manifest="$manifestUrl"
```

Keep the Android signing keystore private and backed up. Do not add it to this
project or upload it with the source code.

## 5. Complete domain verification

Before production release, generate and deploy the required Digital Asset
Links file at `/.well-known/assetlinks.json` using the final Android package
name and signing-certificate fingerprint.

