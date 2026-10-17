import { ethers } from "hardhat";
import shipment from "../demo/shipment.json";
import { agentStep, revertName } from "./agentCore";

function say(line: string) {
  console.log(`[demo] ${line}`);
}

async function main() {
  const [admin, attester, buyer, seller, agent, arbiter] = await ethers.getSigners();
  const cap = ethers.parseUnits(shipment.trancheCapOusd, 6);
  const fund = ethers.parseUnits(shipment.fundOusd, 6);
  const releaseAmount = ethers.parseUnits(shipment.releaseOusd, 6);
  const overCap = ethers.parseUnits(shipment.overCapOusd, 6);

  say("deploy AssayCertificate, MockUSD (oUSD), AssayEscrow");
  const certificate = await ethers.deployContract("AssayCertificate", [admin.address]);
  await certificate.waitForDeployment();
  const paymentToken = await ethers.deployContract("MockUSD", [admin.address]);
  await paymentToken.waitForDeployment();
  const escrow = await ethers.deployContract("AssayEscrow", [admin.address, await certificate.getAddress()]);
  await escrow.waitForDeployment();

  await (await certificate.grantRole(await certificate.ATTESTER_ROLE(), attester.address)).wait();
  await (await escrow.grantRole(await escrow.ARBITER_ROLE(), arbiter.address)).wait();
  await (await escrow.setAgent(agent.address, true)).wait();
  await (await paymentToken.mint(buyer.address, fund)).wait();

  say(`mint certificate ${shipment.shipmentId} grade=${shipment.gradeBps}bps weight=${shipment.weightKg}kg origin=${shipment.origin}`);
  const mintTx = await certificate.connect(attester).mint(
    seller.address,
    shipment.shipmentId,
    shipment.mine,
    shipment.mineral,
    shipment.origin,
    shipment.gradeBps,
    shipment.weightKg,
    shipment.assayUri,
  );
  const mintReceipt = await mintTx.wait();
  const assay = await certificate.getAssay(1n);
  if (assay.origin !== shipment.origin || assay.gradeBps !== BigInt(shipment.gradeBps)) {
    throw new Error("certificate metadata did not match the shipment");
  }
  say(`certificate #1 owner=${seller.address} mintTx=${mintReceipt?.hash}`);

  say(`CFO opens escrow cap=${shipment.trancheCapOusd} oUSD seller=${shipment.sellerName}`);
  const openTx = await escrow.openEscrow(1n, buyer.address, seller.address, await paymentToken.getAddress(), cap);
  const openReceipt = await openTx.wait();
  say(`escrow #1 openTx=${openReceipt?.hash}`);

  say(`buyer ${shipment.buyerName} funds ${shipment.fundOusd} oUSD`);
  await (await paymentToken.connect(buyer).approve(await escrow.getAddress(), fund)).wait();
  const fundTx = await escrow.connect(buyer).fund(1n, fund);
  const fundReceipt = await fundTx.wait();
  say(`funded tx=${fundReceipt?.hash}`);

  say("agent releases a tranche under the cap");
  const released = await agentStep(escrow, agent, 1n, releaseAmount);
  if (!released.sent) throw new Error(`expected release, got ${released.decision.reason}`);
  const sellerPaid = await paymentToken.balanceOf(seller.address);
  if (sellerPaid !== releaseAmount) throw new Error(`seller balance ${sellerPaid} != ${releaseAmount}`);

  say("agent considers a draw above the cap and must refuse");
  const refused = await agentStep(escrow, agent, 1n, overCap);
  if (refused.sent || refused.decision.reason !== "exceeds_tranche_cap") {
    throw new Error(`expected cap refusal, got ${refused.decision.reason}`);
  }
  try {
    await escrow.connect(agent).release(1n, overCap);
    throw new Error("over-cap release was mined");
  } catch (error) {
    if (error instanceof Error && error.message === "over-cap release was mined") throw error;
    say(`chain reverted over-cap release: ${revertName(error)}`);
  }
  if ((await paymentToken.balanceOf(seller.address)) !== releaseAmount) {
    throw new Error("over-cap attempt moved funds");
  }

  say("arbiter freezes the escrow on a grade dispute");
  const freezeTx = await escrow.connect(arbiter).freeze(1n, shipment.disputeReason);
  const freezeReceipt = await freezeTx.wait();
  say(`frozen tx=${freezeReceipt?.hash}`);

  say("agent monitors the frozen shipment and holds");
  const held = await agentStep(escrow, agent, 1n, releaseAmount);
  if (held.sent || held.decision.reason !== "dispute_freeze") {
    throw new Error(`expected dispute hold, got ${held.decision.reason}`);
  }
  try {
    await escrow.connect(agent).release(1n, releaseAmount);
    throw new Error("frozen release was mined");
  } catch (error) {
    if (error instanceof Error && error.message === "frozen release was mined") throw error;
    say(`chain reverted frozen release: ${revertName(error)}`);
  }

  const row = await escrow.getEscrow(1n);
  say(
    `done funded=${ethers.formatUnits(row.funded, 6)} released=${ethers.formatUnits(row.released, 6)} frozen=${row.frozen}`,
  );
  say("DEMO OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
