import type { ReactNode } from "react";

import { BottomNav } from "./BottomNav";

export function Layout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto min-h-screen max-w-lg pb-20 md:pb-8">
      <header className="sticky top-0 z-10 border-b border-gray-100 bg-gray-50/95 px-4 py-4 backdrop-blur">
        <h1 className="text-lg font-semibold text-brand">{title}</h1>
      </header>
      <main className="px-4 py-4">{children}</main>
      <BottomNav />
    </div>
  );
}
