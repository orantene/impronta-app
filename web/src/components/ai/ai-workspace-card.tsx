"use client";

import Link from "next/link";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type AIWorkspaceCardProps = {
  title: string;
  description: string;
  href?: string;
  className?: string;
};

export function AIWorkspaceCard({
  title,
  description,
  href,
  className,
}: AIWorkspaceCardProps) {
  const body = (
    <Card
      className={cn(
        "h-full border-border/60 transition hover:-translate-y-0.5 hover:border-border hover:shadow-md",
        className,
      )}
    >
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
        {body}
      </Link>
    );
  }

  return body;
}
