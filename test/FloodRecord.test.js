const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const sn = (s) => ethers.id("seal:" + s);
const H = (s) => ethers.id("doc:" + s);
const vh = (vin) => ethers.id(vin.trim().toUpperCase());
const Role = { None: 0, Council: 1, Workshop: 2, Insurer: 3, Inspector: 4 };
const Kind = { Registered: 0, SealApplied: 1, SealBroken: 2, Flood: 3, Repair: 4, TotalLoss: 5, Inspection: 6, Handover: 7, OwnerReport: 8, Resolution: 9, WarrantyClaim: 10, Amendment: 11 };
const FT = { Floor: 0, Engine: 1, Hydrolock: 2 };
const Concl = { NoFlood: 0, Floor: 1, Engine: 2, Hydrolock: 3 };
const Level = { None: 0, Watch: 1, Inspect: 2, Urgent: 3 };
const ZERO = ethers.ZeroHash;
const BR = { Maintenance: 0, NonFloodRepair: 1, FloodRepair: 2, EngineReplacement: 3, Unrecorded: 4 };
Kind.CheckIn = 12; Kind.CheckOut = 13; Kind.Reinspection = 14;

describe("FloodRecord (VehicleHistory theo proposal)", () => {
  let c, council, wsA, wsB, insurer, inspector, owner1, owner2, stranger;
  const VIN = vh("ABC");

  beforeEach(async () => {
    const s = await ethers.getSigners();
    council = s.slice(0, 4);
    [wsA, wsB, insurer, inspector, owner1, owner2, stranger] = s.slice(4, 11);
    c = await (await ethers.getContractFactory("FloodRecord")).deploy(council.map((x) => x.address));
    // cấp quyền bằng đề xuất + 2/3 phiếu (4 thành viên → cần 3)
    for (const [who, role] of [[wsA, Role.Workshop], [wsB, Role.Workshop], [insurer, Role.Insurer], [inspector, Role.Inspector]]) {
      await c.connect(council[0]).proposeAddMember(who.address, role);
      const id = (await c.proposalCount()) - 1n;
      await c.connect(council[1]).approveProposal(id);
      await c.connect(council[2]).approveProposal(id);
    }
    const serials = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"].map(sn);
    await c.connect(council[0]).issueSeals(serials);
  });

  const reg = (vin = VIN, serial = "S1", owner = owner1) => c.connect(wsA).registerVehicle(vin, owner.address, sn(serial), H("reg"));
  const kinds = async (vin = VIN) => (await c.getHistory(vin)).map((r) => Number(r.kind));

  describe("Hội đồng 2/3", () => {
    it("quyền ghi chỉ có sau khi đủ 2/3 phiếu", async () => {
      await c.connect(council[0]).proposeAddMember(stranger.address, Role.Workshop);
      const id = (await c.proposalCount()) - 1n;
      expect(await c.roles(stranger.address)).to.equal(Role.None); // 1/4 phiếu
      await c.connect(council[1]).approveProposal(id);
      expect(await c.roles(stranger.address)).to.equal(Role.None); // 2/4 chưa đủ
      await c.connect(council[2]).approveProposal(id);
      expect(await c.roles(stranger.address)).to.equal(Role.Workshop); // 3/4 ≥ 2/3
    });
    it("gara 'ma' không tự cấp quyền; người ngoài hội đồng không đề xuất/bỏ phiếu", async () => {
      await expect(c.connect(stranger).proposeAddMember(stranger.address, Role.Workshop)).to.be.revertedWithCustomError(c, "NotCouncil");
      await expect(c.connect(wsA).proposeAddMember(stranger.address, Role.Workshop)).to.be.revertedWithCustomError(c, "NotCouncil");
      await expect(c.connect(stranger).registerVehicle(VIN, owner1.address, sn("S1"), H("x"))).to.be.revertedWithCustomError(c, "NotWorkshop");
    });
    it("một thành viên không bỏ phiếu hai lần; đề xuất đã chạy thì đóng", async () => {
      await c.connect(council[0]).proposeAddMember(stranger.address, Role.Insurer);
      const id = (await c.proposalCount()) - 1n;
      await expect(c.connect(council[0]).approveProposal(id)).to.be.revertedWithCustomError(c, "AlreadyVoted");
      await c.connect(council[1]).approveProposal(id);
      await c.connect(council[2]).approveProposal(id);
      await expect(c.connect(council[3]).approveProposal(id)).to.be.revertedWithCustomError(c, "ProposalClosed");
    });
    it("thu hồi quyền cần 2/3; sau đó không ghi được nữa nhưng bản ghi cũ còn", async () => {
      await reg();
      await c.connect(council[0]).proposeRevokeMember(wsA.address);
      const id = (await c.proposalCount()) - 1n;
      await c.connect(council[1]).approveProposal(id);
      await c.connect(council[2]).approveProposal(id);
      expect(await c.roles(wsA.address)).to.equal(Role.None);
      await expect(reg(vh("NEW"), "S2")).to.be.revertedWithCustomError(c, "NotWorkshop");
      expect((await c.getHistory(VIN)).length).to.equal(2);
    });
    it("đổi ngưỡng cũng cần 2/3; ngưỡng 0 bị từ chối", async () => {
      await expect(c.connect(council[0]).proposeThresholds(0, 30)).to.be.revertedWithCustomError(c, "InvalidThreshold");
      await c.connect(council[0]).proposeThresholds(50, 60);
      const id = (await c.proposalCount()) - 1n;
      expect(await c.depthThreshold()).to.equal(30);
      await c.connect(council[1]).approveProposal(id);
      await c.connect(council[2]).approveProposal(id);
      expect(await c.depthThreshold()).to.equal(50);
      expect(await c.soakThreshold()).to.equal(60);
    });
    it("không thu hồi thành viên hội đồng cuối cùng", async () => {
      const solo = await (await ethers.getContractFactory("FloodRecord")).deploy([council[0].address]);
      await expect(solo.connect(council[0]).proposeRevokeMember(council[0].address)).to.be.revertedWithCustomError(solo, "CannotRemoveLastCouncil");
    });
  });

  describe("Tem niêm phong", () => {
    it("số tem chỉ do hội đồng phát hành và dùng một lần", async () => {
      await expect(c.connect(wsA).issueSeals([sn("X")])).to.be.revertedWithCustomError(c, "NotCouncil");
      await expect(c.connect(council[0]).issueSeals([sn("S1")])).to.be.revertedWithCustomError(c, "SealNotAvailable"); // đã phát hành
      await reg();
      await expect(reg(vh("OTHER"), "S1")).to.be.revertedWithCustomError(c, "SealNotAvailable"); // đã gắn
      await expect(reg(vh("OTHER"), "CHUA-PHAT-HANH")).to.be.revertedWithCustomError(c, "SealNotAvailable");
    });
    it("đăng ký xe gắn tem số 1; mã xe trùng bị từ chối", async () => {
      await reg();
      expect((await c.getVehicle(VIN)).currentSeal).to.equal(sn("S1"));
      expect(await kinds()).to.deep.equal([Kind.Registered, Kind.SealApplied]);
      await expect(reg(VIN, "S2")).to.be.revertedWithCustomError(c, "VehicleExists");
    });
    it("breakSeal chỉ hợp lệ với tem đang gắn trên đúng VIN", async () => {
      await reg();
      await reg(vh("XYZ"), "S2", owner2);
      await expect(c.connect(wsA).breakSeal(VIN, sn("S2"), BR.FloodRepair, H("r"))).to.be.revertedWithCustomError(c, "WrongSeal"); // tem của xe khác
      await expect(c.connect(wsA).breakSeal(VIN, sn("S3"), BR.FloodRepair, H("r"))).to.be.revertedWithCustomError(c, "WrongSeal"); // chưa gắn
      await expect(c.connect(owner1).breakSeal(VIN, sn("S1"), BR.FloodRepair, H("r"))).to.be.revertedWithCustomError(c, "NotWorkshop");
      await c.connect(wsA).breakSeal(VIN, sn("S1"), BR.FloodRepair, H("r"));
      expect((await c.getVehicle(VIN)).currentSeal).to.equal(ZERO);
      expect((await c.getSeal(sn("S1"))).state).to.equal(3); // Broken
      await expect(c.connect(wsA).breakSeal(VIN, sn("S1"), BR.FloodRepair, H("r"))).to.be.revertedWithCustomError(c, "WrongSeal");
    });
    it("tem đã phá không dùng lại được; không gắn hai tem cùng lúc", async () => {
      await reg();
      await expect(c.connect(wsA).applySeal(VIN, sn("S2"), H("a"))).to.be.revertedWithCustomError(c, "SealAlreadyOnVehicle");
      await c.connect(wsA).breakSeal(VIN, sn("S1"), BR.FloodRepair, H("r"));
      await expect(c.connect(wsA).applySeal(VIN, sn("S1"), H("a"))).to.be.revertedWithCustomError(c, "SealNotAvailable");
      await c.connect(wsA).applySeal(VIN, sn("S2"), H("a"));
      expect((await c.checkSeal(VIN, sn("S2"))).match_).to.equal(true);
      expect((await c.checkSeal(VIN, sn("S1"))).match_).to.equal(false);
    });
  });

  describe("Sự kiện ngập và cờ một chiều", () => {
    beforeEach(async () => reg());

    it("Insurer hoặc Workshop ghi ngập; chủ xe, thanh tra, người lạ thì không", async () => {
      await expect(c.connect(owner1).reportFlood(VIN, FT.Engine, 0, H("f"))).to.be.revertedWithCustomError(c, "NotInsurerOrWorkshop");
      await expect(c.connect(inspector).reportFlood(VIN, FT.Engine, 0, H("f"))).to.be.revertedWithCustomError(c, "NotInsurerOrWorkshop");
      await c.connect(insurer).reportFlood(VIN, FT.Floor, 0, H("f"));
      await expect(c.connect(wsB).reportFlood(VIN, FT.Engine, 0, H("f"))).to.be.revertedWithCustomError(c, "NotInCustody");
      await c.connect(wsA).reportFlood(VIN, FT.Engine, 0, H("f")); // wsA đăng ký xe nên đang giữ xe
      const v = await c.getVehicle(VIN);
      expect([v.flood, v.hydrolock]).to.deep.equal([true, false]);
    });
    it("thủy kích bật thêm cờ hydrolock; thời điểm ghi nhận là block.timestamp", async () => {
      const claimed = BigInt(await time.latest()) - 86400n;
      await c.connect(insurer).reportFlood(VIN, FT.Hydrolock, claimed, H("f"));
      const v = await c.getVehicle(VIN);
      expect([v.flood, v.hydrolock]).to.deep.equal([true, true]);
      const r = (await c.getHistory(VIN)).at(-1);
      expect(r.occurredAt).to.equal(claimed);
      expect(r.recordedAt).to.equal(BigInt(await time.latest()));
      await expect(c.connect(insurer).reportFlood(VIN, FT.Floor, BigInt(await time.latest()) + 9999n, H("f"))).to.be.revertedWithCustomError(c, "FutureTime");
    });
    it("cờ không tắt được: sửa xong chỉ thêm sự kiện, cờ giữ nguyên", async () => {
      await c.connect(insurer).reportFlood(VIN, FT.Hydrolock, 0, H("f"));
      await c.connect(wsA).breakSeal(VIN, sn("S1"), BR.FloodRepair, H("open"));
      await c.connect(wsA).repairCompleted(VIN, sn("S2"), H("done"));
      const v = await c.getVehicle(VIN);
      expect([v.flood, v.hydrolock]).to.deep.equal([true, true]);
      expect(v.currentSeal).to.equal(sn("S2"));
      expect(await kinds()).to.deep.equal([Kind.Registered, Kind.SealApplied, Kind.Flood, Kind.SealBroken, Kind.Repair, Kind.SealApplied]);
    });
    it("repairCompleted cần đã có cờ ngập, và chỉ Workshop", async () => {
      await expect(c.connect(wsA).repairCompleted(VIN, ZERO, H("d"))).to.be.revertedWithCustomError(c, "NoFloodFlag");
      await c.connect(insurer).reportFlood(VIN, FT.Engine, 0, H("f"));
      await expect(c.connect(insurer).repairCompleted(VIN, ZERO, H("d"))).to.be.revertedWithCustomError(c, "NotWorkshop");
    });
    it("tổn thất toàn bộ: chỉ Insurer, bật cờ nặng nhất", async () => {
      await expect(c.connect(wsA).declareTotalLoss(VIN, H("t"))).to.be.revertedWithCustomError(c, "NotInsurer");
      await c.connect(insurer).declareTotalLoss(VIN, H("t"));
      expect((await c.getVehicle(VIN)).totalLoss).to.equal(true);
    });
    it("không tồn tại hàm xóa/sửa/tắt cờ trong ABI", async () => {
      const names = c.interface.fragments.filter((f) => f.type === "function").map((f) => f.name.toLowerCase());
      for (const bad of ["delete", "remove", "clear", "reset", "unset", "disable", "edit", "modify", "setflag"]) {
        expect(names.filter((n) => n.includes(bad)), bad).to.deep.equal([]);
      }
    });
    it("xe không tồn tại báo lỗi", async () => {
      await expect(c.connect(insurer).reportFlood(vh("KHONG-CO"), FT.Floor, 0, H("f"))).to.be.revertedWithCustomError(c, "VehicleNotFound");
    });
  });

  describe("Kiểm định (Inspector)", () => {
    beforeEach(async () => reg());
    it("tem khớp: ghi mốc, không bật cờ; chỉ Inspector ghi", async () => {
      await expect(c.connect(wsA).inspectionCheckpoint(VIN, 1000, sn("S1"), H("i"))).to.be.revertedWithCustomError(c, "NotInspector");
      await c.connect(inspector).inspectionCheckpoint(VIN, 1000, sn("S1"), H("i"));
      const r = (await c.getHistory(VIN)).at(-1);
      expect([Number(r.kind), Number(r.sub), Number(r.num)]).to.deep.equal([Kind.Inspection, 0, 1000]);
      expect((await c.getVehicle(VIN)).unrecordedOpening).to.equal(false);
    });
    it("mất tem hoặc tem lạ → bật cờ 'mở máy không ghi nhận'", async () => {
      await c.connect(inspector).inspectionCheckpoint(VIN, 1000, ZERO, H("i"));
      expect((await c.getVehicle(VIN)).unrecordedOpening).to.equal(true);
      await reg(vh("V2"), "S2", owner2);
      await c.connect(inspector).inspectionCheckpoint(vh("V2"), 500, sn("FAKE"), H("i"));
      expect((await c.getVehicle(vh("V2"))).unrecordedOpening).to.equal(true);
    });
    it("cờ không tắt khi mốc sau đó khớp", async () => {
      await c.connect(inspector).inspectionCheckpoint(VIN, 1000, ZERO, H("i"));
      await c.connect(inspector).inspectionCheckpoint(VIN, 2000, sn("S1"), H("i"));
      expect((await c.getVehicle(VIN)).unrecordedOpening).to.equal(true);
    });
  });

  describe("Khai báo của chủ xe (tình huống B)", () => {
    beforeEach(async () => reg());
    const rep = (who, d, s, st) => c.connect(who).ownerReport(VIN, d, s, st, 0, H("o"));

    it("ba mức khuyến nghị", async () => {
      expect(await c.classify(15, 10, false)).to.equal(Level.Watch);
      expect(await c.classify(40, 10, false)).to.equal(Level.Inspect);
      expect(await c.classify(10, 30, false)).to.equal(Level.Inspect);
      expect(await c.classify(10, 5, true)).to.equal(Level.Urgent);
    });
    it("khai báo mở yêu cầu kiểm tra nhưng KHÔNG bật cờ", async () => {
      await rep(owner1, 40, 10, false);
      const v = await c.getVehicle(VIN);
      expect(v.openRequest).to.equal(Level.Inspect);
      expect([v.flood, v.hydrolock, v.totalLoss, v.unrecordedOpening]).to.deep.equal([false, false, false, false]);
    });
    it("mức yêu cầu chỉ tăng; người không phải chủ xe bị từ chối", async () => {
      await rep(owner1, 10, 5, true);
      await rep(owner1, 10, 5, false);
      expect((await c.getVehicle(VIN)).openRequest).to.equal(Level.Urgent);
      await expect(rep(owner2, 10, 5, false)).to.be.revertedWithCustomError(c, "NotVehicleOwner");
      await expect(rep(wsA, 10, 5, false)).to.be.revertedWithCustomError(c, "NotVehicleOwner");
    });
    it("chỉ Workshop đóng yêu cầu; chủ xe tự đóng thì bị từ chối", async () => {
      await rep(owner1, 40, 10, false);
      await expect(c.connect(owner1).resolveRequest(VIN, Concl.NoFlood, H("r"))).to.be.revertedWithCustomError(c, "NotWorkshop");
      await expect(c.connect(insurer).resolveRequest(VIN, Concl.NoFlood, H("r"))).to.be.revertedWithCustomError(c, "NotWorkshop");
    });
    it("kết luận 'không ngập' đóng yêu cầu, không bật cờ", async () => {
      await rep(owner1, 40, 10, false);
      await c.connect(wsA).resolveRequest(VIN, Concl.NoFlood, H("r"));
      const v = await c.getVehicle(VIN);
      expect(v.openRequest).to.equal(Level.None);
      expect(v.flood).to.equal(false);
    });
    it("kết luận thủy kích bật cờ; không có yêu cầu mở thì không đóng được", async () => {
      await expect(c.connect(wsA).resolveRequest(VIN, Concl.Hydrolock, H("r"))).to.be.revertedWithCustomError(c, "NoOpenRequest");
      await rep(owner1, 10, 5, true);
      await c.connect(wsA).resolveRequest(VIN, Concl.Hydrolock, H("r"));
      const v = await c.getVehicle(VIN);
      expect([v.flood, v.hydrolock, Number(v.openRequest)]).to.deep.equal([true, true, 0]);
    });
  });

  describe("Giao xe và bảo hành (tình huống C)", () => {
    beforeEach(async () => reg());
    it("handover tự đọc tem hiện tại làm tem lúc giao", async () => {
      await expect(c.connect(owner1).handover(VIN, owner2.address, 180, H("h"))).to.be.revertedWithCustomError(c, "NotWorkshop");
      await c.connect(wsA).handover(VIN, owner2.address, 180, H("h"));
      const v = await c.getVehicle(VIN);
      expect([v.owner, v.sealAtHandover, v.warrantyDays]).to.deep.equal([owner2.address, sn("S1"), 180n]);
      expect(await c.inWarranty(VIN)).to.equal(true);
    });
    it("yêu cầu trong hạn được ghi, không đổi cờ", async () => {
      await c.connect(wsA).handover(VIN, owner2.address, 180, H("h"));
      await time.increase(120 * 86400);
      await c.connect(owner2).claimWarranty(VIN, H("c"));
      expect((await c.getHistory(VIN)).at(-1).kind).to.equal(Kind.WarrantyClaim);
      expect((await c.getVehicle(VIN)).flood).to.equal(false);
    });
    it("ngày 200 với hạn 180 bị từ chối; chủ cũ và người lạ bị từ chối; chưa giao xe thì không có", async () => {
      await expect(c.connect(owner1).claimWarranty(VIN, H("c"))).to.be.revertedWithCustomError(c, "NoHandover");
      await c.connect(wsA).handover(VIN, owner2.address, 180, H("h"));
      await expect(c.connect(owner1).claimWarranty(VIN, H("c"))).to.be.revertedWithCustomError(c, "NotVehicleOwner");
      await time.increase(200 * 86400);
      expect(await c.inWarranty(VIN)).to.equal(false);
      await expect(c.connect(owner2).claimWarranty(VIN, H("c"))).to.be.revertedWithCustomError(c, "WarrantyExpired");
    });
    it("sự kiện sau ngày giao nằm sau mốc Handover trong dòng thời gian", async () => {
      await c.connect(wsA).handover(VIN, owner2.address, 180, H("h"));
      await time.increase(120 * 86400);
      await c.connect(insurer).reportFlood(VIN, FT.Hydrolock, BigInt(await time.latest()), H("f"));
      const ks = await kinds();
      expect(ks.indexOf(Kind.Flood)).to.be.greaterThan(ks.indexOf(Kind.Handover));
    });
  });

  describe("Đính chính (EventAmended)", () => {
    beforeEach(async () => { await reg(); await c.connect(insurer).reportFlood(VIN, FT.Floor, 0, H("f")); });
    const floodIdx = 2;
    it("cần bên ghi gốc đề xuất và một thành viên khác ký; sự kiện cũ vẫn còn", async () => {
      await c.connect(insurer).proposeAmend(VIN, floodIdx, H("correction"));
      expect(await c.isAmended(VIN, floodIdx)).to.equal(false);
      await expect(c.connect(insurer).coSignAmend(0)).to.be.revertedWithCustomError(c, "NeedOtherMember");
      await expect(c.connect(stranger).coSignAmend(0)).to.be.revertedWithCustomError(c, "NotMember");
      await c.connect(wsB).coSignAmend(0);
      expect(await c.isAmended(VIN, floodIdx)).to.equal(true);
      const h = await c.getHistory(VIN);
      expect(Number(h[floodIdx].kind)).to.equal(Kind.Flood); // còn nguyên
      expect(Number(h.at(-1).kind)).to.equal(Kind.Amendment);
      expect(h.at(-1).num).to.equal(BigInt(floodIdx));
      expect((await c.getVehicle(VIN)).flood).to.equal(true); // đính chính không tắt cờ
    });
    it("bên khác không đề xuất thay bên ghi gốc; chỉ số sai bị từ chối; không đính chính hai lần", async () => {
      await expect(c.connect(wsA).proposeAmend(VIN, floodIdx, H("x"))).to.be.revertedWithCustomError(c, "NotOriginalActor");
      await expect(c.connect(insurer).proposeAmend(VIN, 99, H("x"))).to.be.revertedWithCustomError(c, "BadRecordIndex");
      await expect(c.connect(stranger).proposeAmend(VIN, floodIdx, H("x"))).to.be.revertedWithCustomError(c, "NotMember");
      await c.connect(insurer).proposeAmend(VIN, floodIdx, H("c1"));
      await c.connect(wsB).coSignAmend(0);
      await expect(c.connect(insurer).proposeAmend(VIN, floodIdx, H("c2"))).to.be.revertedWithCustomError(c, "AlreadyAmended");
      await expect(c.connect(wsB).coSignAmend(0)).to.be.revertedWithCustomError(c, "AmendClosed");
    });
  });


  describe("Tiếp nhận / bàn giao (Đợt 1)", () => {
    beforeEach(async () => reg());
    const custodian = async () => (await c.getVehicle(VIN)).custodian;

    it("Workshop đăng ký xe mặc nhiên đang giữ xe; bàn giao thì hết quyền ghi", async () => {
      expect(await custodian()).to.equal(wsA.address);
      await c.connect(wsA).checkOut(VIN, H("out"));
      expect(await custodian()).to.equal(ethers.ZeroAddress);
      await expect(c.connect(wsA).reportFlood(VIN, FT.Floor, 0, H("f"))).to.be.revertedWithCustomError(c, "NotInCustody");
      await expect(c.connect(wsA).breakSeal(VIN, sn("S1"), BR.Maintenance, H("b"))).to.be.revertedWithCustomError(c, "NotInCustody");
      expect((await c.getHistory(VIN)).at(-1).kind).to.equal(Kind.CheckOut);
    });
    it("gara ghi khống xe không ở xưởng mình: mọi hàm ghi của Workshop đều bị chặn", async () => {
      await c.connect(owner1).ownerReport(VIN, 40, 10, false, 0, H("o"));
      const calls = [
        () => c.connect(wsB).reportFlood(VIN, FT.Hydrolock, 0, H("x")),
        () => c.connect(wsB).breakSeal(VIN, sn("S1"), BR.FloodRepair, H("x")),
        () => c.connect(wsB).applySeal(VIN, sn("S2"), H("x")),
        () => c.connect(wsB).repairCompleted(VIN, ZERO, H("x")),
        () => c.connect(wsB).resolveRequest(VIN, Concl.Hydrolock, H("x")),
        () => c.connect(wsB).handover(VIN, owner2.address, 30, H("x")),
        () => c.connect(wsB).reinspect(VIN, Concl.NoFlood, sn("S3"), H("x")),
      ];
      for (const f of calls) await expect(f()).to.be.revertedWithCustomError(c, "NotInCustody");
      expect((await c.getVehicle(VIN)).hydrolock).to.equal(false);
    });
    it("chủ xe ký tiếp nhận cho đúng một Workshop; Workshop đó ghi được, Workshop cũ thì không", async () => {
      await c.connect(owner1).checkIn(VIN, wsB.address, H("phieu"));
      expect(await custodian()).to.equal(wsB.address);
      const r = (await c.getHistory(VIN)).at(-1);
      expect([Number(r.kind), r.actor, Number(r.sub)]).to.deep.equal([Kind.CheckIn, wsB.address, 0]);
      await c.connect(wsB).reportFlood(VIN, FT.Engine, 0, H("f"));
      await expect(c.connect(wsA).reportFlood(VIN, FT.Engine, 0, H("f"))).to.be.revertedWithCustomError(c, "NotInCustody");
    });
    it("chỉ chủ xe ký tiếp nhận; đích phải là Workshop", async () => {
      await expect(c.connect(stranger).checkIn(VIN, wsB.address, H("p"))).to.be.revertedWithCustomError(c, "NotVehicleOwner");
      await expect(c.connect(wsB).checkIn(VIN, wsB.address, H("p"))).to.be.revertedWithCustomError(c, "NotVehicleOwner");
      await expect(c.connect(owner1).checkIn(VIN, insurer.address, H("p"))).to.be.revertedWithCustomError(c, "InvalidRole");
      await expect(c.connect(owner1).checkIn(VIN, stranger.address, H("p"))).to.be.revertedWithCustomError(c, "InvalidRole");
    });
    it("bàn giao: Workshop đang giữ hoặc chủ xe; người khác bị từ chối; không ở xưởng thì báo lỗi", async () => {
      await expect(c.connect(wsB).checkOut(VIN, H("o"))).to.be.revertedWithCustomError(c, "NotCustodianOrOwner");
      await expect(c.connect(stranger).checkOut(VIN, H("o"))).to.be.revertedWithCustomError(c, "NotCustodianOrOwner");
      await c.connect(owner1).checkOut(VIN, H("o")); // chủ xe nhận xe về
      await expect(c.connect(owner1).checkOut(VIN, H("o"))).to.be.revertedWithCustomError(c, "NotInGarage");
    });
    it("giao xe kèm bảo hành đồng thời bàn giao xe", async () => {
      await c.connect(wsA).handover(VIN, owner2.address, 180, H("h"));
      expect(await custodian()).to.equal(ethers.ZeroAddress);
    });
    it("Insurer và Inspector ghi được khi xe không ở xưởng nào", async () => {
      await c.connect(wsA).checkOut(VIN, H("o"));
      await c.connect(insurer).reportFlood(VIN, FT.Hydrolock, 0, H("f"));
      await c.connect(inspector).inspectionCheckpoint(VIN, 1000, sn("S1"), H("i"));
      expect((await c.getVehicle(VIN)).hydrolock).to.equal(true);
    });
  });

  describe("Tiếp nhận bằng phiếu giấy (chủ xe không có ví)", () => {
    beforeEach(async () => { await reg(); await c.connect(wsA).checkOut(VIN, H("o")); });

    it("Workshop đề xuất kèm hash phiếu; thành viên khác xác nhận thì Workshop mới giữ xe", async () => {
      await c.connect(wsB).proposeCheckIn(VIN, H("phieu-giay"));
      expect((await c.getVehicle(VIN)).custodian).to.equal(ethers.ZeroAddress); // chưa xác nhận
      await expect(c.connect(wsB).reportFlood(VIN, FT.Floor, 0, H("f"))).to.be.revertedWithCustomError(c, "NotInCustody");
      await c.connect(insurer).confirmCheckIn(0);
      expect((await c.getVehicle(VIN)).custodian).to.equal(wsB.address);
      const r = (await c.getHistory(VIN)).at(-1);
      expect([Number(r.kind), r.actor, Number(r.sub), r.dataHash]).to.deep.equal([Kind.CheckIn, wsB.address, 1, H("phieu-giay")]);
    });
    it("Workshop không tự xác nhận phiếu của mình; người ngoài không xác nhận; không xác nhận hai lần", async () => {
      await c.connect(wsB).proposeCheckIn(VIN, H("p"));
      await expect(c.connect(wsB).confirmCheckIn(0)).to.be.revertedWithCustomError(c, "NeedOtherMember");
      await expect(c.connect(owner1).confirmCheckIn(0)).to.be.revertedWithCustomError(c, "NotMember");
      await c.connect(wsA).confirmCheckIn(0);
      await expect(c.connect(inspector).confirmCheckIn(0)).to.be.revertedWithCustomError(c, "CheckInClosed");
      expect(await c.paperCheckInCount()).to.equal(1n);
    });
    it("chỉ Workshop đề xuất phiếu; phiếu rỗng bị từ chối", async () => {
      await expect(c.connect(insurer).proposeCheckIn(VIN, H("p"))).to.be.revertedWithCustomError(c, "NotWorkshop");
      await expect(c.connect(wsB).proposeCheckIn(VIN, ZERO)).to.be.revertedWithCustomError(c, "EmptyInput");
    });
    it("Workshop bị thu hồi quyền trước khi phiếu được xác nhận thì phiếu không còn hiệu lực", async () => {
      await c.connect(wsB).proposeCheckIn(VIN, H("p"));
      await c.connect(council[0]).proposeRevokeMember(wsB.address);
      const id = (await c.proposalCount()) - 1n;
      await c.connect(council[1]).approveProposal(id);
      await c.connect(council[2]).approveProposal(id);
      await expect(c.connect(insurer).confirmCheckIn(0)).to.be.revertedWithCustomError(c, "InvalidRole");
    });
  });

  describe("Lý do phá tem và niêm phong lại sau kiểm tra", () => {
    beforeEach(async () => reg());

    it("lý do phá tem được lưu ở sub; lý do 'ngoài hệ thống' không gọi trực tiếp được", async () => {
      await expect(c.connect(wsA).breakSeal(VIN, sn("S1"), BR.Unrecorded, H("r"))).to.be.revertedWithCustomError(c, "InvalidReason");
      await c.connect(wsA).breakSeal(VIN, sn("S1"), BR.Maintenance, H("thay gioang"));
      const r = (await c.getHistory(VIN)).at(-1);
      expect([Number(r.kind), Number(r.sub)]).to.deep.equal([Kind.SealBroken, BR.Maintenance]);
      expect((await c.getVehicle(VIN)).flood).to.equal(false); // bảo dưỡng không bật cờ ngập
    });
    it("niêm phong lại: tem cũ ghi 'phá ngoài hệ thống', bật cờ mở máy, ghi kết luận, đặt tem mới", async () => {
      // chủ xe thay gioăng ở gara ngoài, tem S1 bị bóc; mang xe tới gara thành viên wsB
      await c.connect(wsA).checkOut(VIN, H("o"));
      await c.connect(owner1).checkIn(VIN, wsB.address, H("p"));
      await c.connect(wsB).reinspect(VIN, Concl.NoFlood, sn("S2"), H("kiem tra lai"));
      const v = await c.getVehicle(VIN);
      expect([v.unrecordedOpening, v.flood, v.currentSeal]).to.deep.equal([true, false, sn("S2")]);
      expect((await c.getSeal(sn("S1"))).state).to.equal(3); // Broken
      const h = await c.getHistory(VIN);
      const kinds = h.slice(-3).map((r) => Number(r.kind));
      expect(kinds).to.deep.equal([Kind.SealBroken, Kind.Reinspection, Kind.SealApplied]);
      expect(Number(h.at(-3).sub)).to.equal(BR.Unrecorded);
    });
    it("niêm phong lại với kết luận thủy kích thì bật cờ; tem mới phải hợp lệ", async () => {
      await expect(c.connect(wsA).reinspect(VIN, Concl.NoFlood, ZERO, H("x"))).to.be.revertedWithCustomError(c, "EmptyInput");
      await expect(c.connect(wsA).reinspect(VIN, Concl.NoFlood, sn("CHUA-PHAT-HANH"), H("x"))).to.be.revertedWithCustomError(c, "SealNotAvailable");
      await c.connect(wsA).reinspect(VIN, Concl.Hydrolock, sn("S2"), H("x"));
      const v = await c.getVehicle(VIN);
      expect([v.flood, v.hydrolock, v.unrecordedOpening]).to.deep.equal([true, true, true]);
    });
    it("niêm phong lại khi hồ sơ đã không còn tem (đã phá hợp lệ trước đó)", async () => {
      await c.connect(wsA).breakSeal(VIN, sn("S1"), BR.NonFloodRepair, H("r"));
      await c.connect(wsA).reinspect(VIN, Concl.NoFlood, sn("S2"), H("x"));
      expect((await c.getVehicle(VIN)).currentSeal).to.equal(sn("S2"));
    });
  });

  describe("Kịch bản sửa lén (T5)", () => {
    it("bóc tem ngoài hệ thống → Inspector thấy mất tem → cờ bật; checkSeal báo không khớp", async () => {
      await reg();
      await c.connect(insurer).reportFlood(VIN, FT.Hydrolock, 0, H("f"));
      await c.connect(wsA).breakSeal(VIN, sn("S1"), BR.FloodRepair, H("open"));
      await c.connect(wsA).repairCompleted(VIN, sn("S2"), H("done"));
      // chủ xe mở máy ở gara ngoài, bóc tem S2 không dán lại (không có sự kiện nào trên chuỗi)
      expect((await c.checkSeal(VIN, ZERO)).match_).to.equal(false);
      expect((await c.checkSeal(VIN, sn("S2"))).match_).to.equal(true); // tem còn thì khớp
      await c.connect(inspector).inspectionCheckpoint(VIN, 30000, ZERO, H("insp"));
      expect((await c.getVehicle(VIN)).unrecordedOpening).to.equal(true);
    });
  });

  it("tổng số bản ghi chỉ tăng", async () => {
    await reg();
    const n0 = (await c.getHistory(VIN)).length;
    await c.connect(insurer).reportFlood(VIN, FT.Floor, 0, H("f"));
    await c.connect(owner1).ownerReport(VIN, 10, 5, false, 0, H("o"));
    expect((await c.getHistory(VIN)).length).to.equal(n0 + 2);
  });
});
