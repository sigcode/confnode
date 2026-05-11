import { createConnection } from "net";

export interface AgentResponse {
  ok: boolean;
  output?: string;
  error?: string;
}

export async function agentCall(
  socketPath: string,
  cmd: string,
  params: Record<string, string> = {}
): Promise<AgentResponse> {
  return new Promise((resolve, reject) => {
    const client = createConnection(socketPath);
    let data = "";

    client.on("connect", () => {
      client.write(JSON.stringify({ cmd, params }) + "\n");
    });

    client.on("data", (chunk) => {
      data += chunk.toString();
    });

    client.on("end", () => {
      try {
        resolve(JSON.parse(data) as AgentResponse);
      } catch {
        reject(new Error("invalid JSON from agent: " + data));
      }
    });

    client.on("error", (err) => {
      reject(new Error(`agent socket error: ${err.message}`));
    });

    // 30s timeout for long ops (certbot, git clone)
    client.setTimeout(30_000, () => {
      client.destroy();
      reject(new Error("agent timeout"));
    });
  });
}
