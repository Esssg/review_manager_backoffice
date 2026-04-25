import { PRODUCT_DETAIL_TABS } from "../../../constants/admin";

export default function StepTabList({
  activeTab,
  enabledSteps = {},
  onTabChange,
  tabs = PRODUCT_DETAIL_TABS,
  ariaLabel = "상품 단계 탭"
}) {
  return (
    <section className="step-tab-list" aria-label={ariaLabel}>
      {tabs.map((tab, index) => {
        const isEnabled = enabledSteps[tab.key] ?? true;
        const isActive = activeTab === tab.key;

        return (
          <button
            key={tab.key}
            type="button"
            className={`step-tab-button${isEnabled ? " enabled" : " disabled"}${isActive ? " active" : ""}`}
            onClick={() => onTabChange(tab.key)}
          >
            <span>{tab.label}</span>
            {index < tabs.length - 1 && <em className="step-arrow">›</em>}
          </button>
        );
      })}
    </section>
  );
}
