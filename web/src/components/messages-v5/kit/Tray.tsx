/**
 * Tray: the + tray (board D05, M03 actions sheet). Two groups: "Send to the
 * client" (a card the client sees) and "This conversation" (changes the
 * thread). Rows without an engine action are drawn greyed with "coming",
 * never as a fake button.
 */

import type { KitCopy } from "./copy";
import { Icon, type IconName } from "./primitives";

export type TrayItemKey = "add_items" | "offer" | "times" | "payment" | "file" | "template" | "link" | "reminder" | "handover" | "close_lost";

export type TrayItem = { readonly key: TrayItemKey; readonly icon: IconName; readonly title: string; readonly sub: string; readonly coming?: boolean };
export type TrayGroup = { readonly title: string; readonly items: readonly TrayItem[]; readonly grid?: boolean };

export function defaultTrayGroups(copy: KitCopy): TrayGroup[] {
  const t = copy.tray;
  return [
    {
      title: t.sendToClient,
      grid: true,
      items: [
        { key: "add_items", icon: "bag", title: t.addItems, sub: t.addItemsSub },
        { key: "offer", icon: "tag", title: t.offer, sub: t.offerSub },
        { key: "times", icon: "clock", title: t.times, sub: t.timesSub },
        { key: "payment", icon: "card", title: t.payment, sub: t.paymentSub },
        { key: "file", icon: "file", title: t.file, sub: t.fileSub },
        { key: "template", icon: "note", title: t.template, sub: `${t.coming} · ${t.templateSub}`, coming: true },
      ],
    },
    {
      title: t.thisConversation,
      items: [
        { key: "link", icon: "link", title: t.link, sub: t.linkSub },
        { key: "reminder", icon: "bell", title: t.reminder, sub: t.reminderSub },
        { key: "handover", icon: "hand", title: t.handover, sub: t.handoverSub },
        { key: "close_lost", icon: "ban", title: t.closeLost, sub: t.closeLostSub },
      ],
    },
  ];
}

export type TrayProps = {
  readonly groups: readonly TrayGroup[];
  readonly variant?: "desktop" | "mobile";
  readonly floating?: boolean;
  readonly onPick?: (key: TrayItemKey) => void;
};

export function Tray({ groups, variant = "desktop", floating, onPick }: TrayProps) {
  if (variant === "mobile") {
    return (
      <div data-tray="mobile">
        {groups.map((g) => (
          <div key={g.title}>
            <div className="mx-gh">{g.title}</div>
            {g.items.map((it) => (
              <button key={it.key} type="button" className={`mx-act${it.coming ? " off" : ""}`} disabled={it.coming} aria-disabled={it.coming || undefined} onClick={onPick && !it.coming ? () => onPick(it.key) : undefined} data-tray-item={it.key}>
                <span className="ic">
                  <Icon name={it.icon} size={20} />
                </span>
                <span className="tx">
                  <b>{it.title}</b>
                  <span>{it.sub}</span>
                </span>
                <Icon name="chev" size={16} className="chev" />
              </button>
            ))}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className={`tray${floating ? " floating" : ""}`} role="menu" data-tray="desktop">
      {groups.map((g) => (
        <div key={g.title}>
          <div className="th">{g.title}</div>
          <div className={g.grid ? "grid" : "list"}>
            {g.items.map((it) => (
              <button key={it.key} type="button" role="menuitem" className={`ti${it.coming ? " off" : ""}`} disabled={it.coming} aria-disabled={it.coming || undefined} onClick={onPick && !it.coming ? () => onPick(it.key) : undefined} data-tray-item={it.key}>
                <span className="ic">
                  <Icon name={it.icon} size={15} />
                </span>
                <span className="tx">
                  <b>{it.title}</b>
                  <span>{it.sub}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
