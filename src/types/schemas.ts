import { z } from 'zod';

export const StartInputSchema = z.object({
  avdName: z
    .string()
    .min(1)
    .describe('Name of the Android Virtual Device (AVD) to start'),
  mitmPort: z
    .number()
    .int()
    .min(1024)
    .max(65535)
    .optional()
    .describe('MITM proxy port (auto-selected if not provided or busy)'),
  emulatorPort: z
    .number()
    .int()
    .min(5554)
    .max(5682)
    .optional()
    .describe('Emulator console port (auto-selected if not provided)'),
  bootTimeout: z
    .number()
    .int()
    .min(30000)
    .max(600000)
    .default(120000)
    .describe('Emulator boot timeout in milliseconds'),
  headless: z
    .boolean()
    .default(false)
    .describe('Run emulator in headless mode (-no-window)'),
});

export type StartInput = z.infer<typeof StartInputSchema>;
