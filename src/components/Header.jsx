import { signOut } from '../lib/auth'

export default function Header({ title, subtitle, onSignOut }) {
  async function handleSignOut() {
    await signOut()
    if (onSignOut) onSignOut()
  }

  return (
    <header className="mb-8 flex flex-col gap-4 border-b border-gray-800 pb-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm text-gray-400">{subtitle}</p>
        )}
      </div>
      <button
        type="button"
        onClick={handleSignOut}
        className="rounded-lg border border-gray-600 bg-gray-800 px-4 py-2 text-sm font-medium text-gray-200 transition hover:bg-gray-700"
      >
        Sair
      </button>
    </header>
  )
}
