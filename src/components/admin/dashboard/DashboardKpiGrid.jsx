function DashboardKpiCard({ card, isLoading }) {
  return (
    <article className={`dashboard-card${card.tone ? ` is-${card.tone}` : ""}`}>
      <div className="dashboard-card-header">
        <h2>{card.title}</h2>
        {card.badge ? <span className="dashboard-card-badge">{card.badge}</span> : null}
      </div>
      <strong>{isLoading ? "-" : card.value}</strong>
      <p>{isLoading ? "데이터를 불러오는 중입니다." : card.description}</p>
      {!isLoading && card.note ? <small>{card.note}</small> : null}
    </article>
  );
}

export default function DashboardKpiGrid({ title, description, cards, isLoading = false }) {
  return (
    <section className="dashboard-kpi-section" aria-label={title}>
      <div className="dashboard-section-heading">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      <div className="dashboard-grid">
        {cards.map((card) => (
          <DashboardKpiCard key={card.title} card={card} isLoading={isLoading} />
        ))}
      </div>
    </section>
  );
}
