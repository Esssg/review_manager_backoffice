export const ADMIN_TUTORIAL_EVENT = "review-manager:admin-tutorial";

export function emitAdminTutorialAction(action, payload = {}) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(ADMIN_TUTORIAL_EVENT, {
      detail: {
        action,
        ...payload
      }
    })
  );
}
