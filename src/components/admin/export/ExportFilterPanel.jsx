export default function ExportFilterPanel({ title = "필터", description, children }) {
  return (
    <section className="export-panel" aria-label={title}>
      <div className="export-panel-header">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
