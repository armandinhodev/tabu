"use client";

import { io, type Socket } from "socket.io-client";

import type { ClientToServerEvents, ServerToClientEvents } from "@/infrastructure/socket/events";

export type GameClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameClientSocket | null = null;

/**
 * Cliente único por pestaña (§8.3): mismo origen, websocket con polling de
 * respaldo y backoff progresivo. Nunca se recrea por navegación de pantallas.
 */
export function getSocket(): GameClientSocket {
  if (socket === null) {
    socket = io({
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4_000,
      randomizationFactor: 0.3,
      autoConnect: true,
    });
  }

  return socket;
}
