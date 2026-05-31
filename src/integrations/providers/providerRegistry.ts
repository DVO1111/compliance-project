import type { ProviderId } from '../types';
import { BaseProvider } from './baseProvider';

/* ═══════════════════════════════════════════════════════════════
   Provider Registry — Singleton map of all registered providers
   ═══════════════════════════════════════════════════════════════
   When a new provider is implemented, it registers itself here.
   The webhook handler and job runner use this registry to look
   up the correct provider for a given connection.

   Usage (when implementing a provider):
   ```ts
   import { providerRegistry } from './providerRegistry';
   import { SlackProvider } from './slackProvider';
   providerRegistry.register(new SlackProvider());
   ```
   ═══════════════════════════════════════════════════════════════ */

class ProviderRegistry {
    private providers = new Map<ProviderId, BaseProvider>();

    register(provider: BaseProvider): void {
        this.providers.set(provider.id, provider);
    }

    get(id: ProviderId): BaseProvider | undefined {
        return this.providers.get(id);
    }

    getAll(): BaseProvider[] {
        return Array.from(this.providers.values());
    }

    has(id: ProviderId): boolean {
        return this.providers.has(id);
    }

    /** Return manifests for the integrations marketplace UI */
    getAllManifests() {
        return this.getAll().map(p => p.manifest);
    }
}

/** Singleton — import this from anywhere */
export const providerRegistry = new ProviderRegistry();
