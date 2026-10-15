import { Logger, type ILogObj } from "tslog";
import winston from "winston";
import LokiTransport from "winston-loki";
import { env } from "./env.js";
import type { JsonObject } from "./lib.js";

const winstonLogger = winston.createLogger({
  transports: [
    new LokiTransport({
      host: env.LOKI_URL,
      labels: { app: env.APP_NAME, env: env.APP_ENV },
      json: true,
      batching: true,
      interval: 2,
      onConnectionError: (err) => {
        console.error("Failed to push log to Loki:", err);
      },
    }),
  ],
});

export const createLog = (context?: { requestHeaders?: JsonObject }) => {
  const log = new Logger<ILogObj>({
    name: env.APP_NAME,
  });

  log.attachTransport((logObj) => {
    const { _meta, ...rest } = logObj;

    winstonLogger.log({
      level: _meta.logLevelName.toLowerCase(),
      message: JSON.stringify({
        ...rest,
        _requestHeaders: context?.requestHeaders,
      }),
    });
  });

  return log;
};
