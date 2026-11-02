import { JsonRpcProvider, Contract } from "ethers";
import info from "./contract.json";

export const provider = new JsonRpcProvider(info.rpc, undefined, { cacheTimeout: -1 });
export const reader = new Contract(info.address, info.abi, provider);

/** Các tài khoản Hardhat kèm vai trò trên chuỗi (0 = không có vai trò ghi). */
export async function listAccounts() {
  const signers = await provider.listAccounts();
  return Promise.all(signers.map(async (s, index) => ({
    index, address: s.address, role: Number(await reader.roles(s.address)),
  })));
}

/** Gọi hàm ghi bằng tài khoản `index`; trả về biên lai. */
export async function write(index, method, args) {
  const signer = await provider.getSigner(index);
  const c = reader.connect(signer);
  await c[method].staticCall(...args); // chạy thử trước để lỗi revert được giải mã (tên lỗi → tiếng Việt)
  const tx = await c[method](...args);
  return tx.wait();
}

/** Lấy tham số của sự kiện đầu tiên có tên `name` trong biên lai (ví dụ id đề xuất). */
export function eventArg(receipt, name, arg) {
  for (const log of receipt.logs) {
    const p = reader.interface.parseLog(log);
    if (p && p.name === name) return p.args[arg];
  }
  return undefined;
}
