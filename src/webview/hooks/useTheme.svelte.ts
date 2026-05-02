import { onMount } from "svelte";
import type { ThemePreference } from "../../types";

export function useTheme() {
  let themePreference = $state(getTheme());

  function getTheme(): ThemePreference {
    if (typeof document !== "undefined") {
      if (
        document.body.classList.contains("vscode-dark") ||
        document.body.classList.contains("vscode-high-contrast")
      ) {
        return "dark";
      }
    }
    return "light";
  }

  function updateTheme(): void {
    const newTheme = getTheme();
    if (themePreference !== newTheme) {
      console.log("[Webview] Theme changed to:", newTheme);
      themePreference = newTheme;
    }
  }

  onMount(() => {
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // Initial check
    updateTheme();

    return () => observer.disconnect();
  });

  return {
    get preference() { return themePreference; }
  };
}
