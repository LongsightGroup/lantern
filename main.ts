import { app } from "./src/app.ts";

const DEFAULT_PORT = 8417;

function readPort(): number {
  const rawPort = Deno.env.get("PORT");

  if (rawPort === undefined || rawPort === "") {
    return DEFAULT_PORT;
  }

  const parsedPort = Number(rawPort);

  if (!Number.isInteger(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
    throw new Error(`Invalid PORT value: ${rawPort}`);
  }

  return parsedPort;
}

const port = readPort();

console.log(`Lantern listening on http://localhost:${port}`);

Deno.serve({ port }, app.fetch);
