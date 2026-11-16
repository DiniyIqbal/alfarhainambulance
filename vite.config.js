import { resolve } from 'path';
import { defineConfig, loadEnv } from 'vite';

/**
 * Local development plugin to emulate Vercel Serverless Functions (/api/*)
 * during `npm run dev` so developers can test Google Maps Server APIs locally.
 */
function apiDevPlugin() {
  return {
    name: 'api-dev-server',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url && req.url.startsWith('/api/')) {
          try {
            const cleanUrl = req.url.split('?')[0];
            let modulePath = '';

            if (cleanUrl === '/api/calculate-route') {
              modulePath = '/api/calculate-route.js';
            } else if (cleanUrl === '/api/maps/route') {
              modulePath = '/api/maps/route.js';
            } else if (cleanUrl === '/api/payment/create-checkout') {
              modulePath = '/api/payment/create-checkout.js';
            } else if (cleanUrl === '/api/payment/webhook') {
              modulePath = '/api/payment/webhook.js';
            } else {
              // Only plain /api/<segment>/<segment> routes; never private _lib
              // helpers or path traversal.
              if (!/^\/api(\/[a-z0-9-]+)+$/i.test(cleanUrl)) {
                res.statusCode = 404;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: false, error: 'Not found' }));
                return;
              }
              modulePath = `${cleanUrl}.js`;
            }

            const { default: handler } = await server.ssrLoadModule(modulePath);
            let body = {};
            let rawBody = '';
            if (req.method === 'POST') {
              const chunks = [];
              for await (const chunk of req) {
                chunks.push(chunk);
              }
              rawBody = Buffer.concat(chunks).toString('utf-8');
              if (rawBody) {
                try {
                  body = JSON.parse(rawBody);
                } catch {
                  body = {};
                }
              }
            }
            const fakeReq = {
              socket: req.socket,
              method: req.method,
              headers: req.headers,
              body,
              rawBody,
              query: Object.fromEntries(new URL(req.url, 'http://localhost').searchParams)
            };
            const fakeRes = {
              statusCode: 200,
              status(code) {
                this.statusCode = code;
                return this;
              },
              json(data) {
                res.statusCode = this.statusCode;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(data));
              },
              setHeader(k, v) {
                res.setHeader(k, v);
              },
              end(val) {
                res.statusCode = this.statusCode;
                res.end(val);
              }
            };
            await handler(fakeReq, fakeRes);
          } catch (err) {
            console.error('[Vite API Dev Error]:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
        } else {
          next();
        }
      });
    }
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // Populate server-side environment variables for Vite dev server SSR emulation
  const envKeys = [
    'GOOGLE_MAPS_SERVER_KEY',
    'CHIP_BRAND_ID',
    'CHIP_SECRET_KEY',
    'CHIP_PUBLIC_KEY',
    'CHIP_API_URL',
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'CHIP_WEBHOOK_URL',
    'APP_BASE_URL',
    'ALLOWED_ORIGINS'
  ];

  envKeys.forEach((k) => {
    if (env[k] && !process.env[k]) {
      process.env[k] = env[k];
    }
  });

  // Lets api/_lib/security.js enable local-only fallbacks (mock payments,
  // dev identity when no service key). Never set in Vercel deployments.
  if (command === 'serve') {
    process.env.AFAMS_DEV_SERVER = '1';
  }

  return {
    base: '/',
    plugins: [apiDevPlugin()],
    server: {
      host: true,
      port: 5173
    },
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          portal: resolve(__dirname, 'portal.html'),
          driver: resolve(__dirname, 'driver.html')
        }
      }
    }
  };
});

