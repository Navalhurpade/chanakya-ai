import { app, ipcMain, safeStorage, type IpcMainInvokeEvent } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  ipcChannels,
  providerIdInputSchema,
  providerSettingsSchema,
  saveProviderInputSchema,
  selectProviderInputSchema,
  setProviderEnabledInputSchema,
  storedProviderSettingsSchema,
  type ProviderSettings,
} from '../shared/provider-contracts';

const storageFile = () => path.join(app.getPath('userData'), 'providers.dat');
const emptySettings = {
  providers: [],
  selectedProviderId: null,
};

let writeQueue: Promise<void> = Promise.resolve();

export function assertTrustedSender(
  event: IpcMainInvokeEvent,
  isTrustedSender: (senderId: number) => boolean,
) {
  if (
    event.senderFrame !== event.sender.mainFrame ||
    !isTrustedSender(event.sender.id)
  ) {
    throw new Error('This window is not allowed to change provider settings.');
  }
}

export async function loadProviderForChat(providerId: string) {
  const settings = await loadStoredSettings();
  const provider = settings.providers.find((item) => item.id === providerId);
  if (!provider || !provider.enabled) {
    throw new Error('The selected provider is unavailable or disabled.');
  }
  if (provider.kind !== 'custom' && !provider.apiKey) {
    throw new Error('The selected provider does not have an API key.');
  }
  return provider;
}

async function assertEncryptionAvailable() {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) {
    throw new Error(
      'Secure credential storage is unavailable on this device. Provider settings were not saved.',
    );
  }
}

async function loadStoredSettings() {
  await assertEncryptionAvailable();
  let serialized: string;
  try {
    serialized = await fs.readFile(storageFile(), 'utf8');
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return storedProviderSettingsSchema.parse(emptySettings);
    }
    throw error;
  }

  const file = z
    .object({ encrypted: z.string() })
    .parse(JSON.parse(serialized));
  const plaintext = (
    await safeStorage.decryptStringAsync(Buffer.from(file.encrypted, 'base64'))
  ).result;
  return storedProviderSettingsSchema.parse(JSON.parse(plaintext));
}

async function writeStoredSettings(
  settings: z.infer<typeof storedProviderSettingsSchema>,
) {
  await assertEncryptionAvailable();
  const encrypted = safeStorage
    .encryptString(JSON.stringify(settings))
    .toString('base64');
  const file = storageFile();
  const temporary = `${file}.tmp`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(temporary, JSON.stringify({ encrypted }), {
    encoding: 'utf8',
    mode: 0o600,
  });
  await fs.rename(temporary, file);
}

function toPublicSettings(
  settings: z.infer<typeof storedProviderSettingsSchema>,
): ProviderSettings {
  const result = {
    providers: settings.providers.map(
      ({ apiKey, customHeaders, ...provider }) => ({
        ...provider,
        hasApiKey: apiKey.length > 0,
        hasCustomHeaders: Object.keys(customHeaders).length > 0,
      }),
    ),
    selectedProviderId: settings.selectedProviderId,
  };
  return providerSettingsSchema.parse(result);
}

function isPrivateOrLocalHost(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const mappedIpv4 = host.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mappedIpv4) return isPrivateOrLocalHost(mappedIpv4[1]);
  const mappedHex = host.match(/^::ffff:([a-f\d]{1,4}):([a-f\d]{1,4})$/);
  if (mappedHex) {
    const address =
      (Number.parseInt(mappedHex[1], 16) << 16) |
      Number.parseInt(mappedHex[2], 16);
    return isPrivateOrLocalHost(
      [
        (address >>> 24) & 255,
        (address >>> 16) & 255,
        (address >>> 8) & 255,
        address & 255,
      ].join('.'),
    );
  }
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.lan') ||
    host.endsWith('.home') ||
    host === '::' ||
    host === '::1' ||
    /^fe[89ab][a-f\d]:/.test(host) ||
    /^f[cd][a-f\d]{2}:/.test(host)
  ) {
    return true;
  }

  const octets = host.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 100 && second >= 64 && second <= 127) ||
    first >= 224
  );
}

function validateCustomEndpoint(
  rawUrl: string | undefined,
  allowPrivateNetwork: boolean,
) {
  if (!rawUrl) throw new Error('A base URL is required for a custom provider.');

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Enter a valid custom provider base URL.');
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      'The base URL cannot contain credentials, query parameters, or a fragment.',
    );
  }

  const privateHost = isPrivateOrLocalHost(url.hostname);
  if (privateHost && !allowPrivateNetwork) {
    throw new Error(
      'Local and private network URLs are blocked by default. Enable the private-network option only if you trust this endpoint.',
    );
  }
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && privateHost && allowPrivateNetwork)
  ) {
    throw new Error('Custom provider URLs must use HTTPS.');
  }
  return url.toString().replace(/\/+$/, '');
}

