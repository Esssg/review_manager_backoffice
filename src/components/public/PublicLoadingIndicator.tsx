type PublicLoadingIndicatorProps = {
  label?: string;
  size?: "default" | "compact";
  inline?: boolean;
};

export default function PublicLoadingIndicator({
  label = "불러오는 중...",
  size = "default",
  inline = false
}: PublicLoadingIndicatorProps) {
  const className = [
    "public-loading-indicator",
    size === "compact" ? "is-compact" : "",
    inline ? "is-inline" : ""
  ]
    .filter(Boolean)
    .join(" ");
  const Wrapper = inline ? "span" : "div";

  return (
    <Wrapper className={className} role="status" aria-live="polite">
      <span className="public-loading-indicator-mark" aria-hidden="true">
        <span className="public-loading-indicator-ring" />
        <img src="/favicon-180.png" alt="" />
      </span>
      {label ? <span className="public-loading-indicator-label">{label}</span> : null}
    </Wrapper>
  );
}
