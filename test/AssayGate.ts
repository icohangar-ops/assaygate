import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import shipment from "../demo/shipment.json";

const cap = ethers.parseUnits(shipment.trancheCapOusd, 6);
const fund = ethers.parseUnits(shipment.fundOusd, 6);
const underCap = ethers.parseUnits(shipment.releaseOusd, 6);
const overCap = ethers.parseUnits(shipment.overCapOusd, 6);

async function deployFixture() {
  const [admin, attester, buyer, seller, agent, arbiter, stranger] = await ethers.getSigners();

  const certificate = await ethers.deployContract("AssayCertificate", [admin.address]);
  await certificate.grantRole(await certificate.ATTESTER_ROLE(), attester.address);

  const paymentToken = await ethers.deployContract("MockUSD", [admin.address]);
  await paymentToken.mint(buyer.address, fund);

  const escrow = await ethers.deployContract("AssayEscrow", [admin.address, await certificate.getAddress()]);
  await escrow.grantRole(await escrow.ARBITER_ROLE(), arbiter.address);
  await escrow.setAgent(agent.address, true);

  return { admin, attester, buyer, seller, agent, arbiter, stranger, certificate, paymentToken, escrow };
}

async function mintFixture() {
  const base = await deployFixture();
  await base.certificate.connect(base.attester).mint(
    base.seller.address,
    shipment.shipmentId,
    shipment.mine,
    shipment.mineral,
    shipment.origin,
    shipment.gradeBps,
    shipment.weightKg,
    shipment.assayUri,
  );
  return base;
}

async function fundedFixture() {
  const base = await mintFixture();
  await base.escrow
    .connect(base.admin)
    .openEscrow(1n, base.buyer.address, base.seller.address, await base.paymentToken.getAddress(), cap);
  await base.paymentToken.connect(base.buyer).approve(await base.escrow.getAddress(), fund);
  await base.escrow.connect(base.buyer).fund(1n, fund);
  return base;
}

describe("AssayGate", function () {
  it("mints an assay certificate with grade, weight, and origin", async function () {
    const { certificate, attester, seller } = await loadFixture(deployFixture);

    await expect(
      certificate.connect(attester).mint(
        seller.address,
        shipment.shipmentId,
        shipment.mine,
        shipment.mineral,
        shipment.origin,
        shipment.gradeBps,
        shipment.weightKg,
        shipment.assayUri,
      ),
    )
      .to.emit(certificate, "CertificateMinted")
      .withArgs(1n, seller.address, attester.address, BigInt(shipment.gradeBps), BigInt(shipment.weightKg));

    expect(await certificate.ownerOf(1n)).to.equal(seller.address);
    const assay = await certificate.getAssay(1n);
    expect(assay.gradeBps).to.equal(BigInt(shipment.gradeBps));
    expect(assay.weightKg).to.equal(BigInt(shipment.weightKg));
    expect(assay.origin).to.equal(shipment.origin);
    expect(assay.mine).to.equal(shipment.mine);
    expect(assay.mineral).to.equal(shipment.mineral);
    expect(await certificate.tokenURI(1n)).to.match(/^data:application\/json;base64,/);
  });

  it("funds an escrow against the certificate", async function () {
    const { escrow, paymentToken, buyer } = await loadFixture(fundedFixture);
    const row = await escrow.getEscrow(1n);

    expect(row.funded).to.equal(fund);
    expect(row.released).to.equal(0n);
    expect(row.trancheCap).to.equal(cap);
    expect(row.certId).to.equal(1n);
    expect(await paymentToken.balanceOf(await escrow.getAddress())).to.equal(fund);
    expect(await paymentToken.balanceOf(buyer.address)).to.equal(0n);
  });

  it("allowlisted agent release under the CFO cap succeeds", async function () {
    const { escrow, paymentToken, agent, seller } = await loadFixture(fundedFixture);

    await expect(escrow.connect(agent).release(1n, underCap))
      .to.emit(escrow, "TrancheReleased")
      .withArgs(1n, agent.address, seller.address, underCap, underCap);

    const row = await escrow.getEscrow(1n);
    expect(row.released).to.equal(underCap);
    expect(await paymentToken.balanceOf(seller.address)).to.equal(underCap);
    expect(await paymentToken.balanceOf(await escrow.getAddress())).to.equal(fund - underCap);
    expect(await escrow.preview(1n, underCap, agent.address)).to.equal(0n);
  });

  it("agent release over the CFO cap reverts", async function () {
    const { escrow, paymentToken, agent, seller } = await loadFixture(fundedFixture);

    await expect(escrow.connect(agent).release(1n, overCap))
      .to.be.revertedWithCustomError(escrow, "ExceedsTrancheCap")
      .withArgs(overCap, cap);

    expect(await paymentToken.balanceOf(seller.address)).to.equal(0n);
    expect((await escrow.getEscrow(1n)).released).to.equal(0n);
    expect(await escrow.preview(1n, overCap, agent.address)).to.equal(4n);
  });

  it("arbiter dispute freezes the escrow", async function () {
    const { escrow, arbiter, buyer } = await loadFixture(fundedFixture);

    await expect(escrow.connect(buyer).freeze(1n, shipment.disputeReason)).to.be.revertedWithCustomError(
      escrow,
      "NotGuardian",
    );

    await expect(escrow.connect(arbiter).freeze(1n, shipment.disputeReason))
      .to.emit(escrow, "EscrowFrozen")
      .withArgs(1n, arbiter.address, shipment.disputeReason);

    const row = await escrow.getEscrow(1n);
    expect(row.frozen).to.equal(true);
    expect(row.freezeReason).to.equal(shipment.disputeReason);
    expect(row.frozenBy).to.equal(arbiter.address);
    expect(await escrow.preview(1n, underCap, (await ethers.getSigners())[4].address)).to.equal(3n);
  });

  it("a freeze blocks agent release", async function () {
    const { escrow, paymentToken, agent, arbiter, seller } = await loadFixture(fundedFixture);

    await escrow.connect(arbiter).freeze(1n, shipment.disputeReason);

    await expect(escrow.connect(agent).release(1n, underCap))
      .to.be.revertedWithCustomError(escrow, "FrozenByDispute")
      .withArgs(shipment.disputeReason);

    expect(await paymentToken.balanceOf(seller.address)).to.equal(0n);
    expect(await paymentToken.balanceOf(await escrow.getAddress())).to.equal(fund);
    expect((await escrow.getEscrow(1n)).released).to.equal(0n);
  });

  it("a caller who is not on the agent allowlist cannot release", async function () {
    const { escrow, stranger, paymentToken, seller } = await loadFixture(fundedFixture);

    await expect(escrow.connect(stranger).release(1n, underCap))
      .to.be.revertedWithCustomError(escrow, "NotAgent")
      .withArgs(stranger.address);

    expect(await paymentToken.balanceOf(seller.address)).to.equal(0n);
  });

  it("CFO unfreeze clears the dispute and a later under-cap release succeeds", async function () {
    const { escrow, agent, admin, arbiter, paymentToken, seller } = await loadFixture(fundedFixture);

    await escrow.connect(arbiter).freeze(1n, shipment.disputeReason);
    await expect(escrow.connect(admin).unfreeze(1n)).to.emit(escrow, "EscrowUnfrozen").withArgs(1n, admin.address);

    expect((await escrow.getEscrow(1n)).frozen).to.equal(false);
    await escrow.connect(agent).release(1n, underCap);
    expect(await paymentToken.balanceOf(seller.address)).to.equal(underCap);
  });
});
