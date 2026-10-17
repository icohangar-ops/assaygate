import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const deployer = process.env.DEPLOYER_PRIVATE_KEY?.trim();
const portaldotRpc =
  process.env.PORTALDOT_RPC_URL?.trim() || "https://test-evm-rpc-v3.portaldot.dev";
const portaldotChainId = Number(process.env.PORTALDOT_CHAIN_ID || "420420777");

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // The certificate metadata builder is too wide for the legacy codegen stack.
      viaIR: true,
    },
  },
  networks: {
    localhost: {
      url: process.env.LOCAL_RPC_URL?.trim() || "http://127.0.0.1:18545",
      chainId: 31337,
    },
    portaldot: {
      url: portaldotRpc,
      chainId: portaldotChainId,
      accounts: deployer ? [deployer] : [],
      timeout: 120_000,
    },
  },
  mocha: {
    timeout: 60_000,
  },
};

export default config;
