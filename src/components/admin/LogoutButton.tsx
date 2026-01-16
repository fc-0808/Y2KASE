'use client'

import { logoutAction } from '@/app/actions/auth'

export default function LogoutButton() {
  return (
    <button
      onClick={() => logoutAction()}
      className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:border-gray-400"
    >
      Logout
    </button>
  )
}
