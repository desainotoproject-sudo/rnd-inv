import * as React from "react"

/**
 * Client-side infinite scroll (window-on) for large filtered lists.
 *
 * Renders only the first `pageSize` rows and reveals more as the user scrolls
 * to a sentinel element. Helps keep long list pages light (fewer DOM nodes).
 *
 * The visible window resets to the first page whenever `items` (the memoized,
 * filtered list) changes identity — i.e. when the user searches/filters or a
 * fresh dataset is loaded.
 */
export function useInfiniteRows<T>(items: T[], pageSize = 15) {
  const [visible, setVisible] = React.useState(pageSize)
  const sentinelRef = React.useRef<HTMLDivElement | null>(null)

  const hasMore = visible < items.length

  // Reset to the first page whenever the underlying (filtered) list changes.
  React.useEffect(() => {
    setVisible(pageSize)
  }, [items, pageSize])

  // Grow the visible window when the sentinel enters the viewport.
  React.useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisible((v) => (v < items.length ? Math.min(items.length, v + pageSize) : v))
        }
      },
      { rootMargin: "200px" }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [sentinelRef, items.length, pageSize])

  return { shown: items.slice(0, visible), hasMore, sentinelRef }
}
