import React from "react";
import Staff from "./Staff.jsx";
import Council from "./Council.jsx";
import { accountLabel } from "./ui.jsx";

/** Một trang cho đơn vị được cấp quyền: ghi sự kiện (theo vai trò) + hội đồng. */
export default function Members({ acct, accounts, onRolesChanged }) {
  return (
    <div>
      <section className="hero small">
        <div className="wrap">
          <h1>Khu vực thành viên</h1>
          <p className="lead">Dành cho đơn vị xác nhận (gara, bảo hiểm, đăng kiểm) và hội đồng. Người mua xe không cần dùng khu vực này. Tài khoản đang dùng: <b>{accountLabel(acct)}</b> (đổi ở biểu tượng 👤 góc phải).</p>
        </div>
      </section>
      <div className="wrap members">
        {acct.role === 0 && <p className="card">Tài khoản này chưa được hội đồng cấp quyền ghi. Hãy chọn tài khoản đơn vị xác nhận hoặc hội đồng ở biểu tượng 👤.</p>}
        {acct.role === 2 && <Staff acct={acct} accounts={accounts} />}
        <Council acct={acct} accounts={accounts} onRolesChanged={onRolesChanged} />
      </div>
    </div>
  );
}
