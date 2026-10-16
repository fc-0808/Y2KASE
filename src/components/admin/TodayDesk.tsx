"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Inbox,
  Megaphone,
  Send,
  ShoppingBag,
  Star,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatLocalInstant,
  formatLocalWindow,
  nextDeskLine,
  withInbox,
  type TodayClubTone,
  type TodayDeskItem,
  type TodayDeskNext,
  type TodayDeskSnapshot,
  type TodayDeskTone,
} from "@/lib/admin/today-desk";

const STORAGE_KEY = "y2kase.today-desk";
const DESK_EVENT = "y2kase-today-desk";
const REFRESH_MS = 60_000;

function subscribeDesk(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(DESK_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(DESK_EVENT, onStoreChange);
  };
}

function readDeskOpen(): boolean {
  return window.localStorage.getItem(STORAGE_KEY) === "open";
}

function writeDeskOpen(open: boolean) {
  window.localStorage.setItem(STORAGE_KEY, open ? "open" : "closed");
  window.dispatchEvent(new Event(DESK_EVENT));
}

function subscribeWide(onStoreChange: () => void) {
  const media = window.matchMedia("(min-width: 1024px)");
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

function readWide(): boolean {
  return window.matchMedia("(min-width: 1024px)").matches;
}

type TodayDeskContextValue = {
  snapshot: TodayDeskSnapshot;
  items: TodayDeskItem[];
  dueCount: number;
  open: boolean;
  setOpen: (open: boolean) => void;
  closeIfNarrow: () => void;
};

const TodayDeskContext = createContext<TodayDeskContextValue | null>(null);

function subscribeToNothing() {
  return () => {};
}

function useLocalClock(startsAt?: string, endsAt?: string | null): string | null {
  return useSyncExternalStore(
    subscribeToNothing,
    () => {
      if (!startsAt) return null;
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return endsAt
        ? formatLocalWindow(startsAt, endsAt, timeZone)
        : formatLocalInstant(startsAt, timeZone);
    },
    () => null,
  );
}

const PILL: Record<TodayClubTone, string> = {
  done: "bg-emerald-50 text-emerald-800",
  open: "bg-primary/10 text-primary",
  owed: "bg-amber-50 text-amber-900",
  clear: "bg-muted text-foreground/70",
};

function ClubPill({
  tone,
  headline,
}: {
  tone: TodayClubTone;
  headline: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center truncate rounded-full px-2.5 py-1 text-[11px] font-bold",
        PILL[tone],
      )}
    >
      {headline}
    </span>
  );
}

function NextLine({ next }: { next: TodayDeskNext }) {
  const local = useLocalClock(next.startsAt, next.endsAt);
  return (
    <p className="text-xs leading-relaxed text-foreground/50">
      <span className="block">{nextDeskLine(next)}</span>
      {local ? <span className="block text-foreground/40">{local}</span> : null}
    </p>
  );
}

function ItemGlyph({ id }: { id: string }) {
  const className = "h-4 w-4";
  switch (id) {
    case "orders":
      return <ShoppingBag className={className} aria-hidden />;
    case "reviews":
      return <Star className={className} aria-hidden />;
    case "inbox":
      return <Inbox className={className} aria-hidden />;
    case "instagram":
      return <Megaphone className={className} aria-hidden />;
    default:
      return <Send className={className} aria-hidden />;
  }
}

const TONE_ICON: Record<TodayDeskTone, string> = {
  urgent: "bg-rose-100 text-rose-700",
  open: "bg-primary/10 text-primary",
  attention: "bg-amber-100 text-amber-800",
  quiet: "bg-muted text-foreground/55",
};

