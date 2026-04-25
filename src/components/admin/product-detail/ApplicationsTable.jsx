export default function ApplicationsTable({ adminId, product, rows, onConfirmChange }) {
  return (
    <div className="applications-table-wrap">
      <table className="applications-table">
        <thead>
          <tr>
            <th>순번</th>
            <th>신청자</th>
            <th>확정 여부</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={3}>신청자가 없습니다.</td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={row.id}>
                <td>{index + 1}</td>
                <td>{row.applicant_name}</td>
                <td>
                  <label className="pretty-checkbox">
                    <input
                      type="checkbox"
                      checked={Boolean(row.is_confirmed)}
                      disabled={product?.manager_id !== adminId}
                      onChange={(event) => onConfirmChange(row.id, event.target.checked)}
                    />
                    <span className="checkmark" aria-hidden="true" />
                  </label>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
