export default function Loading() {
  const seven = Array.from({ length: 7 });
  return (
    <div className="content" aria-busy="true" aria-label="Loading merchant" style={{ gap: 16 }}>
      <div className="row" style={{ gap: 14 }}>
        <span className="sk" style={{ width: 48, height: 48, borderRadius: 10 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}><span className="sk" style={{ width: 280, height: 18 }} /><span className="sk" style={{ width: 420 }} /></div>
      </div>
      <div className="hs">{seven.map((_, i) => <div key={i}><span className="sk" style={{ width: "70%" }} /><span className="sk" style={{ width: "85%", height: 16, marginTop: 6 }} /><span className="sk" style={{ width: "50%", height: 8, marginTop: 6 }} /></div>)}</div>
      <div className="g-main">
        <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <span className="sk" style={{ width: "60%", height: 14 }} />
          {seven.map((_, i) => <div key={i} className="row" style={{ gap: 12 }}><span className="sk" style={{ width: 32, height: 32, borderRadius: 16 }} /><span className="sk" style={{ flex: 1 }} /></div>)}
        </div>
        <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>{seven.map((_, i) => <span key={i} className="sk" style={{ width: "90%" }} />)}</div>
      </div>
    </div>
  );
}
