# bitcoind Mainnet full node for the Opus-Davi pool.
#
# Uses the official upstream binary release from bitcoincore.org. SHA256 is
# pinned. The image is intentionally minimal — bitcoind only, no wallet
# RPC tooling baked in, so an operator who wants `bitcoin-cli` should exec
# into the container.
#
# Volume `/data` is where the chain lives. Plan for ~750 GB on Mainnet today
# (2026), growing slowly. Initial block download takes 1–4 days depending
# on your CPU / disk. Pruning is an option (see bitcoin.conf), but our pool
# code calls `getblocktemplate` which is unaffected by pruning.

FROM debian:bookworm-slim

ARG BITCOIN_VERSION=27.0
ARG BITCOIN_SHA256=2aa6700d513ce1ef64fe9f4d2598ed14cd95f5fea58edd0b8f9d5e63a39b0c45

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates wget gnupg \
 && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    wget -q "https://bitcoincore.org/bin/bitcoin-core-${BITCOIN_VERSION}/bitcoin-${BITCOIN_VERSION}-x86_64-linux-gnu.tar.gz" -O /tmp/bitcoin.tar.gz; \
    echo "${BITCOIN_SHA256}  /tmp/bitcoin.tar.gz" | sha256sum -c -; \
    tar -xzf /tmp/bitcoin.tar.gz -C /tmp; \
    mv "/tmp/bitcoin-${BITCOIN_VERSION}/bin/bitcoind" /usr/local/bin/bitcoind; \
    mv "/tmp/bitcoin-${BITCOIN_VERSION}/bin/bitcoin-cli" /usr/local/bin/bitcoin-cli; \
    rm -rf /tmp/bitcoin.tar.gz /tmp/bitcoin-${BITCOIN_VERSION}; \
    chmod +x /usr/local/bin/bitcoind /usr/local/bin/bitcoin-cli

RUN useradd -r -m -u 1000 -d /home/bitcoin bitcoin \
 && mkdir -p /data \
 && chown -R bitcoin:bitcoin /data

COPY --chown=bitcoin:bitcoin bitcoin.conf /home/bitcoin/.bitcoin/bitcoin.conf
COPY --chown=bitcoin:bitcoin entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER bitcoin
WORKDIR /home/bitcoin
EXPOSE 8332 8333
VOLUME ["/data"]

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
