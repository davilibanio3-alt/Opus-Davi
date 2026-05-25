/**
 * Browser wallet adapters for real Bitcoin Mainnet wallets.
 *
 * Supported via window-injected providers:
 *   - Xverse (window.XverseProviders.BitcoinProvider)
 *   - Unisat (window.unisat)
 *   - Leather / Hiro (window.LeatherProvider or window.btc)
 *
 * All operations are 100% client-side. The site never sees a private key.
 */

export type WalletKind = "xverse" | "unisat" | "leather";

export interface ConnectedWallet {
  kind: WalletKind;
  address: string;
  publicKey?: string;
  paymentAddress?: string; // some wallets distinguish payment vs ordinals
}

declare global {
  interface Window {
    unisat?: {
      requestAccounts(): Promise<string[]>;
      getPublicKey(): Promise<string>;
      getBalance(): Promise<{ confirmed: number; unconfirmed: number; total: number }>;
      signPsbt(psbtHex: string): Promise<string>;
      pushPsbt(psbtHex: string): Promise<string>;
      pushTx(opts: { rawtx: string }): Promise<string>;
    };
    XverseProviders?: {
      BitcoinProvider?: unknown;
    };
    LeatherProvider?: {
      request(method: string, params?: unknown): Promise<unknown>;
    };
    btc?: {
      request(method: string, params?: unknown): Promise<unknown>;
    };
  }
}

export async function detectWallets(): Promise<Record<WalletKind, boolean>> {
  if (typeof window === "undefined") {
    return { xverse: false, unisat: false, leather: false };
  }
  return {
    xverse: !!window.XverseProviders?.BitcoinProvider,
    unisat: !!window.unisat,
    leather: !!(window.LeatherProvider || window.btc),
  };
}

export async function connect(kind: WalletKind): Promise<ConnectedWallet> {
  if (typeof window === "undefined") throw new Error("no window");

  if (kind === "unisat") {
    if (!window.unisat) throw new Error("Unisat not installed");
    const accounts = await window.unisat.requestAccounts();
    if (!accounts || accounts.length === 0) throw new Error("Unisat: no account");
    const publicKey = await window.unisat.getPublicKey().catch(() => undefined);
    return { kind, address: accounts[0], publicKey };
  }

  if (kind === "leather") {
    const provider = window.LeatherProvider || window.btc;
    if (!provider) throw new Error("Leather not installed");
    const res = (await provider.request("getAddresses")) as {
      result?: { addresses?: Array<{ symbol: string; type: string; address: string; publicKey?: string }> };
    };
    const addrs = res?.result?.addresses ?? [];
    const btc = addrs.find((a) => a.symbol === "BTC" && a.type === "p2wpkh") ?? addrs.find((a) => a.symbol === "BTC");
    if (!btc) throw new Error("Leather: no BTC address");
    return { kind, address: btc.address, publicKey: btc.publicKey };
  }

  if (kind === "xverse") {
    const provider = window.XverseProviders?.BitcoinProvider as
      | { request(method: string, params?: unknown): Promise<unknown> }
      | undefined;
    if (!provider) throw new Error("Xverse not installed");
    const res = (await provider.request("getAccounts", {
      purposes: ["payment", "ordinals"],
      message: "Connect to Opus Davi · BTC Platform",
    })) as {
      result?: Array<{ address: string; publicKey: string; purpose: "payment" | "ordinals" }>;
    };
    const accounts = res?.result ?? [];
    if (accounts.length === 0) throw new Error("Xverse: rejected");
    const payment = accounts.find((a) => a.purpose === "payment") ?? accounts[0];
    return {
      kind,
      address: payment.address,
      publicKey: payment.publicKey,
      paymentAddress: payment.address,
    };
  }

  throw new Error(`unknown wallet kind: ${kind}`);
}

/** Sign+broadcast via the wallet itself (preferred — keeps keys in-wallet). */
export async function signAndBroadcast(
  wallet: ConnectedWallet,
  psbtBase64: string,
): Promise<string> {
  if (wallet.kind === "unisat" && window.unisat) {
    // Unisat takes hex
    const psbtHex = Buffer.from(psbtBase64, "base64").toString("hex");
    const signedHex = await window.unisat.signPsbt(psbtHex);
    return await window.unisat.pushPsbt(signedHex);
  }
  throw new Error(
    `signAndBroadcast not implemented for ${wallet.kind} — sign the PSBT in your wallet and use Broadcast tab.`,
  );
}
