// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title FloodRecord - lịch sử ngập nước / thủy kích / mở máy của ô tô theo VIN (proposal mục 5–7).
/// @notice Chỉ ghi thêm. Không có hàm xóa hay sửa sự kiện; cờ cảnh báo chỉ bật, không tắt.
///         Quyền ghi do hội đồng cấp theo 2/3. Khóa xe là vinHash = keccak256(VIN chuẩn hóa).
contract FloodRecord {
    // ───────────── Kiểu dữ liệu ─────────────
    enum Role { None, Council, Workshop, Insurer, Inspector }
    enum Kind {
        Registered, SealApplied, SealBroken, Flood, Repair, TotalLoss,
        Inspection, Handover, OwnerReport, Resolution, WarrantyClaim, Amendment,
        CheckIn, CheckOut, Reinspection
    }
    enum FloodType { Floor, Engine, Hydrolock }          // ngập sàn, ngập máy, thủy kích
    enum Conclusion { NoFlood, Floor, Engine, Hydrolock } // kết luận của Workshop khi đóng yêu cầu
    enum Level { None, Watch, Inspect, Urgent }          // mức khuyến nghị cho khai báo của chủ xe
    enum SealState { None, Issued, Applied, Broken }
    enum Action { AddMember, RevokeMember, SetThresholds }
    /// Lý do phá tem (chuẩn hóa). Unrecorded: tem đã bị mở ngoài hệ thống, chỉ ghi qua reinspect.
    enum BreakReason { Maintenance, NonFloodRepair, FloodRepair, EngineReplacement, Unrecorded }

    struct Vehicle {
        bool exists;
        address owner;
        bool flood;             // cờ một chiều
        bool hydrolock;         // cờ một chiều
        bool totalLoss;         // cờ một chiều
        bool unrecordedOpening; // cờ một chiều: tem thấy khi kiểm định không khớp hồ sơ
        Level openRequest;      // yêu cầu kiểm tra đang mở (do khai báo của chủ xe), chưa bật cờ
        bytes32 currentSeal;    // 0 nếu hiện không có tem trên hồ sơ
        address custodian;      // Workshop đang giữ xe (đã tiếp nhận); 0 nếu xe không ở xưởng nào
        uint64 handoverAt;
        uint32 warrantyDays;
        bytes32 sealAtHandover;
        bytes32 handoverHash;
    }

    /// sub: FloodType | Level | Conclusion | BreakReason (SealBroken) | (Inspection: 1 nếu tem không khớp) | (CheckIn: 0 chủ xe ký, 1 phiếu giấy)
    /// seal: số tem liên quan; num: km (Inspection), chỉ số bị đính chính (Amendment), số ngày bảo hành (Handover)
    struct Record {
        Kind kind;
        address actor;
        uint64 occurredAt;
        uint64 recordedAt;
        uint8 sub;
        bytes32 dataHash;
        bytes32 seal;
        uint64 num;
    }

    struct Seal { SealState state; bytes32 vinHash; }
    struct Proposal { Action action; address target; Role role; uint32 a; uint32 b; uint16 approvals; bool executed; }
    struct PaperCheckIn { bytes32 vinHash; address workshop; bytes32 paperHash; bool done; }
    struct Amend { bytes32 vinHash; uint32 index; bytes32 correctionHash; address proposer; bool done; }

    // ───────────── Lỗi ─────────────
    error NotCouncil();
    error NotWorkshop();
    error NotInsurer();
    error NotInspector();
    error NotInsurerOrWorkshop();
    error NotVehicleOwner();
    error NotMember();
    error AlreadyMember();
    error CannotRemoveLastCouncil();
    error InvalidRole();
    error InvalidThreshold();
    error ProposalClosed();
    error AlreadyVoted();
    error EmptyInput();
    error VehicleExists();
    error VehicleNotFound();
    error SealNotAvailable();
    error SealAlreadyOnVehicle();
    error WrongSeal();
    error FutureTime();
    error NoFloodFlag();
    error NoOpenRequest();
    error NoHandover();
    error WarrantyExpired();
    error BadRecordIndex();
    error NotOriginalActor();
    error NeedOtherMember();
    error AlreadyAmended();
    error AmendClosed();
    error NotInCustody();
    error NotInGarage();
    error NotCustodianOrOwner();
    error CheckInClosed();
    error InvalidReason();

    // ───────────── Trạng thái ─────────────
    mapping(address => Role) public roles;
    uint16 public councilSize;
    uint32 public depthThreshold = 30; // cm
    uint32 public soakThreshold = 30;  // phút

    Proposal[] public proposals;
    mapping(uint256 => mapping(address => bool)) private voted;
    Amend[] public amends;
    PaperCheckIn[] public paperCheckIns;

    mapping(bytes32 => Vehicle) private vehicles;
    mapping(bytes32 => Record[]) private records;
    mapping(bytes32 => mapping(uint256 => bool)) public isAmended;
    mapping(bytes32 => Seal) private seals;

    event RecordAdded(bytes32 indexed vinHash, Kind indexed kind, address indexed actor, uint8 sub, bytes32 dataHash);
    event MemberChanged(address indexed member, Role role);
    event ThresholdsChanged(uint32 depthCm, uint32 soakMin);
    event ProposalCreated(uint256 indexed id, Action action, address indexed proposer);
    event ProposalExecuted(uint256 indexed id);
    event SealsIssued(uint256 count);
    event AmendProposed(uint256 indexed id, bytes32 indexed vinHash, uint32 index, address proposer);
    event CheckInProposed(uint256 indexed id, bytes32 indexed vinHash, address workshop);
    event CheckInConfirmed(uint256 indexed id, address indexed coSigner);
    event AmendSigned(uint256 indexed id, address indexed coSigner);

    constructor(address[] memory initialCouncil) {
        if (initialCouncil.length == 0) revert EmptyInput();
        for (uint256 i = 0; i < initialCouncil.length; i++) {
            if (roles[initialCouncil[i]] != Role.None) revert AlreadyMember();
            roles[initialCouncil[i]] = Role.Council;
            emit MemberChanged(initialCouncil[i], Role.Council);
        }
        councilSize = uint16(initialCouncil.length);
    }

    modifier onlyRole(Role r, bytes4 err) {
        if (roles[msg.sender] != r) {
            assembly { mstore(0x00, err) revert(0x00, 0x04) }
        }
        _;
    }

    // ───────────── Hội đồng 2/3 ─────────────
    function proposeAddMember(address target, Role role) external returns (uint256 id) {
        _requireCouncil();
        if (role == Role.None) revert InvalidRole();
        if (roles[target] != Role.None) revert AlreadyMember();
        id = _propose(Action.AddMember, target, role, 0, 0);
    }

    function proposeRevokeMember(address target) external returns (uint256 id) {
        _requireCouncil();
        if (roles[target] == Role.None) revert NotMember();
        if (roles[target] == Role.Council && councilSize <= 1) revert CannotRemoveLastCouncil();
        id = _propose(Action.RevokeMember, target, Role.None, 0, 0);
    }

    function proposeThresholds(uint32 depthCm, uint32 soakMin) external returns (uint256 id) {
        _requireCouncil();
        if (depthCm == 0 || soakMin == 0) revert InvalidThreshold();
        id = _propose(Action.SetThresholds, address(0), Role.None, depthCm, soakMin);
    }

    function approveProposal(uint256 id) external {
        _requireCouncil();
        _approve(id);
    }

    function _requireCouncil() private view {
        if (roles[msg.sender] != Role.Council) revert NotCouncil();
    }

    function _propose(Action a, address target, Role role, uint32 x, uint32 y) private returns (uint256 id) {
        id = proposals.length;
        proposals.push(Proposal(a, target, role, x, y, 0, false));
        emit ProposalCreated(id, a, msg.sender);
        _approve(id); // người đề xuất mặc nhiên đồng ý
    }

    function _approve(uint256 id) private {
        Proposal storage p = proposals[id];
        if (p.executed) revert ProposalClosed();
        if (voted[id][msg.sender]) revert AlreadyVoted();
        voted[id][msg.sender] = true;
        p.approvals++;
        if (uint256(p.approvals) * 3 >= uint256(councilSize) * 2) _execute(id, p);
    }

    function _execute(uint256 id, Proposal storage p) private {
        if (p.action == Action.AddMember) {
            if (roles[p.target] != Role.None) revert AlreadyMember();
            roles[p.target] = p.role;
            if (p.role == Role.Council) councilSize++;
            emit MemberChanged(p.target, p.role);
        } else if (p.action == Action.RevokeMember) {
            Role cur = roles[p.target];
            if (cur == Role.None) revert NotMember();
            if (cur == Role.Council) {
                if (councilSize <= 1) revert CannotRemoveLastCouncil();
                councilSize--;
            }
            roles[p.target] = Role.None;
            emit MemberChanged(p.target, Role.None);
        } else {
            depthThreshold = p.a;
            soakThreshold = p.b;
            emit ThresholdsChanged(p.a, p.b);
        }
        p.executed = true;
        emit ProposalExecuted(id);
    }

    function proposalCount() external view returns (uint256) { return proposals.length; }
    function paperCheckInCount() external view returns (uint256) { return paperCheckIns.length; }

    /// @notice Hội đồng phát hành lô số sê-ri tem; mỗi số chỉ dùng một lần trên chuỗi.
    function issueSeals(bytes32[] calldata serials) external {
        _requireCouncil();
        for (uint256 i = 0; i < serials.length; i++) {
            if (serials[i] == bytes32(0) || seals[serials[i]].state != SealState.None) revert SealNotAvailable();
            seals[serials[i]].state = SealState.Issued;
        }
        emit SealsIssued(serials.length);
    }

    // ───────────── Nội bộ ─────────────
    function _vehicle(bytes32 vin) private view returns (Vehicle storage v) {
        v = vehicles[vin];
        if (!v.exists) revert VehicleNotFound();
    }

    function _push(bytes32 vin, Kind kind, uint64 occurredAt, uint8 sub, bytes32 dataHash, bytes32 seal, uint64 num) private {
        records[vin].push(Record(kind, msg.sender, occurredAt, uint64(block.timestamp), sub, dataHash, seal, num));
        emit RecordAdded(vin, kind, msg.sender, sub, dataHash);
    }

    function _applySeal(bytes32 vin, Vehicle storage v, bytes32 serial, bytes32 docHash) private {
        if (seals[serial].state != SealState.Issued) revert SealNotAvailable();
        if (v.currentSeal != bytes32(0)) revert SealAlreadyOnVehicle();
        seals[serial] = Seal(SealState.Applied, vin);
        v.currentSeal = serial;
        _push(vin, Kind.SealApplied, uint64(block.timestamp), 0, docHash, serial, 0);
    }

    // ───────────── Tiếp nhận / bàn giao (neo quyền ghi của Workshop vào việc xe đang ở xưởng) ─────────────
    /// @dev Chỉ Workshop đang giữ xe mới ghi sự kiện về xe đó. Insurer, Inspector không cần.
    function _requireCustody(Vehicle storage v) private view {
        if (v.custodian != msg.sender) revert NotInCustody();
    }

    function _pushAs(bytes32 vin, address actor, Kind kind, uint8 sub, bytes32 dataHash, uint64 num) private {
        records[vin].push(Record(kind, actor, uint64(block.timestamp), uint64(block.timestamp), sub, dataHash, bytes32(0), num));
        emit RecordAdded(vin, kind, actor, sub, dataHash);
    }

    /// @notice Chủ xe ký cho đúng một Workshop tiếp nhận xe (ví dụ quét QR tại quầy).
    /// Bản ghi CheckIn có actor = Workshop tiếp nhận, sub = 0 (chủ xe ký).
    function checkIn(bytes32 vin, address workshop, bytes32 docHash) external {
        Vehicle storage v = _vehicle(vin);
        if (msg.sender != v.owner) revert NotVehicleOwner();
        if (roles[workshop] != Role.Workshop) revert InvalidRole();
        v.custodian = workshop;
        _pushAs(vin, workshop, Kind.CheckIn, 0, docHash, 0);
    }

    /// @notice Đường dự phòng khi chủ xe không có ví: Workshop đề xuất kèm hash phiếu tiếp nhận giấy có chữ ký.
    function proposeCheckIn(bytes32 vin, bytes32 paperHash)
        external onlyRole(Role.Workshop, NotWorkshop.selector) returns (uint256 id)
    {
        _vehicle(vin);
        if (paperHash == bytes32(0)) revert EmptyInput();
        id = paperCheckIns.length;
        paperCheckIns.push(PaperCheckIn(vin, msg.sender, paperHash, false));
        emit CheckInProposed(id, vin, msg.sender);
    }

    /// @notice Một thành viên khác (không phải Workshop đề xuất) xác nhận phiếu giấy. sub = 1, num = mã phiếu.
    function confirmCheckIn(uint256 id) external {
        PaperCheckIn storage p = paperCheckIns[id];
        if (p.done) revert CheckInClosed();
        if (roles[msg.sender] == Role.None) revert NotMember();
        if (msg.sender == p.workshop) revert NeedOtherMember();
        if (roles[p.workshop] != Role.Workshop) revert InvalidRole(); // Workshop có thể đã bị thu hồi
        p.done = true;
        vehicles[p.vinHash].custodian = p.workshop;
        _pushAs(p.vinHash, p.workshop, Kind.CheckIn, 1, p.paperHash, uint64(id));
        emit CheckInConfirmed(id, msg.sender);
    }

    /// @notice Bàn giao xe ra khỏi xưởng: do Workshop đang giữ xe hoặc chủ xe (nhận xe về) ghi.
    function checkOut(bytes32 vin, bytes32 docHash) external {
        Vehicle storage v = _vehicle(vin);
        if (v.custodian == address(0)) revert NotInGarage();
        if (msg.sender != v.custodian && msg.sender != v.owner) revert NotCustodianOrOwner();
        v.custodian = address(0);
        _push(vin, Kind.CheckOut, uint64(block.timestamp), 0, docHash, bytes32(0), 0);
    }

    // ───────────── Workshop ─────────────
    /// @notice Đăng ký xe — Workshop đăng ký mặc nhiên đang giữ xe (xe đang ở đại lý/gara đó).
    function registerVehicle(bytes32 vin, address owner, bytes32 serial, bytes32 docHash)
        external onlyRole(Role.Workshop, NotWorkshop.selector)
    {
        if (vin == bytes32(0) || owner == address(0)) revert EmptyInput();
        Vehicle storage v = vehicles[vin];
        if (v.exists) revert VehicleExists();
        v.exists = true;
        v.owner = owner;
        v.custodian = msg.sender;
        _push(vin, Kind.Registered, uint64(block.timestamp), 0, docHash, bytes32(0), 0);
        _applySeal(vin, v, serial, docHash);
    }

    function applySeal(bytes32 vin, bytes32 serial, bytes32 docHash)
        external onlyRole(Role.Workshop, NotWorkshop.selector)
    {
        Vehicle storage v = _vehicle(vin);
        _requireCustody(v);
        _applySeal(vin, v, serial, docHash);
    }

    function _breakSeal(bytes32 vin, Vehicle storage v, bytes32 serial, BreakReason reason, bytes32 reasonHash) private {
        Seal storage s = seals[serial];
        if (s.state != SealState.Applied || s.vinHash != vin || v.currentSeal != serial) revert WrongSeal();
        s.state = SealState.Broken;
        v.currentSeal = bytes32(0);
        _push(vin, Kind.SealBroken, uint64(block.timestamp), uint8(reason), reasonHash, serial, 0);
    }

    /// @param reason lý do chuẩn hóa; `Unrecorded` chỉ dùng nội bộ khi kiểm tra lại
    function breakSeal(bytes32 vin, bytes32 serial, BreakReason reason, bytes32 reasonHash)
        external onlyRole(Role.Workshop, NotWorkshop.selector)
    {
        if (reason == BreakReason.Unrecorded) revert InvalidReason();
        Vehicle storage v = _vehicle(vin);
        _requireCustody(v);
        _breakSeal(vin, v, serial, reason, reasonHash);
    }

    /// @param newSerial 0 nếu không đặt tem mới ngay
    function repairCompleted(bytes32 vin, bytes32 newSerial, bytes32 docHash)
        external onlyRole(Role.Workshop, NotWorkshop.selector)
    {
        Vehicle storage v = _vehicle(vin);
        _requireCustody(v);
        if (!v.flood) revert NoFloodFlag();
        _push(vin, Kind.Repair, uint64(block.timestamp), 0, docHash, newSerial, 0);
        if (newSerial != bytes32(0)) _applySeal(vin, v, newSerial, docHash);
    }

    /// @notice Niêm phong lại sau kiểm tra: tem đã bị mở ngoài hệ thống (mất, rách, khác số).
    /// Gara đang giữ xe kiểm tra, ghi kết luận, đánh dấu tem cũ (nếu còn trên hồ sơ) là "phá ngoài
    /// hệ thống", rồi đặt tem mới. Cờ "mở máy không ghi nhận" bật (một chiều) vì đó là sự thật đã xảy ra;
    /// trang tra cứu hiện thêm kết luận kiểm tra lại để không xếp chung với xe sửa lén chưa kiểm tra.
    function reinspect(bytes32 vin, Conclusion c, bytes32 newSerial, bytes32 docHash)
        external onlyRole(Role.Workshop, NotWorkshop.selector)
    {
        Vehicle storage v = _vehicle(vin);
        _requireCustody(v);
        if (newSerial == bytes32(0)) revert EmptyInput();
        if (v.currentSeal != bytes32(0)) _breakSeal(vin, v, v.currentSeal, BreakReason.Unrecorded, docHash);
        v.unrecordedOpening = true;
        if (c != Conclusion.NoFlood) {
            v.flood = true;
            if (c == Conclusion.Hydrolock) v.hydrolock = true;
        }
        _push(vin, Kind.Reinspection, uint64(block.timestamp), uint8(c), docHash, newSerial, 0);
        _applySeal(vin, v, newSerial, docHash);
    }

    /// @notice Workshop kiểm tra sau khai báo của chủ xe: đóng yêu cầu và ghi kết luận.
    function resolveRequest(bytes32 vin, Conclusion c, bytes32 docHash)
        external onlyRole(Role.Workshop, NotWorkshop.selector)
    {
        Vehicle storage v = _vehicle(vin);
        _requireCustody(v);
        if (v.openRequest == Level.None) revert NoOpenRequest();
        if (c != Conclusion.NoFlood) {
            v.flood = true;
            if (c == Conclusion.Hydrolock) v.hydrolock = true;
        }
        v.openRequest = Level.None;
        _push(vin, Kind.Resolution, uint64(block.timestamp), uint8(c), docHash, v.currentSeal, 0);
    }

    /// @notice Giao xe kèm bảo hành; đồng thời là bàn giao xe ra khỏi xưởng.
    function handover(bytes32 vin, address newOwner, uint32 warrantyDays, bytes32 docHash)
        external onlyRole(Role.Workshop, NotWorkshop.selector)
    {
        Vehicle storage v = _vehicle(vin);
        _requireCustody(v);
        if (newOwner == address(0)) revert EmptyInput();
        v.owner = newOwner;
        v.custodian = address(0);
        v.handoverAt = uint64(block.timestamp);
        v.warrantyDays = warrantyDays;
        v.sealAtHandover = v.currentSeal; // hợp đồng tự đọc, không nhận từ người gọi
        v.handoverHash = docHash;
        _push(vin, Kind.Handover, uint64(block.timestamp), 0, docHash, v.currentSeal, warrantyDays);
    }

    // ───────────── Insurer / Workshop: ghi ngập ─────────────
    /// @notice Insurer ghi theo hồ sơ bồi thường (không cần tiếp nhận); Workshop phải đang giữ xe.
    function reportFlood(bytes32 vin, FloodType t, uint64 occurredAt, bytes32 docHash) external {
        Role r = roles[msg.sender];
        if (r != Role.Insurer && r != Role.Workshop) revert NotInsurerOrWorkshop();
        Vehicle storage v = _vehicle(vin);
        if (r == Role.Workshop) _requireCustody(v);
        if (occurredAt > block.timestamp) revert FutureTime();
        v.flood = true;
        if (t == FloodType.Hydrolock) v.hydrolock = true;
        _push(vin, Kind.Flood, occurredAt, uint8(t), docHash, bytes32(0), 0);
    }

    function declareTotalLoss(bytes32 vin, bytes32 docHash)
        external onlyRole(Role.Insurer, NotInsurer.selector)
    {
        Vehicle storage v = _vehicle(vin);
        v.totalLoss = true;
        _push(vin, Kind.TotalLoss, uint64(block.timestamp), 0, docHash, bytes32(0), 0);
    }

    // ───────────── Inspector ─────────────
    /// @param seenSerial số tem đọc được trên máy; 0 nếu không thấy tem
    function inspectionCheckpoint(bytes32 vin, uint64 km, bytes32 seenSerial, bytes32 docHash)
        external onlyRole(Role.Inspector, NotInspector.selector)
    {
        Vehicle storage v = _vehicle(vin);
        bool mismatch = seenSerial != v.currentSeal;
        if (mismatch) v.unrecordedOpening = true;
        _push(vin, Kind.Inspection, uint64(block.timestamp), mismatch ? 1 : 0, docHash, seenSerial, km);
    }

    // ───────────── Chủ xe ─────────────
    function classify(uint32 depthCm, uint32 soakMin, bool stalled) public view returns (Level) {
        if (stalled) return Level.Urgent;
        if (depthCm >= depthThreshold || soakMin >= soakThreshold) return Level.Inspect;
        return Level.Watch;
    }

    /// @notice Khai báo của chủ xe: tính mức khuyến nghị, mở yêu cầu kiểm tra; KHÔNG bật cờ.
    function ownerReport(bytes32 vin, uint32 depthCm, uint32 soakMin, bool stalled, uint64 occurredAt, bytes32 docHash)
        external returns (Level level)
    {
        Vehicle storage v = _vehicle(vin);
        if (msg.sender != v.owner) revert NotVehicleOwner();
        if (occurredAt > block.timestamp) revert FutureTime();
        level = classify(depthCm, soakMin, stalled);
        if (level > v.openRequest) v.openRequest = level;
        _push(vin, Kind.OwnerReport, occurredAt, uint8(level), docHash, bytes32(0), 0);
    }

    function _inWarranty(Vehicle storage v) private view returns (bool) {
        return v.handoverAt != 0 && block.timestamp <= uint256(v.handoverAt) + uint256(v.warrantyDays) * 1 days;
    }

    function claimWarranty(bytes32 vin, bytes32 docHash) external {
        Vehicle storage v = _vehicle(vin);
        if (msg.sender != v.owner) revert NotVehicleOwner();
        if (v.handoverAt == 0) revert NoHandover();
        if (!_inWarranty(v)) revert WarrantyExpired();
        _push(vin, Kind.WarrantyClaim, uint64(block.timestamp), 0, docHash, v.currentSeal, 0);
    }

    // ───────────── Đính chính: bên ghi gốc + một thành viên khác ─────────────
    function proposeAmend(bytes32 vin, uint32 index, bytes32 correctionHash) external returns (uint256 id) {
        _vehicle(vin);
        if (roles[msg.sender] == Role.None) revert NotMember();
        if (index >= records[vin].length) revert BadRecordIndex();
        if (records[vin][index].actor != msg.sender) revert NotOriginalActor();
        if (isAmended[vin][index]) revert AlreadyAmended();
        id = amends.length;
        amends.push(Amend(vin, index, correctionHash, msg.sender, false));
        emit AmendProposed(id, vin, index, msg.sender);
    }

    function coSignAmend(uint256 id) external {
        Amend storage a = amends[id];
        if (a.done) revert AmendClosed();
        if (roles[msg.sender] == Role.None) revert NotMember();
        if (msg.sender == a.proposer) revert NeedOtherMember();
        if (isAmended[a.vinHash][a.index]) revert AlreadyAmended();
        a.done = true;
        isAmended[a.vinHash][a.index] = true; // sự kiện cũ vẫn còn, chỉ được đánh dấu
        records[a.vinHash].push(Record(
            Kind.Amendment, a.proposer, uint64(block.timestamp), uint64(block.timestamp),
            0, a.correctionHash, bytes32(0), a.index
        ));
        emit RecordAdded(a.vinHash, Kind.Amendment, a.proposer, 0, a.correctionHash);
        emit AmendSigned(id, msg.sender);
    }

    // ───────────── View (miễn phí, không cần ví) ─────────────
    function vinHashOf(string calldata vin) external pure returns (bytes32) {
        return keccak256(bytes(vin));
    }
    function getVehicle(bytes32 vin) external view returns (Vehicle memory) { return vehicles[vin]; }
    function getHistory(bytes32 vin) external view returns (Record[] memory) { return records[vin]; }
    function recordCount(bytes32 vin) external view returns (uint256) { return records[vin].length; }
    function getSeal(bytes32 serial) external view returns (Seal memory) { return seals[serial]; }
    function inWarranty(bytes32 vin) external view returns (bool) { return _inWarranty(vehicles[vin]); }

    /// @notice Đối chiếu số tem đọc trên máy với tem hiện tại trên hồ sơ.
    function checkSeal(bytes32 vin, bytes32 seenSerial) external view returns (bool match_, bytes32 current) {
        current = vehicles[vin].currentSeal;
        match_ = current != bytes32(0) && current == seenSerial;
    }
}
