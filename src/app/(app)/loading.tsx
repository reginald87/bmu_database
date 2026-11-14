export default function AppLoading() {
  return (
    <section className="page show">
      <div className="search-loading">
        <span className="skeleton" style={{ width: '30%', height: 26 }} />
        <span className="skeleton" style={{ width: '48%' }} />
        <span className="skeleton" style={{ width: '100%', height: 120 }} />
        <span className="skeleton" style={{ width: '100%', height: 220 }} />
      </div>
    </section>
  );
}
