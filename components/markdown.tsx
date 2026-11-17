// The assistant's replies: Streamdown (streaming-safe markdown) with KaTeX for $…$ and $$…$$.
// While a reply streams, each new word fades in (opacity only, so it never moves or reflows the line)
// on the strong ease-out; there's no caret, as the arriving words already mark where the reply is.
// With onPageLink, a page link (#axiom-page-N, made by features/cas/ai/page-links.ts) opens that page;
// every other link renders as Streamdown's own.
import * as React from "react"
import { createMathPlugin } from "@streamdown/math"
import { defaultComponents, Streamdown, type Components } from "streamdown"
import "katex/dist/katex.min.css"
import "streamdown/styles.css"

import { cn } from "@/lib/utils"

const math = createMathPlugin({ singleDollarTextMath: true })

const PAGE = /^#axiom-page-(\d+)$/

export function Markdown({
  children,
  streaming = false,
  className,
  onPageLink,
}: {
  children: string
  streaming?: boolean
  className?: string
  onPageLink?: (page: number) => void
}) {
  // The newest handler, read at click time, so the components (and the parsed reply) stay the same between renders.
  const handler = React.useRef(onPageLink)
  handler.current = onPageLink
  const components = React.useMemo<Components>(
    () => ({
      a: (props) => {
        const m = PAGE.exec(props.href ?? "")
        if (!m) return <defaultComponents.a {...props} />
        return (
          <a
            href={props.href}
            onClick={(e) => {
              e.preventDefault()
              handler.current?.(Number(m[1]))
            }}
            className="font-medium text-sky-300 underline decoration-sky-300/40 underline-offset-2 transition-colors hover:decoration-sky-300"
          >
            {props.children}
          </a>
        )
      },
    }),
    []
  )
  return (
    <Streamdown
      className={cn(
        "text-sm leading-relaxed text-foreground [&_.katex]:text-[1.08em] [&_.katex-display]:my-2 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_strong]:font-semibold [&_p]:my-0 [&>*+*]:mt-2",
        className
      )}
      plugins={{ math }}
      components={onPageLink ? components : undefined}
      isAnimating={streaming}
      animated={{ animation: "fadeIn", duration: 280, easing: "cubic-bezier(0.23, 1, 0.32, 1)", sep: "word", stagger: 24 }}
      controls={false}
    >
      {children}
    </Streamdown>
  )
}
