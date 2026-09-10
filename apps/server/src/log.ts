import { Logger, type ILogObj } from "tslog";
import winston from "winston";
import LokiTransport from "winston-loki";
import { env } from "./env.js";
import type { JsonObject } from "./lib.js";

/** Null when unconfigured: a transport with `host: undefined` errors on every line. */
export const createLokiLogger = (opts: {
  lokiUrl?: string;
  appName: string;
  appEnv: string;
}): winston.Logger | null => {
  if (!opts.lokiUrl) {
    return null;
  }
  return winston.createLogger({
    transports: [
      new LokiTransport({
        host: opts.lokiUrl,
        labels: { app: opts.appName, env: opts.appEnv },
        json: true,
        batching: true,
        interval: 2,
        onConnectionError: (err) => {
          console.error("Failed to push log to Loki:", err);
        },
      }),
    ],
  });
};

const lokiLogger = createLokiLogger({
  lokiUrl: env.LOKI_URL,
  appName: env.APP_NAME,
  appEnv: env.APP_ENV,
});

export const logError = (message: string, error: unknown) => {
  const payload = {
    message,
    error: error instanceof Error ? (error.stack ?? error.message) : error,
  };
  if (lokiLogger) {
    lokiLogger.log({ level: "error", message: JSON.stringify(payload) });
  } else {
    console.error(message, payload.error);
  }
};

export const createLog = (context?: { requestHeaders?: JsonObject }) => {
  const log = new Logger<ILogObj>({
    name: env.APP_NAME,
  });

  // Skipped entirely when unconfigured, else winston warns on every line.
  if (lokiLogger) {
    log.attachTransport((logObj) => {
      const { _meta, ...rest } = logObj;

      lokiLogger.log({
        level: _meta.logLevelName.toLowerCase(),
        message: JSON.stringify({
          ...rest,
          requestHeaders: context?.requestHeaders,
        }),
      });
    });
  }

  return log;
};
