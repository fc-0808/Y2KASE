export default function CartLoading() {
  return (
    <main className="min-h-screen bg-y2k-soft">
      {/* Skeleton Navigation */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md shadow-lg h-16" />

      {/* Page Content */}
      <div className="pt-28 pb-16">
        <div className="container-y2k">
          {/* Header Skeleton */}
          <div className="mb-10 text-center">
            <div className="w-12 h-12 bg-pink-100 rounded-full animate-pulse mx-auto mb-3" />
            <div className="h-8 w-40 bg-pink-100 rounded-full animate-pulse mx-auto mb-2" />
            <div className="h-4 w-56 bg-pink-50 rounded-full animate-pulse mx-auto" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
            {/* Cart Items Skeleton */}
            <div className="lg:col-span-2">
              <div className="card-y2k overflow-hidden">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="p-6 border-b border-pink-100 flex gap-4">
                    <div className="w-20 h-24 bg-pink-100 rounded-xl animate-pulse shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-5 w-40 bg-pink-100 rounded-full animate-pulse" />
                      <div className="h-3 w-24 bg-pink-50 rounded-full animate-pulse" />
                      <div className="h-8 w-28 bg-pink-50 rounded-full animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary Skeleton */}
            <div className="lg:col-span-1">
              <div className="card-y2k overflow-hidden">
                <div className="p-6 space-y-4">
                  <div className="h-6 w-32 bg-pink-100 rounded-full animate-pulse" />
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex justify-between">
                      <div className="h-4 w-20 bg-pink-50 rounded-full animate-pulse" />
                      <div className="h-4 w-16 bg-pink-50 rounded-full animate-pulse" />
                    </div>
                  ))}
                  <div className="h-12 w-full bg-pink-200 rounded-full animate-pulse mt-4" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
