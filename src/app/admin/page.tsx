import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser, logoutAction } from '@/app/actions/auth'

export default async function AdminDashboard() {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/admin/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Admin Dashboard</h1>
          <form action={logoutAction}>
            <button
              type="submit"
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:border-gray-400"
            >
              Logout
            </button>
          </form>
        </div>

        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-800">
            ✅ Logged in as: <strong>{user.email}</strong>
          </p>
          {process.env.USE_ADMIN_AUTH === 'true' && (
            <p className="text-xs text-green-600 mt-1">
              (Development mode - using admin authentication)
            </p>
          )}
        </div>
        
        <div className="grid md:grid-cols-2 gap-6">
          <Link
            href="/admin/products/new"
            className="bg-white p-8 rounded-xl border-2 border-gray-200 hover:border-pink-500 transition-colors"
          >
            <div className="text-4xl mb-4">📦</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Create Product</h2>
            <p className="text-gray-600">Add new products with images and videos</p>
          </Link>

          <div className="bg-white p-8 rounded-xl border-2 border-gray-200 opacity-50">
            <div className="text-4xl mb-4">📋</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Manage Products</h2>
            <p className="text-gray-600">Coming soon</p>
          </div>
        </div>
      </div>
    </div>
  )
}
