import { z } from 'zod';

export const ipcChannels = {
  listProviders: 'providers:list',
  saveProvider: 'providers:save',
  deleteProvider: 'providers:delete',
  setProviderEnabled: 'providers:set-enabled',
  selectProvider: 'providers:select',
} as const;

export const providerKindSchema = z.enum([
  'google',
  'groq',
  'openrouter',
  'openai',
  'anthropic',
  'custom',
]);

export const providerSchema = z.object({
  id: z.string().uuid(),
  kind: providerKindSchema,
  name: z.string(),
  model: z.string(),
  baseUrl: z.string().optional(),
  enabled: z.boolean(),
  allowPrivateNetwork: z.boolean(),
  hasApiKey: z.boolean(),
  hasCustomHeaders: z.boolean(),
});

export const providerSettingsSchema = z.object({
  providers: z.array(providerSchema),
  selectedProviderId: z.string().uuid().nullable(),
});

const customHeadersSchema = z
  .record(z.string().max(128), z.string().max(2048))
  .refine((headers) => Object.keys(headers).length <= 32);

export const saveProviderInputSchema = z.object({
  id: z.string().uuid().optional(),
  kind: providerKindSchema,
  name: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(160),
  baseUrl: z.string().trim().max(2048).optional(),
  apiKey: z.string().max(4096).optional(),
  enabled: z.boolean(),
  allowPrivateNetwork: z.boolean(),
  customHeaders: customHeadersSchema.optional(),
});

export const providerIdInputSchema = z.object({
  providerId: z.string().uuid(),
});

export const setProviderEnabledInputSchema = providerIdInputSchema.extend({
  enabled: z.boolean(),
});

export const selectProviderInputSchema = z.object({
  providerId: z.string().uuid().nullable(),
});

export const storedProviderSchema = z.object({
  id: z.string().uuid(),
  kind: providerKindSchema,
  name: z.string(),
  model: z.string(),
  baseUrl: z.string().optional(),
  apiKey: z.string(),
  enabled: z.boolean(),
  allowPrivateNetwork: z.boolean(),
  customHeaders: customHeadersSchema,
});

export const storedProviderSettingsSchema = z.object({
  providers: z.array(storedProviderSchema),
  selectedProviderId: z.string().uuid().nullable(),
});

export type ProviderKind = z.infer<typeof providerKindSchema>;
export type Provider = z.infer<typeof providerSchema>;
export type ProviderSettings = z.infer<typeof providerSettingsSchema>;
export type SaveProviderInput = z.infer<typeof saveProviderInputSchema>;
export type StoredProvider = z.infer<typeof storedProviderSchema>;
