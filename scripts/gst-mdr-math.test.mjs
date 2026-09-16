import assert from "node:assert/strict";
import { gstExclusive, gstInclusive, gstLine, ratePercentToBps } from "../src/lib/gstMath.ts";
import { mdrOnTransaction, monthlyMdrEstimate, UPI_MDR } from "../src/lib/upiMdr.ts";

// Exclusive ₹1,000 @ 18% → ₹180 GST, ₹1,180 total
{
  const r = gstExclusive(1000_00, 1800);
  assert.equal(r.gstPaise, 180_00);
  assert.equal(r.totalPaise, 1180_00);
}

// Inclusive ₹1,180 @ 18% → ₹1,000 base
{
  const r = gstInclusive(1180_00, 1800);
  assert.equal(r.basePaise, 1000_00);
  assert.equal(r.gstPaise, 180_00);
}

// Intra-state split
{
  const r = gstLine(1000_00, ratePercentToBps(18), "exclusive", "intra");
  assert.equal(r.cgstPaise, 90_00);
  assert.equal(r.sgstPaise, 90_00);
  assert.equal(r.igstPaise, 0);
}

{
  const r = gstLine(1000_00, ratePercentToBps(18), "exclusive", "inter");
  assert.equal(r.igstPaise, 180_00);
  assert.equal(r.cgstPaise, 0);
}

// Press examples for UPI MDR
assert.equal(mdrOnTransaction(1500_00, "standard"), 0);
assert.equal(mdrOnTransaction(2000_00, "standard"), 0);
assert.equal(mdrOnTransaction(3000_00, "standard"), 12_00);
assert.equal(mdrOnTransaction(5000_00, "standard"), 20_00);
assert.equal(mdrOnTransaction(50000_00, "standard"), 200_00);
assert.equal(mdrOnTransaction(75000_00, "standard"), 300_00);
assert.equal(mdrOnTransaction(100000_00, "standard"), 300_00);
assert.equal(mdrOnTransaction(4000_00, "essential"), 5_00);
assert.equal(mdrOnTransaction(100000_00, "p2p"), 0);
assert.equal(mdrOnTransaction(5000_00, "standard", { smallMerchantExempt: true }), 0);

{
  const est = monthlyMdrEstimate({
    monthlyUpiPaise: 80000_00,
    valueShareAboveThreshold: 0.2,
    typicalLargeTicketPaise: 3500_00,
    category: "standard",
  });
  assert.equal(est.exempt, true);
  assert.equal(est.mdrPaise, 0);
}

assert.equal(UPI_MDR.thresholdPaise, 2000_00);
console.log("gst-mdr-math.test.mjs: all assertions passed");
