/**
 * All blockchain interactions — MetaMask + Polygon Amoy + GEPCC contract.
 * Components never use ethers directly; they call these functions.
 */
import { ethers } from "ethers";
import { CONFIG } from "./config";

// ── ABI ───────────────────────────────────────────────────────────────────────

const CONTRACT_ABI = [
  "function mintToken(address, string, string, string, string, string, uint256) public",
  "function burnToken(uint256 tokenId) public",
  "function getTokenDetails(uint256 tokenId) public view returns (tuple(string farmerId, string gpsLat, string gpsLon, string ndviScore, string co2Tonnes, bool burned))",
  "function tokenCounter() public view returns (uint256)",
  "event TokenMinted(uint256 indexed tokenId, string farmerId, string co2Tonnes, string ndviScore, string gpsLat, string gpsLon)",
  "event TokenBurned(uint256 indexed tokenId, string farmerId, string co2Tonnes)",
];

// ── Provider / Signer helpers ─────────────────────────────────────────────────

export function getProvider(): ethers.Provider {
  if (typeof window !== "undefined" && window.ethereum) {
    return new ethers.BrowserProvider(window.ethereum);
  }
  console.log("[blockchain] getProvider: no MetaMask, using public RPC");
  return new ethers.JsonRpcProvider(CONFIG.blockchain.rpcUrl);
}

export async function connectWallet(): Promise<{ address: string; chainId: number }> {
  console.log("[blockchain] connectWallet: starting...");
  try {
    if (!window.ethereum) {
      throw new Error("MetaMask is not installed. Please install MetaMask to continue.");
    }

    const provider = new ethers.BrowserProvider(window.ethereum);

    console.log("[blockchain] connectWallet: requesting accounts...");
    await provider.send("eth_requestAccounts", []);

    const network = await provider.getNetwork();
    console.log("[blockchain] connectWallet: chainId =", network.chainId.toString());

    if (network.chainId !== BigInt(CONFIG.blockchain.chainId)) {
      console.log("[blockchain] connectWallet: switching to Amoy...");
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: CONFIG.blockchain.chainIdHex }],
        });
        console.log("[blockchain] connectWallet: switched to Amoy");
      } catch (switchErr: any) {
        if (switchErr.code === 4902) {
          console.log("[blockchain] connectWallet: adding Amoy network...");
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId:           CONFIG.blockchain.chainIdHex,
              chainName:         CONFIG.blockchain.chainName,
              nativeCurrency:    CONFIG.blockchain.nativeCurrency,
              rpcUrls:           [CONFIG.blockchain.rpcUrl],
              blockExplorerUrls: [CONFIG.blockchain.explorerUrl],
            }],
          });
          console.log("[blockchain] connectWallet: Amoy added");
        } else {
          throw switchErr;
        }
      }
    }

    const signer  = await provider.getSigner();
    const address = await signer.getAddress();
    console.log("[blockchain] connectWallet: address =", address);

    return { address, chainId: CONFIG.blockchain.chainId };
  } catch (e: any) {
    console.error("[blockchain] connectWallet: error =", e?.message);
    throw e;
  }
}

export async function getSigner(): Promise<ethers.Signer> {
  await connectWallet();
  const provider = new ethers.BrowserProvider(window.ethereum);
  return provider.getSigner();
}

export function getContract(withSigner = false): ethers.Contract | Promise<ethers.Contract> {
  if (withSigner) {
    return getSigner().then(
      (signer) => new ethers.Contract(CONFIG.blockchain.contractAddress, CONTRACT_ABI, signer),
    );
  }
  return new ethers.Contract(CONFIG.blockchain.contractAddress, CONTRACT_ABI, getProvider());
}

export async function getWalletAddress(): Promise<string | null> {
  try {
    if (!window.ethereum) return null;
    const provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await provider.send("eth_accounts", []);
    return accounts[0] ?? null;
  } catch {
    return null;
  }
}

// ── Mint ──────────────────────────────────────────────────────────────────────

export async function mintTokens(
  farmerId: string,
  gpsLat: string,
  gpsLon: string,
  ndviScore: string,
  co2Tonnes: string,
  farmerAddress: string,
  amount: number,
): Promise<{ txHash: string; tokenId: string; receipt: ethers.TransactionReceipt }> {
  console.log("[blockchain] mintTokens: farmer =", farmerId);
  try {
    const contract = await getContract(true) as ethers.Contract;

    console.log("[blockchain] mintTokens: sending tx...");
    const tx = await contract.mintToken(
      farmerAddress,
      farmerId,
      gpsLat,
      gpsLon,
      ndviScore,
      co2Tonnes,
      BigInt(amount),
      {
        maxFeePerGas:         BigInt("50000000000"), // 50 gwei
        maxPriorityFeePerGas: BigInt("30000000000"), // 30 gwei — above Amoy minimum 25 gwei
      }
    );
    console.log("[blockchain] mintTokens: hash =", tx.hash);

    const receipt = await tx.wait();
    console.log("[blockchain] mintTokens: confirmed block =", receipt.blockNumber);

    // Try tokenCounter — gracefully fallback if contract doesn't support it
    let tokenId = "0";
    try {
      const counter = await contract.tokenCounter();
      tokenId = (counter - 1n).toString();
    } catch {
      console.warn("[blockchain] mintTokens: tokenCounter() failed — using block number as tokenId");
      tokenId = receipt.blockNumber?.toString() ?? "0";
    }
    console.log("[blockchain] mintTokens: tokenId =", tokenId);

    return { txHash: tx.hash, tokenId, receipt };
  } catch (e: any) {
    console.error("[blockchain] mintTokens: error =", e?.message);
    throw e;
  }
}

// ── Burn ──────────────────────────────────────────────────────────────────────

export async function burnTokens(
  tokenId: string,
): Promise<{ txHash: string; receipt: ethers.TransactionReceipt }> {
  console.log("[blockchain] burnTokens: tokenId =", tokenId);
  try {
    const contract = await getContract(true) as ethers.Contract;

    console.log("[blockchain] burnTokens: sending tx...");
    const tx = await contract.burnToken(BigInt(tokenId));
    console.log("[blockchain] burnTokens: hash =", tx.hash);

    const receipt = await tx.wait();
    console.log("[blockchain] burnTokens: confirmed block =", receipt.blockNumber);

    return { txHash: tx.hash, receipt };
  } catch (e: any) {
    console.error("[blockchain] burnTokens: error =", e?.message);
    throw e;
  }
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getTokenDetails(tokenId: string): Promise<{
  farmerId: string;
  gpsLat: string;
  gpsLon: string;
  ndviScore: string;
  co2Tonnes: string;
  burned: boolean;
}> {
  console.log("[blockchain] getTokenDetails: tokenId =", tokenId);
  try {
    const contract = getContract(false) as ethers.Contract;
    const result   = await contract.getTokenDetails(BigInt(tokenId));
    const details  = {
      farmerId:  result.farmerId,
      gpsLat:    result.gpsLat,
      gpsLon:    result.gpsLon,
      ndviScore: result.ndviScore,
      co2Tonnes: result.co2Tonnes,
      burned:    result.burned,
    };
    console.log("[blockchain] getTokenDetails: result =", details);
    return details;
  } catch (e: any) {
    console.error("[blockchain] getTokenDetails: error =", e?.message);
    throw e;
  }
}

// ── Legacy aliases ────────────────────────────────────────────────────────────
export const mintToken = mintTokens;
export const burnToken = burnTokens;
