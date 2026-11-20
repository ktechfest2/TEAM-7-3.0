/**
 * Every app screen sits on one full-width paper background, edge to edge.
 * Reading screens keep a narrow column; data-heavy screens render <WidePage /> to get a wide one.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 bg-bg px-4 py-6 md:px-8 md:py-12">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 md:gap-6">{children}</div>
    </div>
  );
}
