"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { stylePriceChoices } from "@/lib/pricing";

/**
 * Catalog price picker. USD offers 39.99, 34.99, 24.99 and 12.99.
 * A saved amount outside that ladder stays in the list so opening the
 * editor does not change it.
 */
export function StylePriceSelect({
  style,
  currency,
  value,
  onChange,
}: {
  style: string;
  currency: string;
  value: string;
  onChange: (price: string) => void;
}) {
  const choices = stylePriceChoices(currency);
  const current = value.trim();
  const options =
    current && !choices.includes(current) ? [current, ...choices] : choices;
  const selected = options.includes(current) ? current : (options[0] ?? "");
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  function placeMenu() {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const width = Math.max(rect.width, 96);
    const menuHeight = options.length * 32 + 8;
    const below = rect.bottom + 4;
    const fitsBelow = below + menuHeight <= window.innerHeight - 8;
    setPos({
      top: fitsBelow ? below : Math.max(8, rect.top - menuHeight - 4),
      left: Math.max(8, rect.right - width),
      width,
    });
  }

  useEffect(() => {
    if (!open) return;
    function close() {
      setOpen(false);
    }
    function onPointer(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      close();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${style} price`}
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }
          placeMenu();
          setOpen(true);
        }}
        className="flex w-[5.5rem] items-center justify-end gap-1 rounded-lg border border-[var(--border)] bg-white px-2 py-1 text-xs font-semibold tabular-nums text-[var(--foreground)] outline-none focus-visible:border-[var(--primary)]"
      >
        <span className="min-w-0 flex-1 text-right">{selected}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--foreground)]/45" />
      </button>
      {open && pos && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${style} price`}
          className="fixed z-[70] overflow-hidden rounded-lg border border-[var(--border)] bg-white py-1 shadow-lg"
          style={{ top: pos.top, left: pos.left, width: pos.width }}
        >
          {options.map((price) => {
            const chosen = price === selected;
            return (
              <li key={price}>
                <button
                  type="button"
                  role="option"
                  aria-selected={chosen}
                  onClick={() => {
                    onChange(price);
                    setOpen(false);
                  }}
                  className={`block w-full px-2.5 py-1.5 text-right text-xs font-semibold tabular-nums ${
                    chosen
                      ? "bg-[var(--primary)] text-white"
                      : "text-[var(--foreground)] hover:bg-[var(--muted)]"
                  }`}
                >
                  {price}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
