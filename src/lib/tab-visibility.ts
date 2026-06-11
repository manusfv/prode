import type { AppSetting, AppSettingKey } from "./types";

export type TabVisibility = {
  standingsVisible: boolean;
  resultsVisible: boolean;
};

function isEnabled(settings: AppSetting[], key: AppSettingKey): boolean {
  const setting = settings.find((item) => item.key === key);
  // Missing rows default to visible so a fresh DB matches current behavior.
  return setting ? setting.enabled : true;
}

export function getTabVisibility(settings: AppSetting[]): TabVisibility {
  return {
    standingsVisible: isEnabled(settings, "standings"),
    resultsVisible: isEnabled(settings, "results"),
  };
}
