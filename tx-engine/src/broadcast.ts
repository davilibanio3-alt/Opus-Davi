/**
 * Broadcast a signed Bitcoin Mainnet transaction to a public relay.
 * Uses mempool.space's /tx endpoint (POST raw hex). Real propagation —
 * the tx hits the p2p network as soon as mempool.space accepts it.
 */
export async function broadcastTx(
  rawHex: string,
  baseUrl = "https://mempool.space/api",
): Promise<string> {
  const r = await fetch(`${baseUrl}/tx`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: rawHex,
  });
  const body = (await r.text()).trim();
  if (!r.ok) {
    throw new Error(`broadcast failed (${r.status}): ${body}`);
  }
  return body; // txid
}
