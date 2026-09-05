import { JsonRpcProvider, Wallet, formatEther } from "ethers";
import type { AppConfig, ChainInfo } from "./config.js";
import { CHAIN_BY_ID } from "./config.js";

export interface ConnectedWallet {
  provider: JsonRpcProvider;
  wallet: Wallet;
  address: string;
}

export function connectWallet(config: AppConfig): ConnectedWallet {
  const provider = new JsonRpcProvider(config.rpcUrl);
  const wallet = new Wallet(config.privateKey, provider);
  return { provider, wallet, address: wallet.address };
}

export interface WalletSnapshot {
  address: string;
  balanceWei: bigint;
  balanceEth: string;
  rpcChain: ChainInfo | undefined;
  rpcChainId: bigint;
}

export async function getWalletSnapshot(connected: ConnectedWallet): Promise<WalletSnapshot> {
  const [balanceWei, network] = await Promise.all([
    connected.provider.getBalance(connected.address),
    connected.provider.getNetwork(),
  ]);
  return {
    address: connected.address,
    balanceWei,
    balanceEth: formatEther(balanceWei),
    rpcChain: CHAIN_BY_ID[network.chainId.toString()],
    rpcChainId: network.chainId,
  };
}

export function explorerAddressUrl(chain: ChainInfo, address: string): string {
  return `${chain.explorer}/address/${address}`;
}

export function explorerTxUrl(chain: ChainInfo, hash: string): string {
  return `${chain.explorer}/tx/${hash}`;
}
