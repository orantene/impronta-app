import { Badge } from "@/components/ui/badge";
import {
  clientBookingStatusLabel,
  clientPaymentStatusLabel,
  clientPaymentMethodLabel,
} from "@/lib/client-booking-copy";
import { cn } from "@/lib/utils";

export function ClientBookingStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn("font-normal", className)} title="Where this job is in our process">
      {clientBookingStatusLabel(status)}
    </Badge>
  );
}

export function ClientPaymentSummary({
  paymentStatus,
  paymentMethod,
  className,
  size = "sm",
}: {
  paymentStatus: string;
  paymentMethod: string | null;
  className?: string;
  size?: "sm" | "md";
}) {
  const method = clientPaymentMethodLabel(paymentMethod);
  return (
    <div className={cn(size === "md" ? "text-base" : "text-sm", "text-muted-foreground", className)}>
      <span className="font-medium text-foreground">{clientPaymentStatusLabel(paymentStatus)}</span>
      {method ? <span> · {method}</span> : null}
    </div>
  );
}
