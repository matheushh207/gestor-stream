export default function Card({ title, children, className = '' }) {
  return (
    <div
      className={`rounded-xl border border-gray-800 bg-gray-800/50 p-5 shadow-lg shadow-black/20 ${className}`}
    >
      {title && (
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
          {title}
        </h3>
      )}
      {children}
    </div>
  )
}
