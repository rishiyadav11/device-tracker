"use client";

import { useState } from "react";
import { Copy, Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function EnrollWindows() {
  const [loading, setLoading] = useState(false);
  const [enrollCommand, setEnrollCommand] = useState<string | null>(null);
  const [uninstallCommand, setUninstallCommand] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setLoading(true);
    const res = await fetch("/api/enroll-token", { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      toast.error("Could not generate the command");
      return;
    }
    const data = await res.json();
    setEnrollCommand(data.enrollCommand);
    setUninstallCommand(data.uninstallCommand);
    setCopied(false);
  };

  const copy = async () => {
    if (!enrollCommand) return;
    await navigator.clipboard.writeText(enrollCommand);
    setCopied(true);
    toast.success("Command copied");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-4">
      <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
        <li>Click Generate to create your install command.</li>
        <li>
          On the Windows PC you want to track, open <b>PowerShell</b> (press
          Start, type &quot;PowerShell&quot;, press Enter).
        </li>
        <li>
          Paste the command and press Enter. The PC starts reporting its
          location in the background — <b>no browser needed on that PC</b>.
        </li>
      </ol>

      {!enrollCommand ? (
        <Button onClick={generate} disabled={loading} className="self-start">
          {loading ? "Generating…" : "Generate install command"}
        </Button>
      ) : (
        <>
          <div className="rounded-md border bg-muted p-3">
            <div className="flex items-start gap-2">
              <code className="flex-1 break-all text-xs">{enrollCommand}</code>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={copy}
                aria-label="Copy command"
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={generate}
            disabled={loading}
            className="self-start"
          >
            <RefreshCw className="size-4" />
            Generate a new command
          </Button>
        </>
      )}

      <div className="space-y-1 text-xs text-muted-foreground">
        <p>
          You can run the same command on as many Windows PCs as you like — each
          appears as its own device (named after the PC). It reports at logon
          and every 2 minutes, and runs hidden in the background.
        </p>
        <p>
          <b>For best accuracy</b>, turn on Windows Location (Settings → Privacy
          &amp; security → Location). Without it, the PC reports a rough,
          IP-based location.
        </p>
        <p>
          This command contains a private key for your account. Generating a new
          one invalidates the previous command.
        </p>
        {uninstallCommand && (
          <p>
            To stop tracking a PC, run this in its PowerShell:{" "}
            <code className="break-all">{uninstallCommand}</code>
          </p>
        )}
      </div>
    </div>
  );
}
