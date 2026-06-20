import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";

import { Button } from "#/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import { createClass, deleteClass, listClasses } from "#/lib/server/classes.ts";
import { listGradeLevels } from "#/lib/server/grade-levels.ts";

export const Route = createFileRoute("/_authed/_app/classes")({
  loader: async () => {
    const [classes, grades] = await Promise.all([listClasses(), listGradeLevels()]);
    return { classes, grades };
  },
  component: ClassesPage,
});

function ClassesPage() {
  const { classes, grades } = Route.useLoaderData();
  const router = useRouter();
  const [gradeLevelId, setGradeLevelId] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!gradeLevelId) {
      setError("Pick a grade level.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await createClass({ data: { gradeLevelId, name } });
      setName("");
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add class.");
    } finally {
      setPending(false);
    }
  }

  async function onDelete(id: string) {
    setError(null);
    try {
      await deleteClass({ data: { id } });
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete.");
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="font-heading text-xl font-semibold">Classes</h1>
        <p className="text-sm text-muted-foreground">
          Class groups (rombel) for the active term, e.g. 7A, 7B. Each belongs to a grade level.
        </p>
      </div>

      {grades.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Add some{" "}
            <Link
              to="/grades"
              className="text-primary hover:underline"
            >
              grade levels
            </Link>{" "}
            first — every class belongs to a grade.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Add a class</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={onCreate}
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
            >
              <div className="flex flex-col gap-2">
                <Label>Grade</Label>
                <Select
                  value={gradeLevelId}
                  onValueChange={(v) => setGradeLevelId(v as string)}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue>
                      {(v: string | null) =>
                        v ? (grades.find((g) => g.id === v)?.name ?? "") : "Pick a grade"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {grades.map((g) => (
                      <SelectItem
                        key={g.id}
                        value={g.id}
                      >
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="name">Class name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="7A"
                  required
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
      )}

      <Card>
        <CardHeader>
          <CardTitle>All classes</CardTitle>
        </CardHeader>
        <CardContent>
          {classes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No classes yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Grade</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classes.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-muted-foreground">{c.gradeName}</TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => onDelete(c.id)}
                      >
                        Delete
                      </Button>
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
