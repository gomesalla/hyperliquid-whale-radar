import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import Redis from "ioredis";
import { State } from "./state.js";
import { feedRoutes } from "./routes/feed.js";
import { walletRoutes } from "./routes/wallet.js";
import { registerWsGateway } from "./ws-gateway.js";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const redis = new Redis(redisUrl);
const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(websocket);

const state = new State(redis);
feedRoutes(app, state);
walletRoutes(app);
registerWsGateway(app, redisUrl);

const port = Number(process.env.PORT ?? 4000);
app
  .listen({ port, host: "0.0.0.0" })
  .then(() => app.log.info(`api listening on ${port}`))
  .catch((e) => {
    app.log.error(e);
    process.exit(1);
  });
