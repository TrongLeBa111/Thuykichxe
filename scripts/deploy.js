// Deploy FloodRecord với hội đồng 4 thành viên (tài khoản 0–3), cấp quyền bằng 2/3 phiếu,
// ghi web/src/contract.json.
// Tài khoản: 0–3 Hội đồng · 4 Đại lý A · 5 Gara C · 6 Bảo hiểm B · 7 Đăng kiểm D (đều là Đơn vị xác nhận) · 8–19 Chủ xe
const fs = require("fs");
const path = require("path");
const { ethers, artifacts } = require("hardhat");

const ROLE = { Attester: 2 };

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
  for (const i of [4, 5, 6, 7]) await grant(s[i], ROLE.Attester); // cùng một vai trò; loại đơn vị nằm ở danh bạ orgs

  const address = await c.getAddress();
  const { abi } = await artifacts.readArtifact("FloodRecord");
  const out = path.join(__dirname, "..", "web", "src", "contract.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  // Tên đơn vị (ngoài chuỗi) để trang tra cứu hiển thị "ai ghi / ai sửa" thay vì địa chỉ ví
  const orgs = { [s[4].address]: "Đại lý ủy quyền A", [s[5].address]: "Gara độc lập C", [s[6].address]: "Công ty bảo hiểm B", [s[7].address]: "Trung tâm đăng kiểm D" };
  fs.writeFileSync(out, JSON.stringify({ address, abi, rpc: "http://127.0.0.1:8545", orgs }, null, 2));
  console.log("FloodRecord:", address);
  console.log("Hội đồng 0–3, Đơn vị xác nhận 4–7, Chủ xe 8–19");
  console.log("Đã ghi", path.relative(process.cwd(), out));
}
main().catch((e) => { console.error(e); process.exit(1); });
