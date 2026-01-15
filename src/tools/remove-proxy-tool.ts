import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SessionManager } from '../core/session-manager.js';
import { Config } from '../config.js';
import { SniaffError, ErrorCode } from '../types/errors.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

export function registerRemoveProxyTool(
  server: McpServer,
  sessionManager: SessionManager,
  config: Config
): void {
  server.tool(
    'sniaff.remove_proxy',
    'Remove/clear HTTP proxy settings from the Android emulator. Restores direct internet connectivity.',
    {
      sessionId: z.string().min(1).describe('The session ID returned by sniaff.start'),
    },
    async (args) => {
      try {
        const session = sessionManager.getSession(args.sessionId);
        if (!session) {
          throw new SniaffError(
            ErrorCode.SESSION_NOT_FOUND,
            `Session '${args.sessionId}' not found`
          );
        }

        const deviceId = `emulator-${session.adbPort - 1}`;

        // Clear the global HTTP proxy by setting it to :0
        const command = `${config.adbPath} -s ${deviceId} shell settings put global http_proxy :0`;

        await execPromise(command, { timeout: 10000 });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  ok: true,
                  message: 'Proxy removed. Direct internet connectivity restored.',
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        const sniaffError =
          error instanceof SniaffError
            ? error
            : new SniaffError(
                ErrorCode.PROXY_CONFIG_FAILED,
                error instanceof Error ? error.message : String(error),
                { originalError: error instanceof Error ? error.stack : undefined }
              );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  ok: false,
                  error: sniaffError.toJSON(),
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
