import { checkDomainAvailabilityWeb } from './src/lib/domainLookupCore.ts';
import { DEFAULT_PREMIUM_CONFIG } from './src/lib/featureRegistry.ts';
import {
  DEFAULT_DOMAIN_AFFILIATE_CONFIG,
  DEFAULT_PAYMENT_SETTINGS,
  DEFAULT_SITE_SEO_CONFIG,
  type PublicSiteConfigResponse,
} from './src/types/admin.ts';
import { DEFAULT_SITE_ADSENSE_CONFIG } from './src/types/adsense.ts';

interface CloudflareAssetFetcher {
  fetch(request: Request): Promise<Response>;
}

interface WorkerEnv {
  ASSETS: CloudflareAssetFetcher;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/domain/check' && request.method === 'POST') {
      try {
        const rawBody = await request.text();
        const body = rawBody.trim()
          ? (JSON.parse(rawBody) as {
              query?: string;
              tlds?: string[];
              includeSuggestions?: boolean;
            })
          : {};
        const result = await checkDomainAvailabilityWeb({
          query: String(body.query || ''),
          tlds: Array.isArray(body.tlds) ? body.tlds : undefined,
          includeSuggestions: body.includeSuggestions !== false,
        });
        return jsonResponse(result, 200);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Gagal memeriksa ketersediaan domain.';
        return jsonResponse({ error: message }, 400);
      }
    }

    if (url.pathname === '/api/config/public' && request.method === 'GET') {
      const fallbackConfig: PublicSiteConfigResponse = {
        dbMode: 'local-sqlite',
        adsense: DEFAULT_SITE_ADSENSE_CONFIG,
        units: [],
        seo: DEFAULT_SITE_SEO_CONFIG,
        premium: DEFAULT_PREMIUM_CONFIG,
        payment: DEFAULT_PAYMENT_SETTINGS,
        domainAffiliate: DEFAULT_DOMAIN_AFFILIATE_CONFIG,
        freellm: {
          enabled: true,
          defaultModel: 'auto',
          routingStrategy: 'auto',
          allowForGuests: true,
          configuredProviders: [],
        },
        gcloud: {
          enabled: false,
          projectId: '',
          oauthEnabled: false,
          oauthClientId: '',
          hasGeminiApiKey: false,
          hasIndexingServiceAccount: false,
          serviceAccountEmail: '',
        },
      };
      return jsonResponse(fallbackConfig, 200);
    }

    if (url.pathname === '/api/admin/auth/status' && request.method === 'GET') {
      return jsonResponse({
        adminConfigured: false,
        adminEmail: '',
        adminDisplayName: '',
        dbMode: 'local-sqlite',
      });
    }

    if (url.pathname === '/api/auth/session' && request.method === 'GET') {
      return jsonResponse({ authenticated: false, user: null });
    }

    if (url.pathname.startsWith('/api/')) {
      return jsonResponse(
        {
          error:
            'Endpoint ini memerlukan server backend Node.js (server.ts). Fitur Cari Domain dan editor XML tetap berjalan penuh di Cloudflare.',
        },
        501
      );
    }

    return env.ASSETS.fetch(request);
  },
};
