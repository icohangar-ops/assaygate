import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import shipment from "../demo/shipment.json";
import { ROLE_INDEX } from "./roles";

async function main() {
  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error(
      "No deployer key. For Portaldot, set DEPLOYER_PRIVATE_KEY in .env. The local demo uses `npm run chain` and does not need a key.",
    );
  }

  const deployer = signers[0];
  const local = network.name === "localhost" || network.name === "hardhat";
  const attester = local ? signers[ROLE_INDEX.attester] : deployer;
  const buyer = local ? signers[ROLE_INDEX.buyer] : deployer;
  const seller = local ? signers[ROLE_INDEX.seller] : deployer;
  const agent = local ? signers[ROLE_INDEX.agent] : deployer;
  const arbiter = local ? signers[ROLE_INDEX.arbiter] : deployer;

  const pick = (envName: string, fallback: string) => process.env[envName]?.trim() || fallback;

  const attesterAddress = pick("ATTESTER_ADDRESS", attester.address);
  const cfoAddress = pick("CFO_ADDRESS", deployer.address);
  const arbiterAddress = pick("ARBITER_ADDRESS", arbiter.address);
  const agentAddress = pick("AGENT_ADDRESS", agent.address);
  const buyerAddress = pick("BUYER_ADDRESS", buyer.address);
  const sellerAddress = pick("SELLER_ADDRESS", seller.address);

  const certificate = await ethers.deployContract("AssayCertificate", [deployer.address]);
  await certificate.waitForDeployment();
  const paymentToken = await ethers.deployContract("MockUSD", [deployer.address]);
  await paymentToken.waitForDeployment();
  const escrow = await ethers.deployContract("AssayEscrow", [
    deployer.address,
    await certificate.getAddress(),
  ]);
  await escrow.waitForDeployment();

  const certAddress = await certificate.getAddress();
  const tokenAddress = await paymentToken.getAddress();
  const escrowAddress = await escrow.getAddress();

  if (attesterAddress.toLowerCase() !== deployer.address.toLowerCase()) {
    await (await certificate.grantRole(await certificate.ATTESTER_ROLE(), attesterAddress)).wait();
  }
  if (cfoAddress.toLowerCase() !== deployer.address.toLowerCase()) {
    await (await escrow.grantRole(await escrow.CFO_ROLE(), cfoAddress)).wait();
  }
  if (arbiterAddress.toLowerCase() !== deployer.address.toLowerCase()) {
    await (await escrow.grantRole(await escrow.ARBITER_ROLE(), arbiterAddress)).wait();
  }
  await (await escrow.setAgent(agentAddress, true)).wait();

  const fundUnits = ethers.parseUnits(shipment.fundOusd, 6);
  const mintTo = local ? buyerAddress : deployer.address;
  const mintAmount = local ? fundUnits * 5n : fundUnits;
  await (await paymentToken.mint(mintTo, mintAmount)).wait();

  const deployTx = escrow.deploymentTransaction()?.hash ?? "";
  const chain = await ethers.provider.getNetwork();
  const record = {
    network: network.name,
    chainId: chain.chainId.toString(),
    certificate: certAddress,
    escrow: escrowAddress,
    paymentToken: tokenAddress,
    deployTx,
    roles: {
      admin: deployer.address,
      cfo: cfoAddress,
      attester: attesterAddress,
      arbiter: arbiterAddress,
      agent: agentAddress,
      buyer: buyerAddress,
      seller: sellerAddress,
    },
  };

  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${network.name}.json`);
  fs.writeFileSync(file, JSON.stringify(record, null, 2));

  console.log("AssayCertificate", certAddress);
  console.log("MockUSD", tokenAddress);
  console.log("AssayEscrow", escrowAddress);
  console.log("deployTx", deployTx || "(none)");
  console.log("wrote", file);
  console.log("chainId", record.chainId);

  if (network.name === "portaldot") {
    console.log("");
    console.log("Portaldot funding reminder:");
    console.log("  The H160 from this key is not an Ethereum address. In the node console,");
    console.log("  Developer → Runtime calls → reviveApi → accountId, map the deployer H160,");
    console.log("  then send tPOTv3 to that native address (it starts with 5) before this deploy.");
    console.log("  EVM RPC:", process.env.PORTALDOT_RPC_URL || "https://test-evm-rpc-v3.portaldot.dev");
    console.log("  Chain ID:", process.env.PORTALDOT_CHAIN_ID || "420420777");
    console.log("  Paste the AssayEscrow address and deployTx into the DoraHacks checklist.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
