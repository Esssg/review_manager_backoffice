import { PRODUCT_DETAIL_TABS } from "@/constants/admin";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function StepTabList({
  activeTab,
  enabledSteps = {},
  onTabChange,
  tabs = PRODUCT_DETAIL_TABS,
  ariaLabel = "상품 단계 탭"
}) {
  return (
    <section className="step-tab-list" aria-label={ariaLabel}>
      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList variant="line" className="step-tab-list-inner">
          {tabs.map((tab, index) => {
            const isEnabled = enabledSteps[tab.key] ?? true;
            const isActive = activeTab === tab.key;

            return (
              <TabsTrigger
                key={tab.key}
                value={tab.key}
                className={`step-tab-button${isEnabled ? " enabled" : " disabled"}${isActive ? " active" : ""}`}
              >
                <span>{tab.label}</span>
                {index < tabs.length - 1 && <em className="step-arrow">›</em>}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
    </section>
  );
}
