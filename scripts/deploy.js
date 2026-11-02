// Deploy FloodRecord với hội đồng 4 thành viên (tài khoản 0–3), cấp quyền bằng 2/3 phiếu,
// phát hành lô số tem, ghi web/src/contract.json.
// Tài khoản: 0–3 Hội đồng · 4 Đại lý A · 5 Gara C · 6 Insurer · 7 Inspector · 8–19 Chủ xe
const fs = require("fs");
const path = require("path");
const { ethers, artifacts } = require("hardhat");

const ROLE = { Workshop: 2, Insurer: 3, Inspector: 4 };

async function main() {
  const s = await ethers.getSigners();
  const council = s.slice(0, 4);
  const c = await (await ethers.getContractFactory("FloodRecord")).deploy(council.map((x) => x.address));
  await c.waitForDeployment();

  // 4 thành viên → cần 3 phiếu (≥ 2/3). Người đề xuất tự tính 1 phiếu.
  const grant = async (who, role) => {
    await (await c.connect(council[0]).proposeAddMember(who.address, role)).wait();
    const id = (await c.proposalCount()) - 1n;
    await (await c.connect(council[1]).approveProposal(id)).wait();
    await (await c.connect(council[2]).approveProposal(id)).wait();
  };
  await grant(s[4], ROLE.Workshop);
  await grant(s[5], ROLE.Workshop);
  await grant(s[6], ROLE.Insurer);
  await grant(s[7], ROLE.Inspector);

  const address = await c.getAddress();
  const { abi } = await artifacts.readArtifact("FloodRecord");
  const out = path.join(__dirname, "..", "web", "src", "contract.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  // Tên đơn vị (ngoài chuỗi) để trang tra cứu hiển thị "ai ghi / ai sửa" thay vì địa chỉ ví
  const orgs = { [s[4].address]: "Đại lý ủy quyền A", [s[5].address]: "Gara độc lập C", [s[6].address]: "Công ty bảo hiểm B", [s[7].address]: "Trung tâm đăng kiểm D" };
  fs.writeFileSync(out, JSON.stringify({ address, abi, rpc: "http://127.0.0.1:8545", orgs }, null, 2));
  console.log("FloodRecord:", address);
  console.log("Hội đồng 0–3, Workshop 4–5, Insurer 6, Inspector 7, Chủ xe 8–19");
  console.log("Đã ghi", path.relative(process.cwd(), out));
}
main().catch((e) => { console.error(e); process.exit(1); });
