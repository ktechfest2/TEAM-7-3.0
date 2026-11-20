/** Home, and the fallback for any route without its own loader: a hero band and a few cards. */
export default function Loading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading" className="flex flex-1 flex-col">
      <div className="h-80 animate-pulse bg-frame-2 md:h-[28rem]" />
      <div className="mx-auto grid w-full max-w-7xl gap-3 px-4 py-4 md:grid-cols-2 md:gap-4 md:px-8 md:py-8">
        {[0, 1].map((i) => <div key={i} className="card h-64 animate-pulse" />)}
      </div>
    </div>
  );
}
