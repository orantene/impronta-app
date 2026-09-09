"use client";

/**
 * THE COMPONENT CATALOG — a registry, not a page.
 *
 * WHY A DATA FILE AND NOT A GALLERY SCREEN. A catalog that is a hand-written
 * page is a page: it drifts the moment somebody adds a primitive and forgets
 * to add a section, and nothing notices, because there is nothing to notice
 * with. This file is instead the SOURCE the gallery renders and the axe lane
 * crawls, so a primitive that is not registered is a primitive that is
 * untested for accessibility — and `catalog-coverage.static.test.ts` makes
 * that a red build rather than an omission.
 *
 * THE VARIANTS ARE THE POINT. One "here is a Button" render proves nothing;
 * the states that break are disabled, destructive, loading, empty, error and
 * long-content. Each entry therefore lists the states somebody has to look at,
 * and each state is a thunk rather than an element so the gallery can render
 * one at a time and the axe lane can mount them in isolation — a single big
 * tree would let one variant's `aria-hidden` swallow the violation in its
 * neighbour.
 *
 * `"use client"` BECAUSE OF WHAT IS IN HERE, NOT BECAUSE OF WHAT IT IS.
 * Table and the impact preview are server-renderable and would be happier
 * without it; Tabs, Dialog and Switch are not. Splitting the registry in two
 * to preserve that would give us two lists to forget to add to, which is the
 * exact failure this file exists to prevent.
 */

import * as React from "react";
import { CalendarX2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ImpactPreview } from "@/components/ui/impact-preview";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchOrCreatePicker } from "@/components/ui/search-or-create-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface CatalogVariant {
  /** Stable within the entry — used as the axe lane's case name. */
  readonly id: string;
  readonly label: string;
  readonly render: () => React.ReactNode;
}

export interface CatalogEntry {
  /** Stable across renames — the axe lane reports failures by this id. */
  readonly id: string;
  readonly title: string;
  /** Path relative to `src/components/ui/`, matched by the coverage guard. */
  readonly file: string;
  /** What this primitive is FOR, in the terms the blueprints use. */
  readonly why: string;
  readonly variants: readonly CatalogVariant[];
}

const CATALOG_CUSTOMERS = [
  { id: "cus_1", label: "Ada Lovelace", detail: "ada@example.com · 4 visits" },
  { id: "cus_2", label: "Grace Hopper", detail: "grace@example.com · 1 visit" },
];

const SAMPLE_ROWS = [
  { night: "Fri 12 Sep", tier: "General", sold: 184, held: 12 },
  { night: "Sat 13 Sep", tier: "General", sold: 220, held: 0 },
  { night: "Sat 13 Sep", tier: "Terrace", sold: 40, held: 4 },
];

