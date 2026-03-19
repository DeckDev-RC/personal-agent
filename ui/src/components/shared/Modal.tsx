import React, { useEffect, useRef, useCallback } from "react";
import { X } from "lucide-react";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  width?: string;
};

const TITLE_ID = "modal-title";

export default function Modal({
  open,
  onClose,
  title,
  children,
  width = "max-w-lg",
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Focus management: save previous focus, focus dialog on open, restore on close
  useEffect(() => {
    if (open) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement;
      // Small delay to ensure the dialog is rendered before focusing
      requestAnimationFrame(() => {
        dialogRef.current?.focus();
      });
    } else if (previouslyFocusedRef.current) {
      previouslyFocusedRef.current.focus();
      previouslyFocusedRef.current = null;
    }
  }, [open]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Focus trap: cycle Tab/Shift+Tab within the modal
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Tab" || !dialogRef.current) return;

      const focusableSelectors =
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(focusableSelectors),
      );

      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        if (
          document.activeElement === firstElement ||
          document.activeElement === dialogRef.current
        ) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    },
    [],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 animate-[fade-in_200ms_ease-out]"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? TITLE_ID : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={`relative ${width} w-full mx-4 rounded-xl border border-border bg-bg-secondary p-5 shadow-2xl animate-[scale-in_200ms_ease-out] outline-none`}
      >
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h2
              id={TITLE_ID}
              className="text-sm font-semibold text-text-primary"
            >
              {title}
            </h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
