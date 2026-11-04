// Kiểm thử đầu–cuối trên trình duyệt thật (Microsoft Edge/Chrome có sẵn trên máy, điều khiển bằng puppeteer-core).
// Cần: hardhat node + deploy + seed MỚI, và dev server (npm run dev) ở http://127.0.0.1:5173.
//   npm run e2e                      → chụp ảnh vào web/e2e/shots
//   BROWSER_PATH="..." npm run e2e   → chỉ định trình duyệt khác
// Bộ test ghi lên chuỗi; muốn chạy lại phải reset node và seed lại.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { DEMO_VINS as V, DEMO_SEALS as SL, DEMO_OWNERS as O, webTestVin } from "../../shared/demo.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(here, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const BASE = process.env.BASE_URL || "http://127.0.0.1:5173";
const candidates = [
  process.env.BROWSER_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const executablePath = candidates.find((p) => fs.existsSync(p));
if (!executablePath) { console.error("Không tìm thấy Edge/Chrome. Đặt BROWSER_PATH."); process.exit(2); }

const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox"], defaultViewport: { width: 1280, height: 1400 } });
const page = await browser.newPage();
const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push("console: " + m.text()); });

const results = [];
const check = (name, cond, extra = "") => { results.push(!!cond); console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const bodyText = () => page.evaluate(() => document.body.innerText);
const X = (s) => page.waitForSelector(`::-p-xpath(${s})`, { timeout: 8000 });
const form = (title) => `//form[.//h3[contains(.,"${title}")]]`;
const clear = async (el) => { await el.click(); await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control"); await page.keyboard.press("Backspace"); };
const ACCT = '//button[@aria-label="Chọn tài khoản (mô phỏng ví)"]';
const DEMOBTN = '//button[@aria-label="Dữ liệu minh họa để chạy thử"]';
let clicks = 0; // đếm thao tác bấm/gõ của người dùng ở khu thành viên (để theo dõi độ gọn)

async function fillIn(formXp, label, text) {
  const el = await X(`${formXp}//label[contains(.,"${label}")]//input | ${formXp}//label[contains(.,"${label}")]//textarea`);
  await clear(el); if (text) await el.type(text);
}
const fill = (title, label, text) => fillIn(form(title), label, text);
const chooseIn = async (formXp, label, value) => (await X(`${formXp}//label[contains(.,"${label}")]//select`)).select(String(value));
const choose = (title, label, value) => chooseIn(form(title), label, value);
async function statusOf(formXp) {
  await page.waitForSelector(`::-p-xpath(${formXp}//*[@role="status"])`, { timeout: 15000 });
  return (await X(`${formXp}//*[@role="status"]`)).evaluate((n) => n.innerText);
}
async function submit(title) { await (await X(`${form(title)}//button[@type="submit" or not(@type)]`)).click(); return statusOf(form(title)); }
// Thành công ở khu làm việc: biểu mẫu đóng lại, thông báo hiện ở đầu khu
async function submitDone(title) {
  await (await X(`${form(title)}//button[@type="submit" or not(@type)]`)).click();
  await page.waitForSelector('::-p-xpath(//p[@role="status"][contains(.,"✔")])', { timeout: 15000 });
  return (await X('//p[@role="status"][contains(.,"✔")]')).evaluate((n) => n.innerText);
}
async function submitBtn(label) { const f = `//form[.//button[contains(.,"${label}")]]`; await (await X(`${f}//button[contains(.,"${label}")]`)).click(); return statusOf(f); }
async function nav(name) { await (await X(`//nav//button[contains(.,"${name}")]`)).click(); await wait(500); }
async function account(i) { await (await X(ACCT)).click(); await page.select(".pop select", String(i)); await wait(250); await (await X(ACCT)).click(); await wait(300); }
async function openMembers() { await (await X(ACCT)).click(); await (await X('//div[@role="dialog"]//button[contains(.,"Mở khu vực thành viên")]')).click(); await wait(800); }
async function checkVin(vin) {
  const el = await X('//label[contains(.,"Số khung")]//input');
  await clear(el); await el.type(vin);
  await (await X('//button[contains(.,"Kiểm tra mã xe")]')).click(); await wait(1200);
  return bodyText();
}
async function demo(vin, label) {
  await (await X(DEMOBTN)).click();
  await (await X(`//li[contains(.,"${vin} —")]//button[contains(.,"${label}")]`)).click();
  await wait(1500);
  return bodyText();
}
// Khu làm việc: nhập số khung một lần, rồi chọn việc từ các ô gợi ý
async function ws(vin) {
  const el = await X('//input[@aria-label="Số khung đang xử lý"]');
  await clear(el); await el.type(vin);
  await (await X('//button[contains(.,"Mở hồ sơ")]')).click(); clicks += 2; await wait(1200);
}
async function tile(name) { await (await X(`//button[contains(@class,"tile")][contains(.,"${name}")]`)).click(); clicks++; await wait(250); }
const gotoVin = async (vin) => { await page.goto(`${BASE}/?vin=${vin}`, { waitUntil: "networkidle0" }); return bodyText(); };

// 1) Trang chủ
await page.goto(BASE + "/", { waitUntil: "networkidle0" });
let t = await bodyText();
check("Slogan có trên trang", t.includes("Hồ sơ xác thực thông tin xe của bạn"));
check("Menu chính chỉ có Tra cứu + Chủ xe khai báo", t.includes("Tra cứu xe") && t.includes("Chủ xe khai báo") && !t.includes("Hội đồng"));
await (await X('//input[@aria-label="Số khung (VIN)"]')).type("123");
await (await X('//form[@role="search"]//button')).click(); await wait(400);
check("VIN sai định dạng ('123') bị chặn kèm hướng dẫn", (await bodyText()).includes("phải có đúng 17 ký tự"));

// 2) Tra cứu qua ngăn demo
t = await demo(V.honest, "Nhập đúng số tem");
check("Xe từng thủy kích: có ghi nhận, tem khớp", t.includes("Có ghi nhận ngập, thủy kích") && t.includes("Khớp tem cuối trên hồ sơ"));
check("Hiện đơn vị sửa và nhãn Đã xác thực", t.includes("Đã sửa chữa bởi Gara độc lập C") && t.includes("Đã xác thực"));
check("Hiện 'Hồ sơ bắt đầu từ ngày' và lý do thay tem", t.includes("Hồ sơ bắt đầu từ ngày") && t.includes("Lý do: sửa do ngập"));
check("Không lộ địa chỉ ví, không hiện số tem", !/0x[0-9a-fA-F]{6}/.test(t.replace(/T-004512/g, "")) && !t.includes("Không ghi nhận"));
await page.screenshot({ path: path.join(SHOTS, "1-lookup.png"), fullPage: true });
t = await demo(V.recheck, "Nhập đúng số tem mới");
check("Đã kiểm tra lại: hồ sơ liên tục + dòng kiểm tra lại", t.includes("Không có ghi nhận, hồ sơ liên tục") && t.includes("đã được kiểm tra lại ngày"));
check("Đã kiểm tra lại: hiện đơn vị kiểm tra", t.includes("Đã kiểm tra lại bởi Gara độc lập C"));
t = await demo(V.engine, "Nhập đúng số tem");
check("Thay động cơ: vẫn có cờ thủy kích, nêu việc thay động cơ", t.includes("Có ghi nhận ngập, thủy kích") && t.includes("Đã thay động cơ 1 lần"));
t = await demo(V.salvage, "Nhập đúng số tem");
check("Thanh lý xe tổn thất: cờ còn, nêu 2 lần chuyển chủ", t.includes("tổn thất toàn bộ") && t.includes("Đã chuyển chủ 2 lần"));
t = await demo(V.gap, "Trên máy không có tem");
check("Sửa lén chưa kiểm tra lại: cảnh báo mở máy ngoài hệ thống", t.includes("Máy từng được mở ngoài hệ thống") && t.includes("chưa được gara thành viên kiểm tra lại"));
t = await demo(V.unknown, "Tra cứu");
check("Số khung chưa đăng ký: có khoảng trống", t.includes("Có khoảng trống"));

// 3) Chủ xe: đối chiếu → khai báo
await nav("Chủ xe khai báo");
await account(12);
t = await checkVin(V.clean);
check("Tài khoản khác chủ xe: bị khóa các bước sau", t.includes("không phải chủ xe hiện tại") && !t.includes("Gửi khai báo"));
await account(O.clean);
t = await checkVin(V.clean);
check("Chủ xe: tìm thấy xe, là chủ xe hiện tại", t.includes("Đã tìm thấy xe " + V.clean) && t.includes("là chủ xe hiện tại"));
const ow = '//form[.//button[contains(.,"Gửi khai báo")]]';
await fillIn(ow, "Độ ngập", "40"); await fillIn(ow, "Thời gian ngâm", "20");
await (await X(ow + '//label[contains(.,"chết máy")]//input')).click();
await (await X(ow + "//button")).click();
let msg = await statusOf(ow);
check("Khai báo chết máy → Mức 3 + lời khuyên đưa xe tới đơn vị xác nhận", msg.includes("Mức 3") && msg.includes("KHÔNG khởi động lại") && msg.includes("đơn vị đăng kiểm"), msg);
check("Trang chủ xe chỉ còn 4 bước, không còn bước chọn gara", !(await bodyText()).includes("Cho phép gara tiếp nhận xe"));
await page.screenshot({ path: path.join(SHOTS, "2-owner.png"), fullPage: true });

// 4) Chủ xe chuyển chủ (mua bán cá nhân)
await account(12);
await checkVin(V.fakeSeal);
const tr = '//form[.//button[contains(.,"Chuyển chủ")]]';
const buyer = await (await X(tr + "//select")).evaluate((s) => [...s.options].find((o) => o.text.startsWith("#15")).value);
await chooseIn(tr, "Chủ mới", buyer);
await fillIn(tr, "Bảo hành", "30");
await (await X(tr + "//button")).click();
await page.waitForSelector('::-p-xpath(//p[@role="status"][contains(.,"Đã chuyển chủ")])', { timeout: 15000 });
msg = (await bodyText());
check("Chủ xe ký chuyển chủ kèm bảo hành 30 ngày", msg.includes("Đã chuyển chủ"), msg);
t = await checkVin(V.fakeSeal);
check("Chủ cũ không còn là chủ xe sau khi chuyển", t.includes("không phải chủ xe hiện tại"));

// 5) Khu làm việc: nhập VIN một lần, chọn việc
await account(5); // Gara C
await openMembers();
await ws(V.clean);
t = await bodyText();
check("Mở hồ sơ: hiện cảnh báo chủ xe đang chờ + ô gợi ý việc cần làm", t.includes("đang chờ kiểm tra") && t.includes("Kiểm tra xe") && t.includes("Ghi nhận ngập") && t.includes("Thay tem") && t.includes("Thay động cơ"));
check("Xe chưa ngập: không có ô 'Sửa xong' và 'Chuyển chủ'", !t.includes("Sửa xong") && !t.includes("Chuyển chủ"));
await tile("Kiểm tra xe");
await fill("Kiểm tra xe", "Số km", "15100");
await fill("Kiểm tra xe", "Số tem đọc được", SL.clean);
await choose("Kiểm tra xe", "Kết luận về ngập", 4);
clicks += 3;
msg = await submitDone("Kiểm tra xe"); clicks++;
check("Gara kết luận thủy kích: một biểu mẫu, đóng yêu cầu của chủ xe", msg.includes("thủy kích"), msg);
t = await bodyText();
check("Hồ sơ tự cập nhật: cờ thủy kích, hết cảnh báo chờ, hiện ô 'Sửa xong'", t.includes("Thủy kích") && !t.includes("đang chờ kiểm tra") && t.includes("Sửa xong"));
await page.screenshot({ path: path.join(SHOTS, "3-workspace.png"), fullPage: true });
check(`Ca kiểm tra + kết luận chỉ cần ${clicks} thao tác (đã gồm nhập VIN)`, clicks <= 10, `${clicks}`);

// 6) Sửa xong + thay tem, hai bước trên cùng VIN không phải nhập lại VIN
await tile("Sửa xong");
await fill("Sửa xong", "Số tem mới", "T-009100");
msg = await submitDone("Sửa xong");
check("Sửa xong kèm tem mới trong một lần ghi", msg.includes("Đã ghi sửa xong"), msg);
await tile("Thay tem");
await fill("Thay tem", "Số tem mới", "T-009100");
msg = await submit("Thay tem");
check("Dùng lại số tem bị từ chối", msg.includes("mỗi số tem chỉ dùng một lần"), msg);
await page.screenshot({ path: path.join(SHOTS, "3b-seal-reuse.png"), fullPage: true });

// 7) Thành viên khác, cùng khu làm việc
await ws("ABC-123");
check("Số khung sai định dạng bị chặn ở khu làm việc", (await bodyText()).includes("phải có đúng 17 ký tự"));
await account(6); // bảo hiểm
await ws(V.pending);
await tile("Tổn thất toàn bộ");
msg = await submitDone("Tổn thất toàn bộ");
check("Bảo hiểm ghi tổn thất toàn bộ cho xe bất kỳ (không cần tiếp nhận)", msg.includes("Đã ghi tổn thất"), msg);
await account(7); // đăng kiểm
await ws(V.warranty);
await tile("Kiểm tra xe");
await fill("Kiểm tra xe", "Số km", "9000");
await fill("Kiểm tra xe", "Số tem đọc được", SL.warranty);
msg = await submitDone("Kiểm tra xe");
check("Đăng kiểm ghi mốc km, chỉ đọc số liệu", msg.includes("Đã ghi kiểm tra"), msg);
await ws(V.gap);
await tile("Kiểm tra xe");
await fill("Kiểm tra xe", "Số km", "40500");
await chooseIn(form("Kiểm tra xe"), "Tem trên máy", "none");
msg = await submitDone("Kiểm tra xe");
check("Đăng kiểm ghi 'không thấy tem' (ô nhập số tem tự ẩn)", msg.includes("Đã ghi kiểm tra"), msg);

// 8) Thay động cơ, đăng ký xe, đính chính
await account(5);
await ws(V.recheck);
await tile("Thay động cơ");
await fill("Thay động cơ", "Số máy mới", "eng-new-777");
msg = await submitDone("Thay động cơ");
check("Gara ghi thay động cơ", msg.includes("Đã ghi thay động cơ"), msg);
await account(4); // Đại lý A
await ws(webTestVin(1));
check("Số khung chưa có hồ sơ: hiện biểu mẫu đăng ký", (await bodyText()).includes("chưa có hồ sơ"));
const ownerOpt = await (await X(form("đăng ký xe") + "//label[contains(.,\"Chủ xe\")]//select")).evaluate((s) => [...s.options].find((o) => o.text.startsWith("#8")).value);
await chooseIn(form("đăng ký xe"), "Chủ xe", ownerOpt);
await fill("đăng ký xe", "Số tem", "t-009001"); // gõ thường, hệ thống tự chuẩn hóa
await fill("đăng ký xe", "Số máy", "E-WEB-1");
msg = await submitDone("đăng ký xe");
check("Đơn vị xác nhận đăng ký xe kèm tem và số máy", msg.includes("Đã đăng ký xe"), msg);
await account(6);
await ws(V.honest);
await tile("Đính chính");
msg = await submitDone("Đề xuất đính chính");
check("Bảo hiểm đề xuất đính chính sự kiện do mình ghi", msg.includes("Đã đề xuất đính chính"), msg);
await account(5);
t = await bodyText();
check("Đơn vị khác thấy mục 'Chờ bạn ký' (không phải gõ mã)", t.includes("Chờ bạn ký"));
await (await X('//div[contains(@class,"pending")]//button[contains(.,"Ký")]')).click();
await page.waitForSelector('::-p-xpath(//p[@role="status"][contains(.,"đã đính chính")])', { timeout: 15000 });
check("Ký đính chính một lần bấm", true);

// 9) Hội đồng 2/3 cấp quyền cho đơn vị mới
await account(0);
check("Hội đồng không còn biểu mẫu phát hành số tem", !(await bodyText()).includes("Phát hành số tem"));
await choose("Đề xuất cấp quyền ghi", "Tài khoản", await (await X(form("Đề xuất cấp quyền ghi") + "//select")).evaluate((s) => [...s.options].find((o) => o.text.startsWith("#18")).value));
await choose("Đề xuất cấp quyền ghi", "Vai trò", 2);
msg = await submit("Đề xuất cấp quyền ghi");
check("Hội đồng #0 đề xuất cấp quyền đơn vị xác nhận cho #18", msg.includes("Đã đề xuất"), msg);
for (const i of [1, 2]) {
  await account(i);
  await (await X('//li[contains(.,"Cấp quyền")][1]//button[contains(.,"Bỏ phiếu")]')).click();
  await wait(1200);
}
check("Đủ 2/3 phiếu → 'đã thực hiện'", (await bodyText()).includes("đã thực hiện"));
await account(18);
await ws(webTestVin(2));
const ownerOpt2 = await (await X(form("đăng ký xe") + "//label[contains(.,\"Chủ xe\")]//select")).evaluate((s) => [...s.options].find((o) => o.text.startsWith("#9")).value);
await chooseIn(form("đăng ký xe"), "Chủ xe", ownerOpt2);
msg = await submitDone("đăng ký xe");
check("Đơn vị mới được cấp quyền đăng ký xe không cần tem", msg.includes("Đã đăng ký xe"), msg);
await page.screenshot({ path: path.join(SHOTS, "4-members.png"), fullPage: true });

// 10) Chủ xe gửi yêu cầu bảo hành qua ngăn demo
await (await X(DEMOBTN)).click();
await (await X(`//li[contains(.,"${V.warranty} —")]//button[contains(.,"Chủ xe gửi yêu cầu bảo hành")]`)).click();
await wait(800);
t = await checkVin(V.warranty);
check("Demo bảo hành: còn hạn", t.includes("Còn trong thời hạn bảo hành"));
msg = await submitBtn("Gửi yêu cầu bảo hành");
check("Chủ xe gửi yêu cầu bảo hành", msg.includes("Đã ghi yêu cầu bảo hành"), msg);

// 11) Tra cứu xe vừa tạo / vừa đính chính + điện thoại
t = await gotoVin(webTestVin(1));
check("Xe mới đăng ký qua web: tra cứu được, 1 sự kiện", t.includes("Lịch sử chi tiết (1 sự kiện)"));
t = await gotoVin(V.honest);
check("Sự kiện đã đính chính được đánh dấu, vẫn còn trong lịch sử", t.includes("đã đính chính") && t.includes("Đính chính sự kiện số"));
await page.setViewport({ width: 390, height: 800 });
for (const v of [V.gap, V.honest]) {
  await gotoVin(v);
  check(`390px không tràn ngang (${v})`, !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
}
await (await X(DEMOBTN)).click();
check("390px: ngăn demo nằm trong khung nhìn", await page.evaluate(() => { const r = document.querySelector(".pop").getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth; }));
await page.screenshot({ path: path.join(SHOTS, "5-mobile-demo.png") });

console.log("Lỗi console/page:", consoleErrors.length ? consoleErrors : "không có");
await browser.close();
console.log(`${results.filter(Boolean).length}/${results.length} đạt`);
process.exit(results.every(Boolean) && consoleErrors.length === 0 ? 0 : 1);
