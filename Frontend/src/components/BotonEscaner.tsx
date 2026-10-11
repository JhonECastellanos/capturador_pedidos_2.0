export function BotonEscaner({ onClick, disabled = false }: { onClick: () => void; disabled?: boolean }) {
  return <button type="button" aria-label="Escanear código" title="Leer código de barras o QR" disabled={disabled} onClick={onClick} className="flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-lg text-teal hover:bg-teal-soft disabled:opacity-40">
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M8 5 10 3h4l2 2h4v15H4V5z"/><circle cx="12" cy="12" r="4"/><path d="M7 10v4m10-4v4"/></svg>
  </button>;
}