export const UI_CATALOG: readonly CatalogEntry[] = [
  {
    id: "button",
    title: "Button",
    file: "button.tsx",
    why: "Every action an operator takes. The destructive and disabled states are the ones that carry meaning — a confirm that cannot proceed must look like it cannot proceed.",
    variants: [
      {
        id: "variants",
        label: "All variants",
        render: () => (
          <div className="flex flex-wrap gap-2">
            <Button>Confirm</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Cancel event</Button>
            <Button variant="link">Open the order</Button>
          </div>
        ),
      },
      {
        id: "disabled",
        label: "Disabled",
        render: () => (
          <div className="flex flex-wrap gap-2">
            <Button disabled>Confirm</Button>
            <Button variant="destructive" disabled>
              Cancel event
            </Button>
          </div>
        ),
      },
      {
        id: "sizes",
        label: "Sizes",
        render: () => (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">Small</Button>
            <Button>Default</Button>
            <Button size="lg">Large</Button>
          </div>
        ),
      },
    ],
  },
  {
    id: "badge",
    title: "Badge",
    file: "badge.tsx",
    why: "Status, and only status. A badge whose colour is the only difference between 'valid' and 'void' fails for the operator who cannot tell them apart, so every variant carries its own word.",
    variants: [
      {
        id: "variants",
        label: "All variants",
        render: () => (
          <div className="flex flex-wrap gap-2">
            <Badge>Sold out</Badge>
            <Badge variant="secondary">On sale</Badge>
            <Badge variant="outline">Draft</Badge>
            <Badge variant="muted">Archived</Badge>
            <Badge variant="success">Admitted</Badge>
          </div>
        ),
      },
    ],
  },
  {
    id: "tabs",
    title: "Tabs",
    file: "tabs.tsx",
    why: "Named by the blueprints as the missing primitive behind roughly a hundred operational screens. Manual activation, so arrowing across a strip does not fire three server fetches.",
    variants: [
      {
        id: "default",
        label: "Three panels",
        render: () => (
          <Tabs defaultValue="tonight">
            <TabsList>
              <TabsTrigger value="tonight">Tonight</TabsTrigger>
              <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
              <TabsTrigger value="past">Past</TabsTrigger>
            </TabsList>
            <TabsContent value="tonight">184 admissions sold, 12 held.</TabsContent>
            <TabsContent value="upcoming">Four nights on sale.</TabsContent>
            <TabsContent value="past">Nothing to settle.</TabsContent>
          </Tabs>
        ),
      },
      {
        id: "disabled-trigger",
        label: "With a disabled tab",
        render: () => (
          <Tabs defaultValue="floor">
            <TabsList>
              <TabsTrigger value="floor">Floor</TabsTrigger>
              <TabsTrigger value="kitchen" disabled>
                Kitchen
              </TabsTrigger>
            </TabsList>
            <TabsContent value="floor">Twelve tables seated.</TabsContent>
            <TabsContent value="kitchen">No preparation stations configured.</TabsContent>
          </Tabs>
        ),
      },
    ],
  },
  {
    id: "table",
    title: "Table",
    file: "table.tsx",
    why: "Real table semantics for the operational lists that are grids of divs today. Header association and a caption come from the browser once the markup is right.",
    variants: [
      {
        id: "rows",
        label: "With rows",
        render: () => (
          <Table caption="Admissions sold by night and tier">
            <TableHeader>
              <TableRow>
                <TableHead>Night</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Sold</TableHead>
                <TableHead>Held</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {SAMPLE_ROWS.map((row) => (
                <TableRow key={`${row.night}-${row.tier}`}>
                  <TableCell>{row.night}</TableCell>
                  <TableCell>{row.tier}</TableCell>
                  <TableCell>{row.sold}</TableCell>
                  <TableCell>{row.held}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ),
      },
      {
        id: "empty",
        label: "Empty",
        render: () => (
          <Table caption="Admissions sold by night and tier">
            <TableHeader>
              <TableRow>
                <TableHead>Night</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Sold</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableEmpty colSpan={3}>No nights on sale yet.</TableEmpty>
            </TableBody>
          </Table>
        ),
      },
      {
        id: "row-headers",
        label: "Row headers",
        render: () => (
          <Table caption="Capacity by tier">
            <TableHeader>
              <TableRow>
                <TableHead>Tier</TableHead>
                <TableHead>Capacity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableHead scope="row">General</TableHead>
                <TableCell>240</TableCell>
              </TableRow>
              <TableRow>
                <TableHead scope="row">Terrace</TableHead>
                <TableCell>44</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        ),
      },
    ],
  },
  {
    id: "dialog",
    title: "Dialog",
    file: "dialog.tsx",
    why: "The interrupting confirmation, as opposed to Sheet's return-to-your-list workflow. Destructive dialogs drop scrim dismissal so both outcomes are chosen.",
    variants: [
      {
        id: "closed",
        label: "Trigger (closed)",
        render: () => (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="destructive">Cancel event</Button>
            </DialogTrigger>
            <DialogContent
              title="Cancel Friday 12 September?"
              description="47 admissions will be voided and refunded."
              destructive
            >
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Keep the event</Button>
                </DialogClose>
                <Button variant="destructive">Cancel and refund</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ),
      },
      {
        id: "open",
        label: "Open, destructive",
        render: () => (
          <Dialog open>
            <DialogContent
              title="Cancel Friday 12 September?"
              description="47 admissions will be voided and refunded."
              destructive
            >
              <DialogFooter>
                <Button variant="outline">Keep the event</Button>
                <Button variant="destructive">Cancel and refund</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ),
      },
    ],
  },
  {
    id: "impact-preview",
    title: "ImpactPreview",
    file: "impact-preview.tsx",
    why: "The money, allocation, guest-promise and message consequences of an action, shown before it is confirmed. Every blueprint asks for this; nothing had it.",
    variants: [
      {
        id: "ready",
        label: "Ready",
        render: () => (
          <ImpactPreview
            impact={{
              status: "ready",
              effects: [
                {
                  channel: "money",
                  summary: "Refund 47 ticket lines",
                  amountCents: -235000,
                  currency: "EUR",
                },
                {
                  channel: "money",
                  summary: "Booking fees retained",
                  amountCents: 4700,
                  currency: "EUR",
                },
                {
                  channel: "allocation",
                  summary: "Release seats from the Friday pool",
                  count: 47,
                },
                {
                  channel: "promise",
                  summary: "Guests keep their table reservation for the Saturday night",
                },
                {
                  channel: "message",
                  summary: "Send the event-cancelled notice",
                  detail: "One email per buyer, not per ticket",
                  count: 41,
                },
              ],
              blockers: [],
            }}
          />
        ),
      },
      {
        id: "blocked",
        label: "Blocked",
        render: () => (
          <ImpactPreview
            impact={{
              status: "ready",
              effects: [
                {
                  channel: "money",
                  summary: "Refund the bundle",
                  amountCents: -12000,
                  currency: "EUR",
                },
              ],
              blockers: [
                {
                  summary: "The dinner benefit was already consumed",
                  detail: "Redeemed at 21:04 on the terrace check",
                },
              ],
            }}
          />
        ),
      },
      {
        id: "unavailable",
        label: "Unavailable",
        render: () => (
          <ImpactPreview
            impact={{
              status: "unavailable",
              reason: "We could not read the capacity pool, so the seat consequences are unknown.",
            }}
          />
        ),
      },
      {
        id: "empty",
        label: "Nothing happens",
        render: () => (
          <ImpactPreview
            impact={{ status: "ready", effects: [], blockers: [] }}
            emptyLabel="This booking has no deposit to release and no guest to notify."
          />
        ),
      },
    ],
  },
  {
    id: "search-or-create-picker",
    title: "SearchOrCreatePicker",
    file: "search-or-create-picker.tsx",
    why: "The most repeated contract in the blueprints: search existing, create when authorized, keep the parent draft, return focus to the trigger, and find a created-but-unattached object again on retry.",
    variants: [
      {
        id: "closed",
        label: "Trigger (closed)",
        render: () => (
          <SearchOrCreatePicker
            title="Customer"
            description="Attach an existing customer, or create one without leaving this booking."
            trigger={<Button variant="outline">Choose a customer</Button>}
            onSearch={async (query) =>
              CATALOG_CUSTOMERS.filter((customer) =>
                customer.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
              )
            }
            onCreate={async ({ query }) => ({ id: `new-${query}`, label: query })}
            onAttach={async () => {}}
          />
        ),
      },
    ],
  },
  {
    id: "empty-state",
    title: "EmptyState",
    file: "empty-state.tsx",
    why: "Absence with a next action. An operational screen with nothing on it is either onboarding or a filter mistake, and the copy has to say which.",
    variants: [
      {
        id: "with-cta",
        label: "With a call to action",
        render: () => (
          <EmptyState
            icon={CalendarX2}
            title="No nights on sale"
            description="Schedule a night to start selling admissions."
            hint="Tip: publish the event first, then add nights."
          >
            <Button>Schedule a night</Button>
          </EmptyState>
        ),
      },
    ],
  },
  {
    id: "card",
    title: "Card",
    file: "card.tsx",
    why: "The surface every operational panel sits on.",
    variants: [
      {
        id: "default",
        label: "Header and content",
        render: () => (
          <Card>
            <CardHeader>
              <CardTitle>Friday 12 September</CardTitle>
              <CardDescription>Doors 21:00 · 184 of 240 sold</CardDescription>
            </CardHeader>
            <CardContent>Twelve admissions are held by the box office lane.</CardContent>
          </Card>
        ),
      },
    ],
  },
  {
    id: "input",
    title: "Input",
    file: "input.tsx",
    why: "Text entry. Registered with a Label in every variant, because an input with a floating placeholder and no label is the single most common accessibility failure in this repo.",
    variants: [
      {
        id: "labelled",
        label: "Labelled",
        render: () => (
          <div className="space-y-1.5">
            <Label htmlFor="catalog-input">Guest name</Label>
            <Input id="catalog-input" placeholder="Ada Lovelace" />
          </div>
        ),
      },
      {
        id: "disabled",
        label: "Disabled",
        render: () => (
          <div className="space-y-1.5">
            <Label htmlFor="catalog-input-disabled">Order reference</Label>
            <Input id="catalog-input-disabled" defaultValue="ORD-4821" disabled />
          </div>
        ),
      },
    ],
  },
  {
    id: "label",
    title: "Label",
    file: "label.tsx",
    why: "Registered in its own right rather than only as furniture inside the Input entry: `htmlFor` pointing at nothing is invisible on screen and total for a screen reader, and it only shows up when the label is the subject of the test.",
    variants: [
      {
        id: "for-control",
        label: "Bound to a control",
        render: () => (
          <div className="space-y-1.5">
            <Label htmlFor="catalog-label-target">Party size</Label>
            <Input id="catalog-label-target" type="number" defaultValue={4} />
          </div>
        ),
      },
    ],
  },
  {
    id: "switch",
    title: "Switch",
    file: "switch.tsx",
    why: "A two-state setting that takes effect immediately. Pause online bookings is one of these, which is why the label association matters more than usual.",
    variants: [
      {
        id: "labelled",
        label: "Labelled",
        render: () => (
          <div className="flex items-center gap-3">
            <Switch id="catalog-switch" />
            <Label htmlFor="catalog-switch">Pause online bookings</Label>
          </div>
        ),
      },
    ],
  },
  {
    id: "skeleton",
    title: "Skeleton",
    file: "skeleton.tsx",
    why: "Loading, shaped like the thing that is loading.",
    variants: [
      {
        id: "lines",
        label: "Lines",
        render: () => (
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        ),
      },
    ],
  },
];