function DeskRow({
  item,
  primary,
  onNavigate,
}: {
  item: TodayDeskItem;
  primary: boolean;
  onNavigate: () => void;
}) {
  const local = useLocalClock(item.startsAt, item.endsAt);
  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        className={cn(
          "group flex items-start gap-3 rounded-xl border px-3 py-3 transition",
          "hover:border-primary hover:shadow-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          primary
            ? "border-primary/30 bg-primary/[0.04]"
            : "border-border bg-card",
        )}
      >
        <span
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            TONE_ICON[item.tone],
          )}
        >
          <ItemGlyph id={item.id} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-bold text-foreground">{item.title}</span>
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 text-xs font-bold",
                primary
                  ? "text-primary"
                  : "text-foreground/40 group-hover:text-primary",
              )}
            >
              {item.actionLabel}
              <ArrowRight className="h-3 w-3" aria-hidden />
            </span>
          </span>
          <span className="mt-0.5 block text-xs leading-relaxed text-foreground/55">
            {item.detail}
          </span>
          {item.clock ? (
            <span className="mt-1 block text-[11px] font-medium tabular-nums leading-relaxed text-foreground/45">
              <span className="block">{item.clock}</span>
              {local ? <span className="block">{local}</span> : null}
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

function DeskBody({
  snapshot,
  items,
  onNavigate,
}: {
  snapshot: TodayDeskSnapshot;
  items: TodayDeskItem[];
  onNavigate: () => void;
}) {
  if (!snapshot.available) {
    return (
      <p className="px-1 py-2 text-sm text-foreground/55">
        Refresh the page to try again.
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <div className="flex items-start gap-3 px-1 py-1">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Nothing waiting</p>
          {snapshot.next ? (
            <div className="mt-1">
              <NextLine next={snapshot.next} />
            </div>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <div>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <DeskRow
            key={item.id}
            item={item}
            primary={index === 0}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
      {snapshot.next ? (
        <div className="px-1 pt-3">
          <NextLine next={snapshot.next} />
        </div>
      ) : null}
    </div>
  );
}

function TodayDrawer({
  snapshot,
  items,
  dueCount,
  open,
  setOpen,
  closeIfNarrow,
}: TodayDeskContextValue) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openedByUser = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  useEffect(() => {
    if (!open || !openedByUser.current) return;
    closeRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const wide = window.matchMedia("(min-width: 1024px)").matches;
    if (wide) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const label =
    dueCount === 0
      ? "Today, nothing waiting"
      : dueCount === 1
        ? "Today, 1 thing to do"
        : `Today, ${dueCount} things to do`;

  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="Close Today"
          className="fixed inset-0 z-40 bg-black/25 lg:left-64"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <aside
        ref={panelRef}
        id="today-desk"
        role="dialog"
        aria-modal={open}
        aria-labelledby="today-desk-title"
        aria-hidden={!open}
        inert={!open}
        className={cn(
          "fixed z-50 flex flex-col bg-card shadow-2xl",
          "transition-transform duration-300 ease-out motion-reduce:transition-none",
          "inset-x-0 bottom-0 max-h-[min(85dvh,40rem)] rounded-t-3xl border-t border-border",
          "lg:inset-y-0 lg:left-auto lg:right-0 lg:h-dvh lg:max-h-none lg:w-[22.5rem] lg:rounded-none lg:border-t-0 lg:border-l",
          open
            ? "translate-y-0 lg:translate-x-0"
            : "pointer-events-none translate-y-full lg:translate-y-0 lg:translate-x-full",
        )}
      >
        <div
          className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-border lg:hidden"
          aria-hidden
        />
        <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 lg:pt-5">
          <div className="min-w-0">
            <h2 id="today-desk-title" className="text-xl font-black tracking-tight">
              Today
            </h2>
            <p className="mt-1 text-sm text-foreground/55">
              {dueCount === 0
                ? "Nothing is waiting on you."
                : dueCount === 1
                  ? "1 thing to do."
                  : `${dueCount} things to do.`}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg p-1.5 text-foreground/45 transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Close Today"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex flex-wrap items-center gap-2 px-5 pb-4">
          <ClubPill tone={snapshot.clubTone} headline={snapshot.clubHeadline} />
          {snapshot.weekLabel ? (
            <span className="text-xs text-foreground/40">{snapshot.weekLabel}</span>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          <DeskBody snapshot={snapshot} items={items} onNavigate={closeIfNarrow} />
        </div>
        <footer className="shrink-0 border-t border-border px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] leading-relaxed text-foreground/45">
              Welcome, cart, and review emails send on their own.
            </p>
            <Link
              href={snapshot.calendarHref}
              onClick={closeIfNarrow}
              className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-foreground/55 transition hover:text-primary"
            >
              <CalendarDays className="h-3.5 w-3.5" aria-hidden />
              Calendar
            </Link>
          </div>
        </footer>
      </aside>

      <button
        type="button"
        data-today-tab
        aria-expanded={open}
        aria-controls="today-desk"
        aria-label={label}
        onClick={() => {
          openedByUser.current = true;
          setOpen(true);
        }}
        className={cn(
          "fixed right-0 top-1/2 z-40 w-10 -translate-y-1/2 flex-col items-center justify-center gap-2 rounded-l-2xl border border-r-0 border-border bg-card py-4 shadow-lg",
          "transition hover:border-primary hover:text-primary",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          open ? "hidden" : "hidden lg:flex",
          dueCount > 0 && "border-primary/40",
        )}
      >
        {dueCount > 0 ? (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
            {dueCount > 9 ? "9+" : dueCount}
          </span>
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
        )}
        <span className="text-[11px] font-bold tracking-wide text-foreground/70 [writing-mode:vertical-rl]">
          Today
        </span>
      </button>

      <button
        type="button"
        data-today-fab
        aria-expanded={open}
        aria-controls="today-desk"
        aria-label={label}
        onClick={() => {
          openedByUser.current = true;
          setOpen(true);
        }}
        className={cn(
          "fixed right-4 z-40 items-center gap-2 rounded-full border border-border bg-card px-4 py-3 shadow-lg",
          "bottom-[calc(1rem+var(--bottom-bar-h))]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          open ? "hidden" : "flex lg:hidden",
        )}
      >
        <span className="text-sm font-bold">Today</span>
        {dueCount > 0 ? (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-white">
            {dueCount > 9 ? "9+" : dueCount}
          </span>
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
        )}
      </button>
    </>
  );
}

export function TodayDeskProvider({
  initial,
  children,
}: {
  initial: TodayDeskSnapshot;
  children: React.ReactNode;
}) {
  const [polled, setPolled] = useState<TodayDeskSnapshot | null>(null);
  const snapshot =
    polled && polled.fetchedAt >= initial.fetchedAt ? polled : initial;
  const storedOpen = useSyncExternalStore(subscribeDesk, readDeskOpen, () => false);
  const wide = useSyncExternalStore(subscribeWide, readWide, () => false);
  const [chosen, setChosen] = useState<boolean | null>(null);
  const open = chosen ?? (wide && storedOpen);
  const [unread, setUnread] = useState<number | null>(null);

  const setOpen = useCallback((next: boolean) => {
    setChosen(next);
    if (window.matchMedia("(min-width: 1024px)").matches) writeDeskOpen(next);
  }, []);

  const wantInbox = open;

  useEffect(() => {
    if (!wantInbox) return;
    const controller = new AbortController();
    fetch("/api/admin/inbox/unread", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { unread?: number; error?: boolean } | null) => {
        if (!data || data.error || typeof data.unread !== "number") return;
        setUnread(data.unread);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [wantInbox, snapshot.fetchedAt]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let ticket = 0;
    const pull = () => {
      if (document.hidden || cancelled) return;
      const mine = ++ticket;
      fetch("/api/admin/today")
        .then((response) => (response.ok ? response.json() : null))
        .then((data: TodayDeskSnapshot | null) => {
          if (!cancelled && mine === ticket && data?.fetchedAt) setPolled(data);
        })
        .catch(() => {});
    };
    pull();
    const timer = window.setInterval(pull, REFRESH_MS);
    const onVisible = () => {
      if (!document.hidden) pull();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [open]);

  const closeIfNarrow = useCallback(() => {
    if (window.matchMedia("(max-width: 1023px)").matches) setOpen(false);
  }, [setOpen]);

  const items = useMemo(
    () => withInbox(snapshot.items, unread ?? 0),
    [snapshot.items, unread],
  );

  const value = useMemo<TodayDeskContextValue>(
    () => ({
      snapshot,
      items,
      dueCount: items.length,
      open,
      setOpen,
      closeIfNarrow,
    }),
    [snapshot, items, open, setOpen, closeIfNarrow],
  );

  return (
    <TodayDeskContext.Provider value={value}>
      {children}
      <TodayDrawer {...value} />
    </TodayDeskContext.Provider>
  );
}
