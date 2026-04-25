export default function AppToast({ toast }) {
  if (!toast) {
    return null;
  }

  return (
    <div
      key={toast.id}
      className={`app-toast is-${toast.type ?? "success"}`}
      role="status"
      aria-live="polite"
    >
      {toast.message}
    </div>
  );
}
