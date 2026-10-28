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
        if (req.url && (req.url.startsWith('/api/maps/route') || req.url.startsWith('/api/calculate-route'))) {
          try {
            const modulePath = req.url.startsWith('/api/maps/route') ? '/api/maps/route.js' : '/api/calculate-route.js';
            const { default: handler } = await server.ssrLoadModule(modulePath);
            let body = {};
            if (req.method === 'POST') {
              const chunks = [];
              for await (const chunk of req) {
                chunks.push(chunk);
              }
              const raw = Buffer.concat(chunks).toString('utf-8');
              if (raw) {
                try {
                  body = JSON.parse(raw);
                } catch {
                  body = {};
                }
              }
            }
            const fakeReq = {
              method: req.method,
              headers: req.headers,
              body,
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
              }
            };
            await handler(fakeReq, fakeRes);
          } catch (err) {
            console.error('[Vite API Dev Error]:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, fallbackToOSRM: true, error: err.message }));
          }
        } else {
          next();
        }
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (env.GOOGLE_MAPS_SERVER_KEY && !process.env.GOOGLE_MAPS_SERVER_KEY) {
    process.env.GOOGLE_MAPS_SERVER_KEY = env.GOOGLE_MAPS_SERVER_KEY;
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

