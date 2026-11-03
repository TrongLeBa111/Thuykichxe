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
async function submitBtn(label) { const f = `//form[.//button[contains(.,"${label}")]]`; await (await X(`${f}//button[contains(.,"${label}")]`)).click(); return statusOf(f); }
async function nav(name) { await (await X(`//nav//button[contains(.,"${name}")]`)).click(); await wait(500); }
async function account(i) { await (await X(ACCT)).click(); await page.select(".pop select", String(i)); await wait(250); await (await X(ACCT)).click(); await wait(300); }
async function openMembers() { await (await X(ACCT)).click(); await (await X('//div[@role="dialog"]//button[contains(.,"Mở khu vực thành viên")]')).click(); await wait(600); }
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
check("A: có ghi nhận thủy kích, tem khớp", t.includes("Có ghi nhận ngập, thủy kích") && t.includes("Khớp tem cuối trên hồ sơ"));
check("A: hiện đơn vị sửa và nhãn Đã xác thực", t.includes("Đã sửa chữa bởi Gara độc lập C") && t.includes("Đã xác thực"));
check("A: hiện 'Hồ sơ bắt đầu từ ngày'", t.includes("Hồ sơ bắt đầu từ ngày"));
check("A: dòng thời gian có tiếp nhận do chủ xe ký và lý do phá tem", t.includes("Tiếp nhận xe vào xưởng") && t.includes("chủ xe ký tiếp nhận") && t.includes("Lý do: sửa do ngập"));
check("A: không lộ địa chỉ ví, không hiện số tem", !/0x[0-9a-fA-F]{6}/.test(t.replace(/T-004512/g, "")) && !t.includes("Không ghi nhận"));
await page.screenshot({ path: path.join(SHOTS, "1-lookup.png"), fullPage: true });
t = await demo(V.recheck, "Nhập đúng số tem mới");
check("Đã kiểm tra lại: hồ sơ liên tục + dòng kiểm tra lại", t.includes("Không có ghi nhận, hồ sơ liên tục") && t.includes("đã được kiểm tra lại và niêm phong"));
check("Đã kiểm tra lại: hiện người kiểm tra", t.includes("Đã kiểm tra lại và niêm phong bởi Gara độc lập C"));
await page.screenshot({ path: path.join(SHOTS, "1b-recheck.png"), fullPage: true });
t = await demo(V.paper, "Nhập đúng số tem");
check("Phiếu giấy: hồ sơ liên tục, lý do phá tem 'bảo dưỡng'", t.includes("Không có ghi nhận, hồ sơ liên tục") && t.includes("phiếu giấy") && t.includes("bảo dưỡng định kỳ"));
t = await demo(V.gap, "Trên máy không có tem");
check("Sửa lén chưa kiểm tra lại: cảnh báo mở máy ngoài hệ thống", t.includes("Máy từng được mở ngoài hệ thống") && t.includes("chưa được gara thành viên kiểm tra lại"));
t = await demo(V.unknown, "Tra cứu");
check("Số khung chưa đăng ký: có khoảng trống", t.includes("Có khoảng trống"));

// 3) Chủ xe: đối chiếu → khai báo → cho gara tiếp nhận
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
check("Khai báo chết máy → Mức 3 + lời khuyên", msg.includes("Mức 3") && msg.includes("KHÔNG khởi động lại"), msg);
const ci = '//form[.//button[contains(.,"Cho phép gara tiếp nhận xe")]]';
const gC = await (await X(ci + "//select")).evaluate((s) => [...s.options].find((o) => o.text.includes("Gara độc lập C")).value);
await chooseIn(ci, "Gara tiếp nhận", gC);
await (await X(ci + "//button")).click();
await wait(1500);
t = await bodyText();
check("Chủ xe cho Gara C tiếp nhận; nút chuyển thành 'Nhận xe về'", t.includes("Xe đang ở xưởng của Gara độc lập C") && t.includes("Nhận xe về"));
await page.screenshot({ path: path.join(SHOTS, "2-owner.png"), fullPage: true });

// 4) Khu vực thành viên: chống ghi khống, đóng yêu cầu, bàn giao
await account(4); // Đại lý A — không giữ xe
await openMembers();
await fill("Kiểm tra và đóng yêu cầu", "Số khung", V.clean);
await choose("Kiểm tra và đóng yêu cầu", "Kết luận", 3);
msg = await submit("Kiểm tra và đóng yêu cầu");
check("Gara không giữ xe ghi kết luận → bị chặn (chống ghi khống)", msg.includes("chưa được tiếp nhận vào xưởng của bạn"), msg);
await account(5); // Gara C — đang giữ xe
await fill("Kiểm tra và đóng yêu cầu", "Số khung", V.clean);
await choose("Kiểm tra và đóng yêu cầu", "Kết luận", 3);
msg = await submit("Kiểm tra và đóng yêu cầu");
check("Gara đang giữ xe đóng yêu cầu, kết luận thủy kích", msg.includes("Đã đóng yêu cầu"), msg);
await fill("Bàn giao xe", "Số khung", V.clean);
msg = await submit("Bàn giao xe");
check("Gara bàn giao xe", msg.includes("Đã bàn giao xe"), msg);
await fill("Kiểm tra và đóng yêu cầu", "Số khung", V.clean);
msg = await submit("Kiểm tra và đóng yêu cầu");
check("Sau bàn giao gara hết quyền ghi", msg.includes("chưa được tiếp nhận vào xưởng của bạn"), msg);

