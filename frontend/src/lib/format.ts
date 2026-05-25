export function fmtSats(sats: number): string {
  if (!Number.isFinite(sats)) return "—";
  if (Math.abs(sats) >= 1e8) return `${(sats / 1e8).toFixed(8).replace(/0+$/, "").replace(/\.$/, "")} BTC`;
  return `${sats.toLocaleString("en-US")} sats`;
}

export function fmtBTC(sats: number): string {
  return `${(sats / 1e8).toFixed(8)} BTC`;
}

export function fmtUSD(usd: number): string {
  return usd.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function fmtNumber(n: number, digits = 2): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

const SI = ["", "k", "M", "G", "T", "P", "E", "Z", "Y"];
export function fmtHashrate(hPerSec: number): string {
  if (!Number.isFinite(hPerSec) || hPerSec <= 0) return "0 H/s";
  let n = hPerSec;
  let i = 0;
  while (n >= 1000 && i < SI.length - 1) {
    n /= 1000;
    i++;
  }
  return `${n.toFixed(2)} ${SI[i]}H/s`;
}

export function fmtTimeAgo(unixSec: number): string {
  const diff = Math.max(0, Date.now() / 1000 - unixSec);
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function trunc(s: string, head = 8, tail = 8): string {
  if (!s) return "";
  if (s.length <= head + tail + 3) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}
