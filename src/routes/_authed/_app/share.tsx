import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "#/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import { getShareLinks } from "#/lib/server/share.ts";

export const Route = createFileRoute("/_authed/_app/share")({
  loader: () => getShareLinks(),
  component: SharePage,
});

function SharePage() {
  const classes = Route.useLoaderData();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="font-heading text-xl font-semibold">Share links</h1>
        <p className="text-sm text-muted-foreground">
          A read-only public link per class — share it in WhatsApp groups. Links show the{" "}
          <span className="font-medium">published</span> timetable; publish (or re-publish after
          edits) on the Timetable page to update what they show.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Public class links</CardTitle>
        </CardHeader>
        <CardContent>
          {classes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No classes yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class</TableHead>
                  <TableHead>Public link</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classes.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {c.gradeName} {c.name}
                    </TableCell>
                    <TableCell>
                      <LinkCell token={c.token} />
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

function LinkCell({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== "undefined" ? `${window.location.origin}/p/${token}` : `/p/${token}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — the field is selectable as a fallback
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        readOnly
        value={url}
        className="font-mono text-xs"
        onFocus={(e) => e.target.select()}
      />
      <Button
        size="sm"
        variant="outline"
        onClick={copy}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
