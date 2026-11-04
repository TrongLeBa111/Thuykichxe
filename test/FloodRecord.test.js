const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const sn = (s) => ethers.id("seal:" + s);
const en = (s) => ethers.id("engine:" + s);
const H = (s) => ethers.id("doc:" + s);
const vh = (vin) => ethers.id(vin.trim().toUpperCase());
const Role = { None: 0, Council: 1, Attester: 2 };
const Kind = { Registered: 0, Flood: 1, Repair: 2, TotalLoss: 3, Inspection: 4, SealChange: 5, EngineChange: 6, Transfer: 7, OwnerReport: 8, WarrantyClaim: 9, Amendment: 10 };
const FT = { Floor: 0, Engine: 1, Hydrolock: 2 };
const Concl = { NotAssessed: 0, NoFlood: 1, Floor: 2, Engine: 3, Hydrolock: 4 };
const Level = { None: 0, Watch: 1, Inspect: 2, Urgent: 3 };
const SR = { Maintenance: 0, NonFloodRepair: 1, FloodRepair: 2, EngineReplacement: 3, Unrecorded: 4 };
const ZERO = ethers.ZeroHash;

describe("FloodRecord (lõi gọn: Hội đồng + Đơn vị xác nhận + Chủ xe)", () => {
  let c, council, attA, attB, owner1, owner2, stranger;
  const VIN = vh("ABC");

  beforeEach(async () => {
    const s = await ethers.getSigners();
    council = s.slice(0, 4);
    [attA, attB, owner1, owner2, stranger] = s.slice(4, 9);
    c = await (await ethers.getContractFactory("FloodRecord")).deploy(council.map((x) => x.address));
    for (const who of [attA, attB]) {
      await c.connect(council[0]).proposeAddMember(who.address, Role.Attester);
      const id = (await c.proposalCount()) - 1n;
      await c.connect(council[1]).approveProposal(id);
      await c.connect(council[2]).approveProposal(id);
    }
  });

  const reg = (vin = VIN, serial = "S1", owner = owner1, engine = "E1") =>
    c.connect(attA).registerVehicle(vin, owner.address, serial ? sn(serial) : ZERO, engine ? en(engine) : ZERO, H("reg"));
  const kinds = async (vin = VIN) => (await c.getHistory(vin)).map((r) => Number(r.kind));
  const last = async (vin = VIN) => { const h = await c.getHistory(vin); return h[h.length - 1]; };

  describe("Hội đồng 2/3", () => {
    it("quyền ghi chỉ có sau khi đủ 2/3 phiếu", async () => {
      await c.connect(council[0]).proposeAddMember(stranger.address, Role.Attester);
      const id = (await c.proposalCount()) - 1n;
      await c.connect(council[1]).approveProposal(id);
      expect(await c.roles(stranger.address)).to.equal(Role.None); // 2/4 chưa đủ
      await c.connect(council[2]).approveProposal(id);
      expect(await c.roles(stranger.address)).to.equal(Role.Attester); // 3/4 ≥ 2/3
    });
    it("đơn vị xác nhận không tự cấp quyền; người ngoài không ghi được", async () => {
      await expect(c.connect(attA).proposeAddMember(stranger.address, Role.Attester)).to.be.revertedWithCustomError(c, "NotCouncil");
      await expect(c.connect(stranger).registerVehicle(VIN, owner1.address, sn("S1"), ZERO, H("x"))).to.be.revertedWithCustomError(c, "NotAttester");
    });
    it("hội đồng không ghi dữ liệu xe (tách quyền cấp phép và quyền ghi)", async () => {
      await expect(c.connect(council[0]).registerVehicle(VIN, owner1.address, ZERO, ZERO, H("x"))).to.be.revertedWithCustomError(c, "NotAttester");
    });
    it("không bỏ phiếu hai lần; đề xuất đã chạy thì đóng", async () => {
      await c.connect(council[0]).proposeAddMember(stranger.address, Role.Attester);
      const id = (await c.proposalCount()) - 1n;
      await expect(c.connect(council[0]).approveProposal(id)).to.be.revertedWithCustomError(c, "AlreadyVoted");
      await c.connect(council[1]).approveProposal(id);
      await c.connect(council[2]).approveProposal(id);
      await expect(c.connect(council[3]).approveProposal(id)).to.be.revertedWithCustomError(c, "ProposalClosed");
    });
    it("thu hồi quyền cần 2/3; bản ghi cũ vẫn còn", async () => {
      await reg();
      await c.connect(council[0]).proposeRevokeMember(attA.address);
      const id = (await c.proposalCount()) - 1n;
      await c.connect(council[1]).approveProposal(id);
      await c.connect(council[2]).approveProposal(id);
      await expect(reg(vh("NEW"), "S2")).to.be.revertedWithCustomError(c, "NotAttester");
      expect((await c.getHistory(VIN)).length).to.equal(1);
    });
    it("đổi ngưỡng cần 2/3; ngưỡng 0 bị từ chối; không bỏ hội đồng cuối", async () => {
      await expect(c.connect(council[0]).proposeThresholds(0, 30)).to.be.revertedWithCustomError(c, "InvalidThreshold");
      await c.connect(council[0]).proposeThresholds(50, 60);
      const id = (await c.proposalCount()) - 1n;
      await c.connect(council[1]).approveProposal(id);
      await c.connect(council[2]).approveProposal(id);
      expect(await c.depthThreshold()).to.equal(50);
      const solo = await (await ethers.getContractFactory("FloodRecord")).deploy([council[0].address]);
      await expect(solo.connect(council[0]).proposeRevokeMember(council[0].address)).to.be.revertedWithCustomError(solo, "CannotRemoveLastCouncil");
    });
  });

  describe("Đăng ký xe và tem", () => {
    it("đăng ký ghi tem và số máy; mã xe trùng bị từ chối", async () => {
      await reg();
      const v = await c.getVehicle(VIN);
      expect(v.currentSeal).to.equal(sn("S1"));
      expect(v.engineHash).to.equal(en("E1"));
      expect(await kinds()).to.deep.equal([Kind.Registered]);
      await expect(reg(VIN, "S2")).to.be.revertedWithCustomError(c, "VehicleExists");
    });
    it("có thể đăng ký xe chưa có tem, chưa có số máy", async () => {
      await reg(VIN, null, owner1, null);
      expect((await c.getVehicle(VIN)).currentSeal).to.equal(ZERO);
    });
    it("mỗi số tem chỉ dùng cho một xe, một lần", async () => {
      await reg();
      await expect(reg(vh("OTHER"), "S1")).to.be.revertedWithCustomError(c, "SealAlreadyUsed");
      await c.connect(attA).changeSeal(VIN, sn("S2"), SR.Maintenance, H("m"));
      await expect(c.connect(attA).changeSeal(VIN, sn("S1"), SR.Maintenance, H("m"))).to.be.revertedWithCustomError(c, "SealAlreadyUsed"); // tem cũ không quay lại
    });
    it("thay tem: ghi lý do, tem cuối cập nhật, đối chiếu đúng/sai", async () => {
      await reg();
      await c.connect(attA).changeSeal(VIN, sn("S2"), SR.FloodRepair, H("m"));
      const r = await last();
      expect(Number(r.kind)).to.equal(Kind.SealChange);
      expect(Number(r.sub)).to.equal(SR.FloodRepair);
      expect(r.actor).to.equal(attA.address);
      expect((await c.checkSeal(VIN, sn("S2"))).match_).to.equal(true);
      expect((await c.checkSeal(VIN, sn("S1"))).match_).to.equal(false);
    });
    it("lý do 'đã mở ngoài hệ thống' không chọn tay được; tem rỗng bị từ chối; chỉ đơn vị xác nhận thay", async () => {
      await reg();
      await expect(c.connect(attA).changeSeal(VIN, sn("S2"), SR.Unrecorded, H("m"))).to.be.revertedWithCustomError(c, "InvalidReason");
      await expect(c.connect(attA).changeSeal(VIN, ZERO, SR.Maintenance, H("m"))).to.be.revertedWithCustomError(c, "EmptyInput");
      await expect(c.connect(owner1).changeSeal(VIN, sn("S2"), SR.Maintenance, H("m"))).to.be.revertedWithCustomError(c, "NotAttester");
    });
  });

  describe("Ghi nhận ngập và cờ một chiều", () => {
    beforeEach(reg);
    it("thủy kích bật cả cờ ngập lẫn cờ thủy kích; ngập sàn chỉ bật cờ ngập", async () => {
      const now = BigInt(await time.latest());
      await c.connect(attA).reportFlood(VIN, FT.Floor, now, H("f"));
      let v = await c.getVehicle(VIN);
      expect([v.flood, v.hydrolock]).to.deep.equal([true, false]);
      await c.connect(attB).reportFlood(VIN, FT.Hydrolock, now, H("h"));
      v = await c.getVehicle(VIN);
      expect([v.flood, v.hydrolock]).to.deep.equal([true, true]);
    });
    it("không ghi thời điểm tương lai; xe chưa đăng ký bị từ chối", async () => {
      const future = BigInt(await time.latest()) + 99999n;
      await expect(c.connect(attA).reportFlood(VIN, FT.Floor, future, H("f"))).to.be.revertedWithCustomError(c, "FutureTime");
      await expect(c.connect(attA).reportFlood(vh("NONE"), FT.Floor, 1, H("f"))).to.be.revertedWithCustomError(c, "VehicleNotFound");
    });
    it("sửa xong không xóa cờ; chưa ngập thì chưa 'sửa xong'; có thể kèm tem mới", async () => {
      await expect(c.connect(attA).repairCompleted(VIN, ZERO, H("r"))).to.be.revertedWithCustomError(c, "NoFloodFlag");
      await c.connect(attA).reportFlood(VIN, FT.Engine, 1, H("f"));
      await c.connect(attB).repairCompleted(VIN, sn("S2"), H("r"));
      const v = await c.getVehicle(VIN);
      expect(v.flood).to.equal(true);
      expect(v.currentSeal).to.equal(sn("S2"));
      expect(await kinds()).to.deep.equal([Kind.Registered, Kind.Flood, Kind.Repair, Kind.SealChange]);
    });
    it("tổn thất toàn bộ bật cờ riêng", async () => {
      await c.connect(attA).declareTotalLoss(VIN, H("t"));
      expect((await c.getVehicle(VIN)).totalLoss).to.equal(true);
    });
    it("không có hàm xóa hay sửa trong giao diện hợp đồng", async () => {
      const names = c.interface.fragments.filter((f) => f.type === "function").map((f) => f.name);
      expect(names.filter((n) => /delete|remove|clear|reset|unset|edit/i.test(n))).to.deep.equal([]);
    });
  });

  describe("Kiểm tra xe (inspect)", () => {
    beforeEach(reg);
    it("tem khớp: ghi km, không bật cờ mở máy", async () => {
      await c.connect(attA).inspect(VIN, 12000, sn("S1"), Concl.NotAssessed, ZERO, H("i"));
      const r = await last();
      expect(Number(r.kind)).to.equal(Kind.Inspection);
      expect(Number(r.sub)).to.equal(0);
      expect(r.num).to.equal(12000n);
      expect((await c.getVehicle(VIN)).unrecordedOpening).to.equal(false);
    });
    it("tem không khớp hoặc mất tem: bật cờ mở máy không ghi nhận (một chiều)", async () => {
      await c.connect(attA).inspect(VIN, 1, sn("LA"), Concl.NotAssessed, ZERO, H("i"));
      expect(Number((await last()).sub)).to.equal(0x10);
      expect((await c.getVehicle(VIN)).unrecordedOpening).to.equal(true);
      await c.connect(attA).inspect(VIN, 2, sn("S1"), Concl.NotAssessed, ZERO, H("i")); // khớp lại cũng không tắt cờ
      expect((await c.getVehicle(VIN)).unrecordedOpening).to.equal(true);
    });
    it("kiểm tra lại: kết luận + tem mới trong một lần ghi (lý do Unrecorded)", async () => {
      await c.connect(attA).inspect(VIN, 1, ZERO, Concl.NoFlood, sn("S2"), H("i"));
      const h = await c.getHistory(VIN);
      expect(h.map((r) => Number(r.kind))).to.deep.equal([Kind.Registered, Kind.Inspection, Kind.SealChange]);
      expect(Number(h[1].sub)).to.equal(Concl.NoFlood | 0x10);
      expect(Number(h[2].sub)).to.equal(SR.Unrecorded);
      const v = await c.getVehicle(VIN);
      expect([v.unrecordedOpening, v.flood, v.currentSeal]).to.deep.equal([true, false, sn("S2")]);
    });
    it("tem khớp mà thay tem mới: lý do bảo dưỡng", async () => {
      await c.connect(attA).inspect(VIN, 1, sn("S1"), Concl.NoFlood, sn("S2"), H("i"));
      expect(Number((await last()).sub)).to.equal(SR.Maintenance);
    });
    it("kết luận ngập bật cờ; kết luận không ngập không bật", async () => {
      await c.connect(attA).inspect(VIN, 1, sn("S1"), Concl.NoFlood, ZERO, H("i"));
      expect((await c.getVehicle(VIN)).flood).to.equal(false);
      await c.connect(attB).inspect(VIN, 2, sn("S1"), Concl.Hydrolock, ZERO, H("i"));
      const v = await c.getVehicle(VIN);
      expect([v.flood, v.hydrolock]).to.deep.equal([true, true]);
    });
    it("kết luận đóng yêu cầu của chủ xe, NotAssessed thì không", async () => {
      await c.connect(owner1).ownerReport(VIN, 50, 10, false, 1, H("o"));
      await c.connect(attA).inspect(VIN, 1, sn("S1"), Concl.NotAssessed, ZERO, H("i"));
      expect(Number((await c.getVehicle(VIN)).openRequest)).to.equal(Level.Inspect);
      await c.connect(attA).inspect(VIN, 2, sn("S1"), Concl.NoFlood, ZERO, H("i"));
      expect(Number((await c.getVehicle(VIN)).openRequest)).to.equal(Level.None);
    });
  });

  describe("Thay động cơ", () => {
    beforeEach(reg);
    it("ghi hash số máy mới; cờ ngập không đổi", async () => {
      await c.connect(attA).reportFlood(VIN, FT.Hydrolock, 1, H("h"));
      await c.connect(attB).changeEngine(VIN, en("E2"), H("e"));
      const v = await c.getVehicle(VIN);
      expect(v.engineHash).to.equal(en("E2"));
      expect([v.flood, v.hydrolock]).to.deep.equal([true, true]);
      const r = await last();
      expect(Number(r.kind)).to.equal(Kind.EngineChange);
      expect(r.ref).to.equal(en("E2"));
    });
    it("số máy rỗng hoặc người không có quyền bị từ chối", async () => {
      await expect(c.connect(attA).changeEngine(VIN, ZERO, H("e"))).to.be.revertedWithCustomError(c, "EmptyInput");
      await expect(c.connect(owner1).changeEngine(VIN, en("E2"), H("e"))).to.be.revertedWithCustomError(c, "NotAttester");
    });
  });

  describe("Chủ xe khai báo", () => {
    beforeEach(reg);
    it("phân mức theo ngưỡng; khai báo không bật cờ", async () => {
      await c.connect(owner1).ownerReport(VIN, 10, 5, false, 1, H("o"));
      expect(Number((await c.getVehicle(VIN)).openRequest)).to.equal(Level.Watch);
      await c.connect(owner1).ownerReport(VIN, 40, 5, false, 1, H("o"));
      await c.connect(owner1).ownerReport(VIN, 10, 5, true, 1, H("o"));
      const v = await c.getVehicle(VIN);
      expect(Number(v.openRequest)).to.equal(Level.Urgent);
      expect(v.flood).to.equal(false);
    });
    it("chỉ chủ xe hiện tại; không ghi tương lai", async () => {
      await expect(c.connect(stranger).ownerReport(VIN, 1, 1, false, 1, H("o"))).to.be.revertedWithCustomError(c, "NotVehicleOwner");
      await expect(c.connect(owner1).ownerReport(VIN, 1, 1, false, BigInt(await time.latest()) + 9999n, H("o"))).to.be.revertedWithCustomError(c, "FutureTime");
    });
  });

  describe("Chuyển chủ", () => {
    beforeEach(reg);
    it("chủ xe ký chuyển; chủ mới có quyền, chủ cũ mất quyền", async () => {
      await c.connect(owner1).transfer(VIN, owner2.address, 0, H("t"));
      expect((await c.getVehicle(VIN)).owner).to.equal(owner2.address);
      expect(Number((await last()).kind)).to.equal(Kind.Transfer);
      await expect(c.connect(owner1).ownerReport(VIN, 1, 1, false, 1, H("o"))).to.be.revertedWithCustomError(c, "NotVehicleOwner");
      await c.connect(owner2).ownerReport(VIN, 1, 1, false, 1, H("o"));
    });
    it("chỉ chủ xe ký; không chuyển cho chính mình hoặc địa chỉ rỗng", async () => {
      await expect(c.connect(attA).transfer(VIN, owner2.address, 0, H("t"))).to.be.revertedWithCustomError(c, "NotVehicleOwner");
      await expect(c.connect(owner1).transfer(VIN, owner1.address, 0, H("t"))).to.be.revertedWithCustomError(c, "SameOwner");
      await expect(c.connect(owner1).transfer(VIN, ethers.ZeroAddress, 0, H("t"))).to.be.revertedWithCustomError(c, "EmptyInput");
    });
    it("cờ ngập, thủy kích, tổn thất toàn bộ đi theo xe qua nhiều chủ", async () => {
      await c.connect(attA).reportFlood(VIN, FT.Hydrolock, 1, H("h"));
      await c.connect(attA).declareTotalLoss(VIN, H("t"));
      await c.connect(owner1).transfer(VIN, attB.address, 0, H("thanh-ly")); // thanh lý cho đơn vị thu mua
      await c.connect(attB).transfer(VIN, owner2.address, 0, H("ban-lai"));
      const v = await c.getVehicle(VIN);
      expect([v.flood, v.hydrolock, v.totalLoss]).to.deep.equal([true, true, true]);
      expect(await kinds()).to.deep.equal([Kind.Registered, Kind.Flood, Kind.TotalLoss, Kind.Transfer, Kind.Transfer]);
    });
    it("bảo hành: theo ngày chuyển, ghi tem lúc chuyển, hết hạn thì từ chối", async () => {
      await c.connect(owner1).transfer(VIN, owner2.address, 30, H("t"));
      expect((await c.getVehicle(VIN)).sealAtHandover).to.equal(sn("S1"));
      expect(await c.inWarranty(VIN)).to.equal(true);
      await c.connect(owner2).claimWarranty(VIN, H("w"));
      expect(Number((await last()).kind)).to.equal(Kind.WarrantyClaim);
      await time.increase(31 * 86400);
      expect(await c.inWarranty(VIN)).to.equal(false);
      await expect(c.connect(owner2).claimWarranty(VIN, H("w"))).to.be.revertedWithCustomError(c, "WarrantyExpired");
    });
    it("chưa từng chuyển chủ thì không có bảo hành; người khác không đòi được", async () => {
      await expect(c.connect(owner1).claimWarranty(VIN, H("w"))).to.be.revertedWithCustomError(c, "NoHandover");
      await c.connect(owner1).transfer(VIN, owner2.address, 30, H("t"));
      await expect(c.connect(stranger).claimWarranty(VIN, H("w"))).to.be.revertedWithCustomError(c, "NotVehicleOwner");
    });
  });

  describe("Đính chính", () => {
    beforeEach(async () => { await reg(); await c.connect(attA).reportFlood(VIN, FT.Floor, 1, H("f")); });
    it("bên ghi gốc đề xuất, thành viên khác đồng ký; sự kiện cũ vẫn còn", async () => {
      await c.connect(attA).proposeAmend(VIN, 1, H("fix"));
      await expect(c.connect(attA).coSignAmend(0)).to.be.revertedWithCustomError(c, "NeedOtherMember");
      await c.connect(attB).coSignAmend(0);
      expect(await c.isAmended(VIN, 1)).to.equal(true);
      expect(await kinds()).to.deep.equal([Kind.Registered, Kind.Flood, Kind.Amendment]);
      expect((await c.getVehicle(VIN)).flood).to.equal(true); // đính chính không tắt cờ
    });
    it("chỉ bên ghi gốc đề xuất; không đính chính hai lần; chỉ số sai bị từ chối", async () => {
      await expect(c.connect(attB).proposeAmend(VIN, 1, H("fix"))).to.be.revertedWithCustomError(c, "NotOriginalActor");
      await expect(c.connect(stranger).proposeAmend(VIN, 1, H("fix"))).to.be.revertedWithCustomError(c, "NotMember");
      await expect(c.connect(attA).proposeAmend(VIN, 9, H("fix"))).to.be.revertedWithCustomError(c, "BadRecordIndex");
      await c.connect(attA).proposeAmend(VIN, 1, H("fix"));
      await c.connect(attB).coSignAmend(0);
      await expect(c.connect(attA).proposeAmend(VIN, 1, H("fix2"))).to.be.revertedWithCustomError(c, "AlreadyAmended");
    });
  });

  describe("Tra cứu", () => {
    it("vinHashOf khớp keccak256; xe chưa đăng ký trả về exists=false", async () => {
      expect(await c.vinHashOf("ABC")).to.equal(ethers.id("ABC"));
      expect((await c.getVehicle(vh("NONE"))).exists).to.equal(false);
    });
    it("hồ sơ nối thêm, thứ tự giữ nguyên, ghi người ghi và thời điểm", async () => {
      await reg();
      await c.connect(attB).reportFlood(VIN, FT.Floor, 5, H("f"));
      const h = await c.getHistory(VIN);
      expect(h.length).to.equal(2);
      expect(h[1].actor).to.equal(attB.address);
      expect(h[1].occurredAt).to.equal(5n);
      expect(h[1].recordedAt).to.be.gt(0n);
    });
  });
});
