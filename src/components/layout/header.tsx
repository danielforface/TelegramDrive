import { CloudLightning } from 'lucide-react';
import Link from 'next/link';

export function Header() {
  return (
    <header className="py-4 px-4 sm:px-6 lg:px-8 border-b border-border shadow-sm">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <CloudLightning className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-semibold text-foreground">
            Telegram Cloudifier
          </h1>
        </Link>
        {/* Future user menu or actions can go here */}
      </div>
    </header>
  );
}
