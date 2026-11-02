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
        Inspection, Handover, OwnerReport, Resolution, WarrantyClaim, Amendment
    }
    enum FloodType { Floor, Engine, Hydrolock }          // ngập sàn, ngập máy, thủy kích
    enum Conclusion { NoFlood, Floor, Engine, Hydrolock } // kết luận của Workshop khi đóng yêu cầu
    enum Level { None, Watch, Inspect, Urgent }          // mức khuyến nghị cho khai báo của chủ xe
    enum SealState { None, Issued, Applied, Broken }
    enum Action { AddMember, RevokeMember, SetThresholds }

    struct Vehicle {
        bool exists;
        address owner;
        bool flood;             // cờ một chiều
        bool hydrolock;         // cờ một chiều
        bool totalLoss;         // cờ một chiều
        bool unrecordedOpening; // cờ một chiều: tem thấy khi kiểm định không khớp hồ sơ
        Level openRequest;      // yêu cầu kiểm tra đang mở (do khai báo của chủ xe), chưa bật cờ
        bytes32 currentSeal;    // 0 nếu hiện không có tem trên hồ sơ
        uint64 handoverAt;
        uint32 warrantyDays;
        bytes32 sealAtHandover;
        bytes32 handoverHash;
    }

    /// sub: FloodType | Level | Conclusion | (Inspection: 1 nếu tem không khớp)
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

    // ───────────── Trạng thái ─────────────
    mapping(address => Role) public roles;
    uint16 public councilSize;
    uint32 public depthThreshold = 30; // cm
    uint32 public soakThreshold = 30;  // phút

    Proposal[] public proposals;
    mapping(uint256 => mapping(address => bool)) private voted;
    Amend[] public amends;

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

    // ───────────── Workshop ─────────────
    function registerVehicle(bytes32 vin, address owner, bytes32 serial, bytes32 docHash)
        external onlyRole(Role.Workshop, NotWorkshop.selector)
    {
        if (vin == bytes32(0) || owner == address(0)) revert EmptyInput();
        Vehicle storage v = vehicles[vin];
        if (v.exists) revert VehicleExists();
        v.exists = true;
        v.owner = owner;
        _push(vin, Kind.Registered, uint64(block.timestamp), 0, docHash, bytes32(0), 0);
        _applySeal(vin, v, serial, docHash);
    }

    function applySeal(bytes32 vin, bytes32 serial, bytes32 docHash)
        external onlyRole(Role.Workshop, NotWorkshop.selector)
    {
        _applySeal(vin, _vehicle(vin), serial, docHash);
    }

    function breakSeal(bytes32 vin, bytes32 serial, bytes32 reasonHash)
        external onlyRole(Role.Workshop, NotWorkshop.selector)
    {
        Vehicle storage v = _vehicle(vin);
        Seal storage s = seals[serial];
        if (s.state != SealState.Applied || s.vinHash != vin || v.currentSeal != serial) revert WrongSeal();
        s.state = SealState.Broken;
        v.currentSeal = bytes32(0);
        _push(vin, Kind.SealBroken, uint64(block.timestamp), 0, reasonHash, serial, 0);
    }

    /// @param newSerial 0 nếu không đặt tem mới ngay
    function repairCompleted(bytes32 vin, bytes32 newSerial, bytes32 docHash)
        external onlyRole(Role.Workshop, NotWorkshop.selector)
    {
        Vehicle storage v = _vehicle(vin);
        if (!v.flood) revert NoFloodFlag();
        _push(vin, Kind.Repair, uint64(block.timestamp), 0, docHash, newSerial, 0);
        if (newSerial != bytes32(0)) _applySeal(vin, v, newSerial, docHash);
    }

    /// @notice Workshop kiểm tra sau khai báo của chủ xe: đóng yêu cầu và ghi kết luận.
    function resolveRequest(bytes32 vin, Conclusion c, bytes32 docHash)
        external onlyRole(Role.Workshop, NotWorkshop.selector)
    {
        Vehicle storage v = _vehicle(vin);
        if (v.openRequest == Level.None) revert NoOpenRequest();
        if (c != Conclusion.NoFlood) {
            v.flood = true;
            if (c == Conclusion.Hydrolock) v.hydrolock = true;
        }
        v.openRequest = Level.None;
        _push(vin, Kind.Resolution, uint64(block.timestamp), uint8(c), docHash, v.currentSeal, 0);
    }

    function handover(bytes32 vin, address newOwner, uint32 warrantyDays, bytes32 docHash)
        external onlyRole(Role.Workshop, NotWorkshop.selector)
    {
        Vehicle storage v = _vehicle(vin);
        if (newOwner == address(0)) revert EmptyInput();
        v.owner = newOwner;
        v.handoverAt = uint64(block.timestamp);
        v.warrantyDays = warrantyDays;
        v.sealAtHandover = v.currentSeal; // hợp đồng tự đọc, không nhận từ người gọi
        v.handoverHash = docHash;
        _push(vin, Kind.Handover, uint64(block.timestamp), 0, docHash, v.currentSeal, warrantyDays);
    }

    // ───────────── Insurer / Workshop: ghi ngập ─────────────
    function reportFlood(bytes32 vin, FloodType t, uint64 occurredAt, bytes32 docHash) external {
        Role r = roles[msg.sender];
        if (r != Role.Insurer && r != Role.Workshop) revert NotInsurerOrWorkshop();
        Vehicle storage v = _vehicle(vin);
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
