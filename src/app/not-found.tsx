import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <p className="text-sm font-medium text-accent">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 text-muted">The page you&apos;re looking for doesn&apos;t exist or has moved.</p>
      <div className="mt-6 flex gap-2">
        <Link href="/" className={buttonClasses()}>
          Go to dashboard
        </Link>
        <Link href="/tools" className={buttonClasses("secondary")}>
          Browse tools
        </Link>
      </div>
    </div>
  );
}
