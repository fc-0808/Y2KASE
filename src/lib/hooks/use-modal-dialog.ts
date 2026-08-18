"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Locks page scroll while a blocking dialog is visible and compensates for the
 * missing scrollbar so opening the dialog does not shift the page horizontally.
 */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [active]);
}

/**
 * Moves focus into a dialog, traps Tab navigation, closes on Escape, and
 * restores focus when the dialog closes. The dialog element must have
 * `tabIndex={-1}` so it can receive initial focus without opening a keyboard.
 */
export function useModalFocusTrap(
  dialogRef: RefObject<HTMLElement | null>,
  active: boolean,
  onDismiss: () => void,
  contentKey: unknown = null,
): void {
  const restoreToRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;

    restoreToRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    return () => {
      const restoreTo = restoreToRef.current;
      restoreToRef.current = null;
      if (restoreTo?.isConnected) {
        restoreTo.focus();
      }
    };
  }, [active]);

  // Refocus whenever the dialog swaps its content (offer → success), because
  // the previously focused control may have just been removed from the DOM.
  useEffect(() => {
    if (!active) return;
    dialogRef.current?.focus();
  }, [active, contentKey, dialogRef]);

  useEffect(() => {
    if (!active) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable =
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const focused = document.activeElement;
      const focusIsInside =
        focused instanceof Node && dialogRef.current.contains(focused);

      if (!focusIsInside) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }

      if (event.shiftKey) {
        if (focused === first || focused === dialogRef.current) {
          event.preventDefault();
          last.focus();
        }
      } else if (focused === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function onFocusIn(event: FocusEvent) {
      if (
        dialogRef.current &&
        event.target instanceof Node &&
        !dialogRef.current.contains(event.target)
      ) {
        dialogRef.current.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [active, dialogRef, onDismiss]);
}
