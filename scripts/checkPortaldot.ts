import { ethers, network } from "hardhat";

async function main() {
  const chain = await ethers.provider.getNetwork();
  const block = await ethers.provider.getBlockNumber();
  const expected = BigInt(process.env.PORTALDOT_CHAIN_ID || "420420777");
  console.log("network", network.name);
  console.log("rpc", process.env.PORTALDOT_RPC_URL || "https://test-evm-rpc-v3.portaldot.dev");
  console.log("chainId", chain.chainId.toString());
  console.log("block", block);
  if (chain.chainId !== expected) {
    throw new Error(`chain id ${chain.chainId} != expected ${expected}`);
  }
  console.log("Portaldot RPC responded.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
