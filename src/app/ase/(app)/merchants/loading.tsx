export default function Loading() {
  return (
    <div className="content" aria-busy="true" aria-label="Loading merchants">
      <div className="ph"><div><span className="sk" style={{ width: 160, height: 22 }} /><span className="sk" style={{ width: 280, marginTop: 8 }} /></div></div>
      <section className="card lv">
        <div className="lt"><span className="sk" style={{ width: 420, height: 28 }} /></div>
        <table className="tbl"><tbody>
          {Array.from({ length: 9 }).map((_, i) => (
            <tr key={i}>
              <td><span className="sk" style={{ width: 120 + ((i * 37) % 80) }} /><span className="sk" style={{ width: 100, height: 8, marginTop: 6 }} /></td>
              <td><span className="sk" style={{ width: 54, height: 18, borderRadius: 9 }} /></td>
              <td><span className="sk" style={{ width: 130 }} /></td><td><span className="sk" style={{ width: 34 }} /></td><td><span className="sk" style={{ width: 90 }} /></td>
              <td className="r"><span className="sk" style={{ width: 80, marginLeft: "auto" }} /></td><td className="r"><span className="sk" style={{ width: 40, marginLeft: "auto" }} /></td>
            </tr>
          ))}
        </tbody></table>
      </section>
    </div>
  );
}
