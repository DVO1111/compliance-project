import { providerRegistry } from './providerRegistry';

import { SlackProvider } from './slackProvider';
import { MicrosoftTeamsProvider } from './microsoftTeamsProvider';
import { JiraProvider } from './jiraProvider';
import { AsanaProvider } from './asanaProvider';
import { MondayProvider } from './mondayProvider';
import { GoogleDriveProvider } from './googleDriveProvider';
import { Microsoft365Provider } from './microsoft365Provider';
import { NotionProvider } from './notionProvider';
import { HubSpotProvider } from './hubspotProvider';
import { VeevaPromoMatsProvider } from './veevaPromoMatsProvider';
import { AdobeAemProvider } from './adobeAemProvider';
import { VeevaRimProvider } from './veevaRimProvider';
import { PharmacovigilanceProvider } from './pharmacovigilanceProvider';
import { HealthcareLmsProvider } from './healthcareLmsProvider';

// Optional legacy webhook provider
let WebhookProvider: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  WebhookProvider = require('./webhookProvider').WebhookProvider;
} catch {
  // ignore if not present
}

/* Register providers */
providerRegistry.register(new SlackProvider());
providerRegistry.register(new MicrosoftTeamsProvider());
providerRegistry.register(new JiraProvider());
providerRegistry.register(new AsanaProvider());
providerRegistry.register(new MondayProvider());
providerRegistry.register(new GoogleDriveProvider());
providerRegistry.register(new Microsoft365Provider());
providerRegistry.register(new NotionProvider());
providerRegistry.register(new HubSpotProvider());

/* Pharma integrations */
providerRegistry.register(new VeevaPromoMatsProvider());
providerRegistry.register(new AdobeAemProvider());
providerRegistry.register(new VeevaRimProvider());
providerRegistry.register(new PharmacovigilanceProvider());
providerRegistry.register(new HealthcareLmsProvider());

if (WebhookProvider) providerRegistry.register(new WebhookProvider());