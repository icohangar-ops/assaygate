import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { ROLE_INDEX } from "./roles";
import { agentStep } from "./agentCore";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!process.env.AMOUNT && !process.env.TRANCHE_AMOUNT) {
    console.error("Set AMOUNT in oUSD base units (6 decimals). Example: AMOUNT=15000000000");
    process.exitCode = 1;
    return;
  }

  const escrowId = BigInt(process.env.ESCROW_ID || "1");
  const amount = BigInt(process.env.AMOUNT || process.env.TRANCHE_AMOUNT || "0");
  const watch = process.env.WATCH === "1";
  const maxReleases = Number(process.env.MAX_RELEASES || "1");
  const pollMs = Number(process.env.POLL_MS || "4000");

  const file = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing ${file}. Run npm run deploy:local against \`npm run chain\` first.`);
  }
  const deployment = JSON.parse(fs.readFileSync(file, "utf8")) as { escrow: string };
  const escrow = await ethers.getContractAt("AssayEscrow", deployment.escrow);
  const signers = await ethers.getSigners();
  const agent = signers[ROLE_INDEX.agent] ?? signers[0];

  console.log(`[assaygate-agent] network=${network.name} escrowContract=${deployment.escrow} watch=${watch}`);

  let releases = 0;
  for (;;) {
    const step = await agentStep(escrow, agent, escrowId, amount);
    if (step.sent) releases += 1;
    if (!watch) break;
    if (step.decision.action !== "RELEASE") break;
    if (releases >= maxReleases) {
      console.log(`[assaygate-agent] stopped after ${releases} release(s) (MAX_RELEASES)`);
      break;
    }
    await sleep(pollMs);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
