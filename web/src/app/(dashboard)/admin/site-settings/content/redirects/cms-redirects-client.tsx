"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { saveCmsRedirect, setCmsRedirectActive } from "../pages/actions";

type Row = {
  id: string;
  old_path: string;
  new_path: string;
  status_code: number;
  active: boolean;
  updated_at: string;
};

export function CmsRedirectsClient({ initial }: { initial: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [oldPath, setOldPath] = useState("");
  const [newPath, setNewPath] = useState("");
  const [code, setCode] = useState<"301" | "302">("301");

  function addRedirect() {
    setError(null);
    startTransition(async () => {
      const res = await saveCmsRedirect({
        old_path: oldPath,
        new_path: newPath,
        status_code: code,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOldPath("");
      setNewPath("");
      router.refresh();
    });
  }

  function toggle(id: string, active: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await setCmsRedirectActive(id, active);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="space-y-3 rounded-lg border border-border/60 p-4">
        <p className="text-sm font-medium">Add redirect</p>
        <p className="text-xs text-muted-foreground">
          Paths must start with <span className="font-mono">/</span>. Match the browser pathname (e.g.{" "}
          <span className="font-mono">/p/old</span> or <span className="font-mono">/es/p/old</span>).
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="redir-old">Old path</Label>
            <Input
              id="redir-old"
              value={oldPath}
              onChange={(e) => setOldPath(e.target.value)}
              placeholder="/p/old-slug"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="redir-new">New path</Label>
            <Input
              id="redir-new"
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              placeholder="/p/new-slug"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="redir-code">Status</Label>
            <select
              id="redir-code"
              className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              value={code}
              onChange={(e) => setCode(e.target.value as "301" | "302")}
            >
              <option value="301">301 Permanent</option>
              <option value="302">302 Temporary</option>
            </select>
          </div>
          <Button type="button" onClick={addRedirect} disabled={pending}>
            Add
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border/60 text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Old path</th>
              <th className="py-2 pr-4 font-medium">New path</th>
              <th className="py-2 pr-4 font-medium">Code</th>
              <th className="py-2 pr-4 font-medium">Active</th>
              <th className="py-2 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {initial.map((r) => (
              <tr key={r.id} className="border-b border-border/40">
                <td className="py-2 pr-4 font-mono text-xs">{r.old_path}</td>
                <td className="py-2 pr-4 font-mono text-xs">{r.new_path}</td>
                <td className="py-2 pr-4">{r.status_code}</td>
                <td className="py-2 pr-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => toggle(r.id, !r.active)}
                  >
                    {r.active ? "Deactivate" : "Activate"}
                  </Button>
                </td>
                <td className="py-2 text-muted-foreground">
                  {new Date(r.updated_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