function validateCustomHeaders(headers: Record<string, string> | undefined) {
  const result: Record<string, string> = {};
  const forbidden = new Set([
    'authorization',
    'connection',
    'content-length',
    'cookie',
    'host',
    'origin',
    'proxy-authorization',
    'referer',
    'set-cookie',
    'transfer-encoding',
  ]);
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (
      !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) ||
      forbidden.has(name.toLowerCase())
    ) {
      throw new Error(`The custom header name "${name}" is not allowed.`);
    }
    if (value.length > 2048 || /[\r\n]/.test(value)) {
      throw new Error(`The value for "${name}" is invalid.`);
    }
    result[name] = value;
  }
  return result;
}

function queueSettingsUpdate(
  update: (
    current: z.infer<typeof storedProviderSettingsSchema>,
  ) => z.infer<typeof storedProviderSettingsSchema>,
) {
  const operation = writeQueue.then(async () => {
    const current = await loadStoredSettings();
    const next = storedProviderSettingsSchema.parse(update(current));
    await writeStoredSettings(next);
    return toPublicSettings(next);
  });
  writeQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}

export function registerProviderIpc(
  isTrustedSender: (senderId: number) => boolean,
) {
  ipcMain.handle(ipcChannels.listProviders, async (event) => {
    assertTrustedSender(event, isTrustedSender);
    return toPublicSettings(await loadStoredSettings());
  });

  ipcMain.handle(ipcChannels.saveProvider, async (event, rawInput: unknown) => {
    assertTrustedSender(event, isTrustedSender);
    const input = saveProviderInputSchema.parse(rawInput);
    return queueSettingsUpdate((current) => {
      const existing = input.id
        ? current.providers.find((provider) => provider.id === input.id)
        : undefined;
      if (input.id && !existing) {
        throw new Error('That provider configuration no longer exists.');
      }

      const name = input.name.trim();
      const model = input.model.trim();
      const apiKey = input.apiKey?.trim() || existing?.apiKey || '';
      if (input.kind !== 'custom' && !apiKey) {
        throw new Error('An API key is required for this provider.');
      }

      const baseUrl =
        input.kind === 'custom'
          ? validateCustomEndpoint(input.baseUrl, input.allowPrivateNetwork)
          : undefined;
      const customHeaders = input.customHeaders
        ? validateCustomHeaders(input.customHeaders)
        : (existing?.customHeaders ?? {});

      const provider = {
        id: existing?.id ?? crypto.randomUUID(),
        kind: input.kind,
        name,
        model,
        ...(baseUrl ? { baseUrl } : {}),
        apiKey,
        enabled: input.enabled,
        allowPrivateNetwork: input.allowPrivateNetwork,
        customHeaders,
      };
      const providers = existing
        ? current.providers.map((item) =>
            item.id === existing.id ? provider : item,
          )
        : [...current.providers, provider];
      const selectedProviderId = providers.some(
        (item) => item.id === current.selectedProviderId && item.enabled,
      )
        ? current.selectedProviderId
        : provider.enabled
          ? provider.id
          : (providers.find((item) => item.enabled)?.id ?? null);
      return { providers, selectedProviderId };
    });
  });

  ipcMain.handle(
    ipcChannels.deleteProvider,
    async (event, rawInput: unknown) => {
      assertTrustedSender(event, isTrustedSender);
      const { providerId } = providerIdInputSchema.parse(rawInput);
      return queueSettingsUpdate((current) => {
        const providers = current.providers.filter(
          (provider) => provider.id !== providerId,
        );
        if (providers.length === current.providers.length) {
          throw new Error('That provider configuration no longer exists.');
        }
        const selectedProviderId =
          current.selectedProviderId === providerId
            ? (providers.find((provider) => provider.enabled)?.id ?? null)
            : current.selectedProviderId;
        return { providers, selectedProviderId };
      });
    },
  );

  ipcMain.handle(
    ipcChannels.setProviderEnabled,
    async (event, rawInput: unknown) => {
      assertTrustedSender(event, isTrustedSender);
      const { providerId, enabled } =
        setProviderEnabledInputSchema.parse(rawInput);
      return queueSettingsUpdate((current) => {
        const provider = current.providers.find(
          (item) => item.id === providerId,
        );
        if (!provider) {
          throw new Error('That provider configuration no longer exists.');
        }
        const providers = current.providers.map((item) =>
          item.id === providerId ? { ...item, enabled } : item,
        );
        const selectedProviderId = providers.some(
          (item) => item.id === current.selectedProviderId && item.enabled,
        )
          ? current.selectedProviderId
          : (providers.find((item) => item.enabled)?.id ?? null);
        return { providers, selectedProviderId };
      });
    },
  );

  ipcMain.handle(
    ipcChannels.selectProvider,
    async (event, rawInput: unknown) => {
      assertTrustedSender(event, isTrustedSender);
      const { providerId } = selectProviderInputSchema.parse(rawInput);
      return queueSettingsUpdate((current) => {
        if (
          providerId &&
          !current.providers.some(
            (provider) => provider.id === providerId && provider.enabled,
          )
        ) {
          throw new Error('Select an enabled provider.');
        }
        return { ...current, selectedProviderId: providerId };
      });
    },
  );
}
