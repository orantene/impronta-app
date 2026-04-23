"use client";

import { type CSSProperties, type ElementType, type ReactNode, useEffect, useRef, useState } from "react";

export function Reveal({
  children,
  as,
  delay = 0,
  className = "",
  style,
}: {
  children: ReactNode;
  as?: ElementType;
  delay?: 0 | 1 | 2 | 3 | 4;
  className?: string;
  style?: CSSProperties;
}) {
  const Tag: ElementType = as ?? "div";
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      className={`cc-reveal ${className}`.trim()}
      data-visible={visible || undefined}
      data-delay={delay || undefined}
      style={style}
    >
      {children}
    </Tag>
  );
}
