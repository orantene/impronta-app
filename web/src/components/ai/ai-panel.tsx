"use client";

import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const variants = {
  compact: "max-w-md",
  inline: "w-full",
  drawer: "h-full min-h-0 rounded-none border-0 shadow-none",
  full: "w-full",
} as const;

export type AIPanelVariant = keyof typeof variants;

type AIPanelProps = {
  title: string;
  variant?: AIPanelVariant;
  className?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
};

export function AIPanel({
  title,
  variant = "inline",
  className,
  actions,
  children,
}: AIPanelProps) {
  return (
    <Card
      className={cn(
        "border-border/60 bg-card/80 backdrop-blur-sm",
        variants[variant],
        className,
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-medium">{title}</CardTitle>
        {actions}
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{children}</CardContent>
    </Card>
  );
}
