// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title FloodRecord - lịch sử ngập nước / thủy kích / thay tem / thay động cơ / chuyển chủ của ô tô theo VIN.
/// @notice Chỉ ghi thêm. Không có hàm xóa hay sửa sự kiện; cờ cảnh báo chỉ bật, không tắt.
///         Chỉ có hai nhóm thành viên: Hội đồng (cấp quyền theo 2/3) và Đơn vị xác nhận (gara, bảo hiểm,
///         đăng kiểm… — loại đơn vị nằm ở danh bạ ngoài chuỗi). Chủ xe là địa chỉ ghi trên hồ sơ xe.
///         Khóa xe là vinHash = keccak256(VIN chuẩn hóa).
contract FloodRecord {
    // ───────────── Kiểu dữ liệu ─────────────
    enum Role { None, Council, Attester }
    enum Kind {
        Registered, Flood, Repair, TotalLoss, Inspection, SealChange,
        EngineChange, Transfer, OwnerReport, WarrantyClaim, Amendment
    }
    enum FloodType { Floor, Engine, Hydrolock }                       // ngập sàn, ngập máy, thủy kích
    /// Kết luận khi kiểm tra xe. NotAssessed: chỉ đọc số liệu (km, tem), chưa kết luận về ngập.
    enum Conclusion { NotAssessed, NoFlood, Floor, Engine, Hydrolock }
    enum Level { None, Watch, Inspect, Urgent }                       // mức khuyến nghị cho khai báo của chủ xe
    enum Action { AddMember, RevokeMember, SetThresholds }
    /// Lý do đổi tem. Unrecorded: tem đã bị mở ngoài hệ thống, chỉ phát sinh qua `inspect`.
    enum SealReason { Maintenance, NonFloodRepair, FloodRepair, EngineReplacement, Unrecorded }

    struct Vehicle {
        bool exists;
        address owner;
        bool flood;             // cờ một chiều
        bool hydrolock;         // cờ một chiều
        bool totalLoss;         // cờ một chiều
        bool unrecordedOpening; // cờ một chiều: tem thấy khi kiểm tra không khớp hồ sơ
        Level openRequest;      // yêu cầu kiểm tra đang mở (do chủ xe khai báo), chưa bật cờ
        bytes32 currentSeal;    // 0 nếu hồ sơ không có tem
        bytes32 engineHash;     // hash số máy hiện tại (0 nếu chưa ghi)
        uint64 handoverAt;      // lần chuyển chủ gần nhất
        uint32 warrantyDays;
        bytes32 sealAtHandover;
    }

    /// sub: FloodType | Level (OwnerReport) | SealReason | Inspection: Conclusion + 0x10 nếu tem không khớp
    /// ref: số tem (Registered, Repair, SealChange, Inspection=tem đọc được, Transfer, WarrantyClaim) hoặc hash số máy (EngineChange)
    /// num: km (Inspection), chỉ số bị đính chính (Amendment), số ngày bảo hành (Transfer)
    struct Record {
        Kind kind;
        address actor;
        uint64 occurredAt;
        uint64 recordedAt;
        uint8 sub;
        bytes32 dataHash;
        bytes32 ref;
        uint64 num;
    }

    struct Proposal { Action action; address target; Role role; uint32 a; uint32 b; uint16 approvals; bool executed; }
    struct Amend { bytes32 vinHash; uint32 index; bytes32 correctionHash; address proposer; bool done; }

    // ───────────── Lỗi ─────────────
    error NotCouncil();
    error NotAttester();
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
    error SealAlreadyUsed();
    error FutureTime();
    error NoFloodFlag();
    error NoHandover();
    error WarrantyExpired();
    error BadRecordIndex();
    error NotOriginalActor();
    error NeedOtherMember();
    error AlreadyAmended();
    error AmendClosed();
    error InvalidReason();
    error SameOwner();

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
    /// số tem → xe đã dùng nó (mỗi số tem chỉ dùng cho một xe, một lần)
    mapping(bytes32 => bytes32) public sealVehicle;

    event RecordAdded(bytes32 indexed vinHash, Kind indexed kind, address indexed actor, uint8 sub, bytes32 dataHash);
    event MemberChanged(address indexed member, Role role);
    event ThresholdsChanged(uint32 depthCm, uint32 soakMin);
    event ProposalCreated(uint256 indexed id, Action action, address indexed proposer);
    event ProposalExecuted(uint256 indexed id);
    event AmendProposed(uint256 indexed id, bytes32 indexed vinHash, uint32 index, address proposer);
    event AmendSigned(uint256 indexed id, address indexed coSigner);
    event OwnerChanged(bytes32 indexed vinHash, address indexed from, address indexed to);

    constructor(address[] memory initialCouncil) {
        if (initialCouncil.length == 0) revert EmptyInput();
        for (uint256 i = 0; i < initialCouncil.length; i++) {
            if (roles[initialCouncil[i]] != Role.None) revert AlreadyMember();
            roles[initialCouncil[i]] = Role.Council;
            emit MemberChanged(initialCouncil[i], Role.Council);
        }
        councilSize = uint16(initialCouncil.length);
    }

    modifier onlyAttester() {
        if (roles[msg.sender] != Role.Attester) revert NotAttester();
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

    // ───────────── Nội bộ ─────────────
    function _vehicle(bytes32 vin) private view returns (Vehicle storage v) {
        v = vehicles[vin];
        if (!v.exists) revert VehicleNotFound();
    }

    function _push(bytes32 vin, Kind kind, uint64 occurredAt, uint8 sub, bytes32 dataHash, bytes32 ref, uint64 num) private {
        records[vin].push(Record(kind, msg.sender, occurredAt, uint64(block.timestamp), sub, dataHash, ref, num));
        emit RecordAdded(vin, kind, msg.sender, sub, dataHash);
    }

    function _bindSeal(bytes32 vin, Vehicle storage v, bytes32 serial) private {
        if (sealVehicle[serial] != bytes32(0)) revert SealAlreadyUsed();
        sealVehicle[serial] = vin;
        v.currentSeal = serial;
    }

    function _changeSeal(bytes32 vin, Vehicle storage v, bytes32 serial, SealReason reason, bytes32 docHash) private {
        _bindSeal(vin, v, serial);
        _push(vin, Kind.SealChange, uint64(block.timestamp), uint8(reason), docHash, serial, 0);
    }

    function _applyConclusion(Vehicle storage v, Conclusion c) private {
        if (c >= Conclusion.Floor) {
            v.flood = true;
            if (c == Conclusion.Hydrolock) v.hydrolock = true;
        }
    }

    // ───────────── Đơn vị xác nhận ─────────────
    /// @notice Đăng ký xe. `serial` và `engineHash` có thể bằng 0 (xe chưa dán tem / chưa ghi số máy).
    function registerVehicle(bytes32 vin, address owner, bytes32 serial, bytes32 engineHash, bytes32 docHash)
        external onlyAttester
    {
        if (vin == bytes32(0) || owner == address(0)) revert EmptyInput();
        Vehicle storage v = vehicles[vin];
        if (v.exists) revert VehicleExists();
        v.exists = true;
        v.owner = owner;
        v.engineHash = engineHash;
        if (serial != bytes32(0)) _bindSeal(vin, v, serial);
        _push(vin, Kind.Registered, uint64(block.timestamp), 0, docHash, serial, 0);
    }

    /// @notice Ghi nhận ngập (bảo hiểm theo hồ sơ bồi thường, gara khi tiếp nhận xe…).
    function reportFlood(bytes32 vin, FloodType t, uint64 occurredAt, bytes32 docHash) external onlyAttester {
        Vehicle storage v = _vehicle(vin);
        if (occurredAt > block.timestamp) revert FutureTime();
        v.flood = true;
        if (t == FloodType.Hydrolock) v.hydrolock = true;
        _push(vin, Kind.Flood, occurredAt, uint8(t), docHash, bytes32(0), 0);
    }

    /// @notice Tổn thất toàn bộ. Cờ giữ nguyên khi xe được thanh lý và đổi chủ.
    function declareTotalLoss(bytes32 vin, bytes32 docHash) external onlyAttester {
        Vehicle storage v = _vehicle(vin);
        v.totalLoss = true;
        _push(vin, Kind.TotalLoss, uint64(block.timestamp), 0, docHash, bytes32(0), 0);
    }

    /// @notice Sửa xong sau ngập; nếu đã dán tem mới thì truyền `newSerial` (0 nếu chưa).
    function repairCompleted(bytes32 vin, bytes32 newSerial, bytes32 docHash) external onlyAttester {
        Vehicle storage v = _vehicle(vin);
        if (!v.flood) revert NoFloodFlag();
        _push(vin, Kind.Repair, uint64(block.timestamp), 0, docHash, newSerial, 0);
        if (newSerial != bytes32(0)) _changeSeal(vin, v, newSerial, SealReason.FloodRepair, docHash);
    }

    /// @notice Thay tem khi đơn vị xác nhận đã mở máy hoặc bảo dưỡng. `Unrecorded` chỉ dùng qua `inspect`.
    function changeSeal(bytes32 vin, bytes32 newSerial, SealReason reason, bytes32 docHash) external onlyAttester {
        if (reason == SealReason.Unrecorded) revert InvalidReason();
        if (newSerial == bytes32(0)) revert EmptyInput();
        _changeSeal(vin, _vehicle(vin), newSerial, reason, docHash);
    }

    /// @notice Thay động cơ: ghi hash số máy mới. Cờ ngập/thủy kích không đổi.
    function changeEngine(bytes32 vin, bytes32 newEngineHash, bytes32 docHash) external onlyAttester {
        if (newEngineHash == bytes32(0)) revert EmptyInput();
        Vehicle storage v = _vehicle(vin);
        v.engineHash = newEngineHash;
        _push(vin, Kind.EngineChange, uint64(block.timestamp), 0, docHash, newEngineHash, 0);
    }

    /// @notice Kiểm tra xe (đăng kiểm, kiểm tra xe cũ, gara sau khai báo). Một lần ghi gồm:
    /// số km, số tem đọc được, kết luận (nếu có), và tem mới nếu đã dán lại.
    /// - Tem đọc được khác tem trên hồ sơ → cờ "mở máy không ghi nhận" (một chiều).
    /// - Có kết luận → đóng yêu cầu kiểm tra của chủ xe; kết luận có ngập thì bật cờ.
    /// - Có `newSerial` → dán tem mới ngay (lý do Unrecorded nếu tem trước đó không khớp).
    function inspect(bytes32 vin, uint64 km, bytes32 seenSerial, Conclusion c, bytes32 newSerial, bytes32 docHash)
        external onlyAttester
    {
        Vehicle storage v = _vehicle(vin);
        bool mismatch = seenSerial != v.currentSeal;
        if (mismatch) v.unrecordedOpening = true;
        _applyConclusion(v, c);
        if (c != Conclusion.NotAssessed) v.openRequest = Level.None;
        _push(vin, Kind.Inspection, uint64(block.timestamp), uint8(c) | (mismatch ? 0x10 : 0), docHash, seenSerial, km);
        if (newSerial != bytes32(0)) {
            _changeSeal(vin, v, newSerial, mismatch ? SealReason.Unrecorded : SealReason.Maintenance, docHash);
        }
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

    /// @notice Chuyển chủ do chính chủ xe ký (mua bán cá nhân, bán cho đại lý, thanh lý xe tổn thất…).
    /// Cờ cảnh báo không đổi theo chủ. `warrantyDays` > 0 nếu bên bán cam kết bảo hành.
    function transfer(bytes32 vin, address newOwner, uint32 warrantyDays, bytes32 docHash) external {
        Vehicle storage v = _vehicle(vin);
        if (msg.sender != v.owner) revert NotVehicleOwner();
        if (newOwner == address(0)) revert EmptyInput();
        if (newOwner == v.owner) revert SameOwner();
        emit OwnerChanged(vin, v.owner, newOwner);
        v.owner = newOwner;
        v.handoverAt = uint64(block.timestamp);
        v.warrantyDays = warrantyDays;
        v.sealAtHandover = v.currentSeal; // hợp đồng tự đọc, không nhận từ người gọi
        _push(vin, Kind.Transfer, uint64(block.timestamp), 0, docHash, v.currentSeal, warrantyDays);
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
    function inWarranty(bytes32 vin) external view returns (bool) { return _inWarranty(vehicles[vin]); }

    /// @notice Đối chiếu số tem đọc trên máy với tem hiện tại trên hồ sơ.
    function checkSeal(bytes32 vin, bytes32 seenSerial) external view returns (bool match_, bytes32 current) {
        current = vehicles[vin].currentSeal;
        match_ = current != bytes32(0) && current == seenSerial;
    }
}
