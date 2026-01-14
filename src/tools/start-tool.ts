import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SessionManager } from '../core/session-manager.js';
import { SmaliusError, ErrorCode } from '../types/errors.js';

export function registerStartTool(server: McpServer, sessionManager: SessionManager): void {
  server.tool(
    'smalius.start',
    'Start a new Android emulator session with MITM proxy for traffic interception. Returns session info with ports and workspace path.',
    {
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
        .describe('Emulator boot timeout in milliseconds (default: 120000)'),
      headless: z
        .boolean()
        .default(false)
        .describe('Run emulator in headless mode (-no-window)'),
    },
    async (args) => {
      try {
        const result = await sessionManager.startSession({
          avdName: args.avdName,
          mitmPort: args.mitmPort,
          emulatorPort: args.emulatorPort,
          bootTimeout: args.bootTimeout,
          headless: args.headless,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  ...result,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        const smaliusError =
          error instanceof SmaliusError
            ? error
            : new SmaliusError(
                ErrorCode.INTERNAL_ERROR,
                error instanceof Error ? error.message : String(error),
                { originalError: error instanceof Error ? error.stack : undefined }
              );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: smaliusError.toJSON(),
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    }
  );
}
