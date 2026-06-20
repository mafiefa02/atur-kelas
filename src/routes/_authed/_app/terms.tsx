import { createFileRoute, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import { createTerm, deleteTerm, listTerms, setActiveTerm } from "#/lib/server/terms.ts";

export const Route = createFileRoute("/_authed/_app/terms")({
  loader: () => listTerms(),
  component: TermsPage,
});

function TermsPage() {
  const terms = Route.useLoaderData();
  const router = useRouter();
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await createTerm({
        data: { name, startDate: startDate || undefined, endDate: endDate || undefined },
      });
      setName("");
      setStartDate("");
      setEndDate("");
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create term.");
    } finally {
      setPending(false);
    }
  }

  async function onSetActive(termId: string) {
    await setActiveTerm({ data: { termId } });
    await router.invalidate();
  }

  async function onDelete(termId: string) {
    await deleteTerm({ data: { termId } });
    await router.invalidate();
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="font-heading text-xl font-semibold">Terms</h1>
        <p className="text-sm text-muted-foreground">
          Each semester is a term. Classes, bell schedule, curriculum, and assignments all belong to
          the active term.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add a term</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={onCreate}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="2026/2027 Ganjil"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="start">Start</Label>
              <Input
                id="start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="end">End</Label>
              <Input
                id="end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              disabled={pending}
            >
              {pending ? "Adding…" : "Add"}
            </Button>
          </form>
          {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All terms</CardTitle>
        </CardHeader>
        <CardContent>
          {terms.length === 0 ? (
            <p className="text-sm text-muted-foreground">No terms yet. Add your first one above.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {terms.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {t.startDate ?? "—"} → {t.endDate ?? "—"}
                    </TableCell>
                    <TableCell>
                      {t.isActive ? (
                        <Badge>Active</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {!t.isActive ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onSetActive(t.id)}
                          >
                            Set active
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => onDelete(t.id)}
                          disabled={t.isActive}
                          title={t.isActive ? "Set another term active before deleting" : undefined}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
