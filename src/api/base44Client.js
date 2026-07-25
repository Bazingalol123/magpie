import { createClient } from '@base44/sdk';

const appId = import.meta.env.VITE_BASE44_APP_ID || '6a622e254ee5f8740523313e';
const localBaseUrl = import.meta.env.VITE_BASE44_APP_BASE_URL;

export const base44 = createClient({
  appId,
  ...(localBaseUrl
    ? {
        serverUrl: localBaseUrl,
        appBaseUrl: localBaseUrl,
      }
    : {}),
});
