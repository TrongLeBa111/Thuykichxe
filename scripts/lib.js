// Tiện ích dùng chung cho seed/scenarios (chạy bằng node thường, nối tới hardhat node).
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Contract, id } = require("ethers");
const { put } = require("../evidence/store");

const info = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "web", "src", "contract.json"), "utf8"));
const provider = new JsonRpcProvider(info.rpc, undefined, { cacheTimeout: -1 });

// Chỉ số tài khoản theo vai trò (khớp deploy.js)
const ACC = { council: [0, 1, 2, 3], agentA: 4, garageC: 5, insurer: 6, inspector: 7, ownerBase: 8, ownerCount: 12 };

async function connect() {
  const signers = [];
  for (let i = 0; i < 20; i++) signers.push(await provider.getSigner(i));
  const addrs = await Promise.all(signers.map((s) => s.getAddress()));
  const as = (i) => new Contract(info.address, info.abi, signers[i]);
  return { provider, signers, addrs, as, view: new Contract(info.address, info.abi, provider) };
}

const vinHash = (vin) => id(String(vin).trim().toUpperCase()); // VIN chuẩn hóa → vinHash
const serial = (s) => id("seal:" + s);                          // số tem in trên tem → bytes32
const evidence = (kind, data) => put({ kind, ...data });        // lưu ngoài chuỗi, trả hash
const wait = async (txPromise) => (await txPromise).wait();
const nowSec = async () => (await provider.getBlock("latest")).timestamp;
async function advanceDays(d) {
  await provider.send("evm_increaseTime", [Math.round(d * 86400)]);
  await provider.send("evm_mine", []);
}

// Đọc một xe, chuẩn hóa thành object thường (số, không bigint) cho computeStatus.
async function load(view, vin) {
  const k = vinHash(vin);
  const [v, recs] = await Promise.all([view.getVehicle(k), view.getHistory(k)]);
  const vehicle = {
    exists: v.exists, owner: v.owner, flood: v.flood, hydrolock: v.hydrolock, totalLoss: v.totalLoss,
    unrecordedOpening: v.unrecordedOpening, openRequest: Number(v.openRequest), currentSeal: v.currentSeal,
    handoverAt: Number(v.handoverAt), warrantyDays: Number(v.warrantyDays), sealAtHandover: v.sealAtHandover,
    handoverHash: v.handoverHash,
  };
  const records = recs.map((r) => ({
    kind: Number(r.kind), actor: r.actor, occurredAt: Number(r.occurredAt), recordedAt: Number(r.recordedAt),
    sub: Number(r.sub), dataHash: r.dataHash, seal: r.seal, num: Number(r.num),
  }));
  const amended = [];
  for (let i = 0; i < records.length; i++) if (await view.isAmended(k, i)) amended.push(i);
  return { vehicle, records, amended };
}

module.exports = { info, ACC, connect, vinHash, serial, evidence, wait, nowSec, advanceDays, load };
