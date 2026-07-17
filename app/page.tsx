import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MapPin, Laptop, Smartphone } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 p-6 text-center">
      <div className="flex items-center gap-3 text-muted-foreground">
        <Laptop className="size-8" />
        <MapPin className="size-6" />
        <Smartphone className="size-8" />
      </div>
      <div className="max-w-xl">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          Know where your devices are
        </h1>
        <p className="mt-4 text-muted-foreground">
          Register your laptop and phone, grant location access once, and
          check in on them from any browser, anytime.
        </p>
      </div>
      <div className="flex gap-3">
        <Button render={<Link href="/register" />} nativeButton={false} size="lg">
          Get started
        </Button>
        <Button
          render={<Link href="/login" />}
          nativeButton={false}
          size="lg"
          variant="outline"
        >
          Sign in
        </Button>
      </div>
    </div>
  );
}
