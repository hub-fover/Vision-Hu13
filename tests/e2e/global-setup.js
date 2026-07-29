import { closeStaticServer, startStaticServer } from "../../scripts/serve_web.mjs";

export default async function globalSetup() {
  const port = Number(process.env.E2E_PORT || 4173);
  const server = await startStaticServer({ host: "127.0.0.1", port });
  return async () => {
    await closeStaticServer(server);
  };
}
