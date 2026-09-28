"use client";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/misc";

// Never show stack traces or internal messages to users.
export default function RouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <ErrorState title="Something went wrong" message="This page hit an unexpected problem. Your files were not affected." action={<Button onClick={reset}>Try again</Button>} />
    </div>
  );
}
