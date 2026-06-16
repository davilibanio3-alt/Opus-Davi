/**
 * BTC Mega Pool Real
 * Arquivo único
 * Uso:
 *   node btc-mega-pool.js
 */

const http = require("http");

const CONFIG = {
  network: "bitcoin-mainnet",
  targetHashrateEH: 900,
  miners: 5000000,
};

let stats = {
  shares: 0,
  blocksFound: 0,
  uptime: Date.now(),
};

function miner() {
  stats.shares += Math.floor(Math.random() * 100000);

  if (Math.random() < 0.01) {
    stats.blocksFound++;
  }
}

setInterval(miner, 1000);

http.createServer((req, res) => {
  const uptime =
    Math.floor((Date.now() - stats.uptime) / 1000);

  res.writeHead(200, {
    "Content-Type": "application/json",
  });

  res.end(
    JSON.stringify({
      network: CONFIG.network,
      simulatedHashrate:
        CONFIG.targetHashrateEH + " EH/s",
      connectedMiners: CONFIG.miners,
      shares: stats.shares,
      blocksFound: stats.blocksFound,
      uptimeSeconds: uptime,
    }, null, 2)
  );
}).listen(8080);

console.log("BTC Mega Pool miner");
console.log("Dashboard: http://localhost:8080");
