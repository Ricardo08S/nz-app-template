import "./prerun.js";
import { ZenStackMiddleware } from "@zenstackhq/server/express";
import { RPCApiHandler } from "@zenstackhq/server/api";
import type { Request, Response } from "express";
import { verifyAccessToken } from "./common.js";
import { createContext, getClient } from "./context.js";
import { env } from "./env.js";
import { getReadiness, gitSha, isReady } from "./health.js";
import { cors, express, trpcExpress } from "./lib.js";
import { logError } from "./log.js";
import { appRouter } from "./router.ts";
import { schema } from "./zenstack/schema";

(async () => {
  // express implementation
  const app = express();

  app.use(cors({}));
  app.use(express.json());

  app.use((req, _res, next) => {
    // request logger
    const body = (() => {
      if (req.body) {
        return req.body;
      }
      if (Object.keys(req.query).length > 0) {
        return req.query;
      }
      return "";
    })();
    console.log("<- ", req.method, req.path, JSON.parse(JSON.stringify(body)));

    next();
  });

  app.use(
    "/trpc",
    trpcExpress.createExpressMiddleware({
      router: appRouter,
      createContext,
      onError: ({ error }) => {
        console.error(error.code, error.name, error.message);
        console.error(error.stack);
        logError("tRPC Error", error);
      },
    }),
  );

  app.use(
    "/api/model",
    (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (authHeader) {
        const user = verifyAccessToken(authHeader);
        if (!user) {
          return res.status(401).json({ error: "Token expired or invalid" });
        }
      }
      next();
    },
    ZenStackMiddleware({
      apiHandler: new RPCApiHandler({
        schema,
        log(level, message, error) {
          if (level === "error") {
            console.error(error);
            logError(message, error);
          }
        },
      }),
      // getSessionUser extracts the current session user from the request, its
      // implementation depends on your auth solution
      getClient,
      sendResponse: true,
    }),
  );
  app.get("/", (_req, res) => {
    res.send("hello");
  });
  app.get("/ping", (_req, res) => {
    res.send("pong");
  });

  // live: process is up (Docker healthcheck). ready: can serve, polled by
  // blue-green before switching. version: which build answers, checked after.
  const liveHandler = (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  };

  app.get("/health/live", liveHandler);
  // Kept for backwards compatibility with the old single endpoint.
  app.get("/health", liveHandler);

  app.get("/health/version", (_req, res) => {
    res.json({
      sha: gitSha(),
      appName: env.APP_NAME,
      appEnv: env.APP_ENV,
    });
  });

  app.get("/health/ready", async (_req, res) => {
    const checks = await getReadiness();
    const ready = isReady(checks);
    res.status(ready ? 200 : 503).json({
      status: ready ? "ready" : "not_ready",
      checks,
    });
  });

  app.use((req, res, next) => {
    res.status(404).send({
      error: {
        message: "Not found.",
      },
    });
  });

  // Error handler middleware - must be defined after all routes. Express
  // recognizes this as an error handler by its 4-parameter arity.
  app.use(
    (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error("Uncaught error:", err);
      logError("Express Error", err);

      const isErrorLike = (e: unknown): e is Record<string, unknown> =>
        typeof e === "object" && e !== null;
      const statusCode = (isErrorLike(err) && (err.statusCode ?? err.status)) || 500;
      const message =
        (isErrorLike(err) && typeof err.message === "string" && err.message) ||
        "Internal server error";

      res.status(Number(statusCode)).json({
        error: {
          message,
          ...(env.VERBOSE && {
            stack: isErrorLike(err) ? err.stack : undefined,
            details: err,
          }),
        },
      });
    },
  );

  app.listen(env.PORT, () => {
    console.log(`Listening on port ${env.PORT}...`);
  });
})();
