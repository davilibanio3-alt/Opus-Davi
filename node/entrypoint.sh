#!/bin/sh
set -e

CONFIG=/home/bitcoin/.bitcoin/bitcoin.conf

if [ -z "${BITCOIND_RPC_USER}" ] || [ -z "${BITCOIND_RPC_PASSWORD}" ]; then
  echo "ERROR: set BITCOIND_RPC_USER and BITCOIND_RPC_PASSWORD" >&2
  exit 1
fi

# Render an rpcauth= line — Bitcoin Core's recommended way of authenticating
# without storing plaintext passwords in the config. The format is:
#   rpcauth=<user>:<salt>$<hmac_sha256_hex(password, salt)>
SALT=$(head -c 16 /dev/urandom | xxd -p)
HMAC=$(printf '%s' "${BITCOIND_RPC_PASSWORD}" \
  | openssl dgst -sha256 -hmac "${SALT}" \
  | sed 's/^.* //')

# Strip any prior rpcauth line and append the fresh one.
sed -i '/^rpcauth=/d' "${CONFIG}"
echo "rpcauth=${BITCOIND_RPC_USER}:${SALT}\$${HMAC}" >> "${CONFIG}"

exec bitcoind -datadir=/data -conf="${CONFIG}" "$@"
