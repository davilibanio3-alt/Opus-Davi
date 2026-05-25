import * as bitcoin from "bitcoinjs-lib";

export type NetworkName = "mainnet" | "testnet" | "signet" | "regtest";

export const networks: Record<NetworkName, bitcoin.Network> = {
  mainnet: bitcoin.networks.bitcoin,
  testnet: bitcoin.networks.testnet,
  signet: bitcoin.networks.testnet, // signet shares the same magic for parsing purposes
  regtest: bitcoin.networks.regtest,
};

export function getNetwork(name: NetworkName = "mainnet"): bitcoin.Network {
  return networks[name];
}
