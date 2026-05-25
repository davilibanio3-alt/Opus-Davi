import { FastifyInstance } from "fastify";
import { WebSocket } from "ws";
import { config } from "../config";

/**
 * Realtime fanout: opens a single upstream connection to mempool.space WS
 * and broadcasts the live messages to all subscribed clients of our own WS.
 *
 * Clients connect to /ws and immediately receive `blocks`, `mempool-blocks`,
 * `transactions`, `fees`, etc. — the same payload mempool.space publishes,
 * directly from Bitcoin Mainnet.
 */
export async function wsRoutes(app: FastifyInstance) {
  const upstreamUrl = config.mempoolApi.replace(/^http/, "ws").replace(/\/api$/, "/api/v1/ws");
  const clients = new Set<WebSocket>();
  let reconnectTimer: NodeJS.Timeout | null = null;

  function connectUpstream() {
    const ws = new WebSocket(upstreamUrl);
    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          action: "want",
          data: ["blocks", "stats", "mempool-blocks", "live-2h-chart"],
        }),
      );
    });
    ws.on("message", (data) => {
      const msg = data.toString();
      for (const c of clients) {
        if (c.readyState === WebSocket.OPEN) c.send(msg);
      }
    });
    ws.on("close", () => {
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connectUpstream();
        }, 3000);
      }
    });
    ws.on("error", () => ws.close());
  }

  connectUpstream();

  app.get("/ws", { websocket: true }, (socket /* WebSocket */) => {
    clients.add(socket as unknown as WebSocket);
    socket.on("close", () => clients.delete(socket as unknown as WebSocket));
    socket.on("error", () => clients.delete(socket as unknown as WebSocket));
    socket.send(JSON.stringify({ type: "hello", network: "mainnet" }));
  });
}
