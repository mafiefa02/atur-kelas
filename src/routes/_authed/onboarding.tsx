import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";

import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import { authClient } from "#/lib/auth-client.ts";

export const Route = createFileRoute("/_authed/onboarding")({
  beforeLoad: ({ context }) => {
    // Already has an active organization — nothing to onboard.
    if (context.session?.activeOrganizationId) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: OnboardingPage,
});

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function OnboardingPage() {
  const router = useRouter();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const slug = slugify(name);
    if (!slug) {
      setError("Please enter a school name.");
      setPending(false);
      return;
    }

    const { data, error: createError } = await authClient.organization.create({ name, slug });
    if (createError || !data) {
      setError(createError?.message ?? "Could not create the school.");
      setPending(false);
      return;
    }

    // create() doesn't reliably set the active org on the session — do it explicitly
    // so the dashboard guard sees activeOrganizationId.
    await authClient.organization.setActive({ organizationId: data.id });
    await router.invalidate();
    await navigate({ to: "/dashboard" });
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Buat sekolah</CardTitle>
          <CardDescription>
            Create your school to get started. You can invite teachers later.
          </CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">School name</Label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="SMP Negeri 1"
                required
              />
              {name ? (
                <p className="text-xs text-muted-foreground">
                  URL slug: <span className="font-mono">{slugify(name) || "…"}</span>
                </p>
              ) : null}
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </CardContent>
          <CardFooter className="mt-4">
            <Button
              type="submit"
              className="w-full"
              disabled={pending}
            >
              {pending ? "Creating…" : "Create school"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
