"use client";

import { useState } from "react";
import { Monitor, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function WindowsAgentSetup({ deviceId }: { deviceId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [installCommand, setInstallCommand] = useState<string | null>(null);
  const [uninstallCommand, setUninstallCommand] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setLoading(true);
    const res = await fetch(`/api/devices/${deviceId}/agent-setup`, {
      method: "POST",
    });
    setLoading(false);
    if (!res.ok) {
      toast.error("Could not generate the setup command");
      return;
    }
    const data = await res.json();
    setInstallCommand(data.installCommand);
    setUninstallCommand(data.uninstallCommand);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && !installCommand) generate();
    if (!next) setCopied(false);
  };

  const copy = async () => {
    if (!installCommand) return;
    await navigator.clipboard.writeText(installCommand);
    setCopied(true);
    toast.success("Command copied");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Monitor className="size-4" />
        Track on Windows
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Track this Windows PC in the background</DialogTitle>
          <DialogDescription>
            This installs a small agent that reports the PC&apos;s location even
            when no browser is open — at logon and every 10 minutes.
          </DialogDescription>
        </DialogHeader>

        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            On the Windows PC you want to track, open <b>PowerShell</b> (press
            Start, type &quot;PowerShell&quot;, press Enter).
          </li>
          <li>Paste the command below and press Enter.</li>
        </ol>

        <div className="rounded-md border bg-muted p-3">
          {loading || !installCommand ? (
            <p className="text-sm text-muted-foreground">
              Generating command…
            </p>
          ) : (
            <div className="flex items-start gap-2">
              <code className="flex-1 break-all text-xs">{installCommand}</code>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={copy}
                aria-label="Copy command"
              >
                {copied ? (
                  <Check className="size-4" />
                ) : (
                  <Copy className="size-4" />
                )}
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-1 text-xs text-muted-foreground">
          <p>
            <b>Note:</b> for best accuracy, turn on Windows Location (Settings →
            Privacy &amp; security → Location). Without it, the PC reports a
            rough, IP-based location. Desktops without WiFi are always
            approximate.
          </p>
          <p>
            This command contains a one-time key for this device. Generating it
            again replaces the key and stops any previously installed agent.
          </p>
          {uninstallCommand && (
            <p>
              To stop tracking later, run in PowerShell:{" "}
              <code className="break-all">{uninstallCommand}</code>
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