// 5) Phiếu giấy: Gara C đề xuất, Insurer xác nhận, phá tem vì bảo dưỡng
await fill("Tiếp nhận bằng phiếu giấy", "Số khung", V.fakeSeal);
await fill("Tiếp nhận bằng phiếu giấy", "Số phiếu", "PTN-0001");
msg = await submit("Tiếp nhận bằng phiếu giấy");
const pid = (msg.match(/Mã phiếu tiếp nhận: (\d+)/) || [])[1];
check("Gara C gửi phiếu tiếp nhận giấy, nhận mã phiếu", pid !== undefined, msg);
await fill("Xác nhận phiếu tiếp nhận giấy", "Mã phiếu", pid);
msg = await submit("Xác nhận phiếu tiếp nhận giấy");
check("Gara tự xác nhận phiếu của mình bị từ chối", msg.includes("Cần một thành viên khác"), msg);
await account(6);
await fill("Xác nhận phiếu tiếp nhận giấy", "Mã phiếu", pid);
msg = await submit("Xác nhận phiếu tiếp nhận giấy");
check("Insurer xác nhận phiếu giấy", msg.includes("Đã xác nhận"), msg);
await account(5);
await fill("Phá tem", "Số khung", V.fakeSeal);
await fill("Phá tem", "Số tem đang gắn", SL.fakeSeal);
await choose("Phá tem", "Lý do", 0);
msg = await submit("Phá tem");
check("Gara C (qua phiếu giấy) phá tem với lý do bảo dưỡng", msg.includes("Đã ghi phá tem"), msg);
await page.screenshot({ path: path.join(SHOTS, "3-members.png"), fullPage: true });

// 6) Insurer, Inspector không cần tiếp nhận
await account(6);
await fill("Tổn thất toàn bộ", "Số khung", V.pending);
msg = await submit("Tổn thất toàn bộ");
check("Insurer ghi tổn thất toàn bộ khi xe không ở xưởng", msg.includes("Đã ghi tổn thất"), msg);
await account(7);
await fill("Mốc kiểm định", "Số khung", V.warranty);
await fill("Mốc kiểm định", "Số km", "9000");
await fill("Mốc kiểm định", "Số tem thấy", SL.warranty);
msg = await submit("Mốc kiểm định");
check("Inspector ghi mốc kiểm định", msg.includes("Đã ghi mốc"), msg);

// 7) Hội đồng 2/3, Workshop mới
await account(0);
await choose("Đề xuất cấp quyền ghi", "Tài khoản", await (await X(form("Đề xuất cấp quyền ghi") + "//select")).evaluate((s) => [...s.options].find((o) => o.text.startsWith("#18")).value));
await choose("Đề xuất cấp quyền ghi", "Vai trò", 2);
msg = await submit("Đề xuất cấp quyền ghi");
check("Hội đồng #0 đề xuất cấp quyền Workshop cho #18", msg.includes("Đã đề xuất"), msg);
for (const i of [1, 2]) {
  await account(i);
  await (await X('//li[contains(.,"Cấp quyền")][1]//button[contains(.,"Bỏ phiếu")]')).click();
  await wait(1200);
}
check("Đủ 2/3 phiếu → 'đã thực hiện'", (await bodyText()).includes("đã thực hiện"));
await account(0);
await fill("Phát hành số tem", "Danh sách", "T-009001\nT-009002");
msg = await submit("Phát hành số tem");
check("Hội đồng phát hành 2 số tem", msg.includes("Đã phát hành 2"), msg);
await account(18);
await fill("Đăng ký xe + đặt tem", "Số khung", webTestVin(1));
await fill("Đăng ký xe + đặt tem", "Số tem", "T-009001");
msg = await submit("Đăng ký xe + đặt tem");
check("Workshop mới đăng ký xe", msg.includes("Đã đăng ký xe"), msg);
await fill("Đăng ký xe + đặt tem", "Số khung", "ABC-123");
msg = await submit("Đăng ký xe + đặt tem");
check("Form ghi chặn VIN sai định dạng", msg.includes("phải có đúng 17 ký tự"), msg);
await fill("Đăng ký xe + đặt tem", "Số khung", webTestVin(2));
await fill("Đăng ký xe + đặt tem", "Số tem", "T-009001");
msg = await submit("Đăng ký xe + đặt tem");
check("Dùng lại số tem bị từ chối", msg.includes("Số tem chưa được hội đồng phát hành hoặc đã dùng"), msg);

// 8) Bảo hành qua ngăn demo
await (await X(DEMOBTN)).click();
await (await X(`//li[contains(.,"${V.warranty} —")]//button[contains(.,"Chủ xe gửi yêu cầu bảo hành")]`)).click();
await wait(800);
t = await checkVin(V.warranty);
check("Demo bảo hành: còn hạn", t.includes("Còn trong thời hạn bảo hành"));
msg = await submitBtn("Gửi yêu cầu bảo hành");
check("Chủ xe gửi yêu cầu bảo hành", msg.includes("Đã ghi yêu cầu bảo hành"), msg);

// 9) Tra cứu xe vừa tạo + điện thoại
t = await gotoVin(webTestVin(1));
check("Xe mới: lịch sử 2 sự kiện, đang ở xưởng đơn vị đăng ký", t.includes("Lịch sử chi tiết (2 sự kiện)") && t.includes("Xe đang ở xưởng của"));
await page.setViewport({ width: 390, height: 800 });
for (const v of [V.gap, V.honest]) {
  await gotoVin(v);
  check(`390px không tràn ngang (${v})`, !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
}
await (await X(DEMOBTN)).click();
check("390px: ngăn demo nằm trong khung nhìn", await page.evaluate(() => { const r = document.querySelector(".pop").getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth; }));
await page.screenshot({ path: path.join(SHOTS, "4-mobile-demo.png") });

console.log("Lỗi console/page:", consoleErrors.length ? consoleErrors : "không có");
await browser.close();
console.log(`${results.filter(Boolean).length}/${results.length} đạt`);
process.exit(results.every(Boolean) ? 0 : 1);
