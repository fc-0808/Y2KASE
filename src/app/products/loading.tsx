export default function ProductsLoading() {
  return (
    <main className="min-h-screen bg-y2k-soft">
      {/* Skeleton Navigation */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md shadow-lg h-16" />

      {/* Page Header Skeleton */}
      <section className="pt-28 pb-12">
        <div className="container-y2k">
          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-pink-100 rounded-full animate-pulse mb-3" />
            <div className="h-8 w-48 bg-pink-100 rounded-full animate-pulse mb-3" />
            <div className="h-4 w-64 bg-pink-50 rounded-full animate-pulse" />
          </div>
        </div>
      </section>

      {/* Products Grid Skeleton */}
      <div className="container-y2k py-10">
        <div className="flex gap-10">
          {/* Sidebar Skeleton */}
          <aside className="hidden lg:block w-60 shrink-0">
            <div className="card-y2k p-6 space-y-4">
              <div className="h-6 w-32 bg-pink-100 rounded-full animate-pulse" />
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 bg-pink-50 rounded-full animate-pulse" />
              ))}
            </div>
          </aside>

          {/* Products Skeleton */}
          <div className="flex-1">
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="group">
                  <div className="card-y2k overflow-hidden mb-4">
                    <div className="aspect-3/4 bg-pink-100 animate-pulse" />
                  </div>
                  <div className="text-center space-y-2">
                    <div className="h-4 w-24 mx-auto bg-pink-100 rounded-full animate-pulse" />
                    <div className="h-5 w-32 mx-auto bg-pink-50 rounded-full animate-pulse" />
                    <div className="h-4 w-16 mx-auto bg-pink-100 rounded-full animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
