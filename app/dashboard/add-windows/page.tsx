import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EnrollWindows } from "@/components/enroll-windows";

export default async function AddWindowsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Add a Windows PC</h1>
        <p className="text-muted-foreground mt-1">
          Track a Windows laptop or PC in the background — even when no browser
          is open.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Install via PowerShell</CardTitle>
          <CardDescription>
            One command sets everything up. Nothing else to install.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EnrollWindows />
        </CardContent>
      </Card>
    </div>
  );
}
