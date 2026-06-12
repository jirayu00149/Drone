"use client"

import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { MoveRight, PhoneCall } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type HeroAction = {
  label: string
  href: string
}

interface AnimatedHeroProps {
  eyebrow?: string
  title?: string
  words?: string[]
  description?: string
  primaryAction?: HeroAction
  secondaryAction?: HeroAction
  className?: string
}

export function AnimatedHero({
  eyebrow = "Hatyai Drone Rescue",
  title = "Coordinate rescue work with",
  words,
  description = "Track missing-person reports, drone candidate matches, and field status updates from one focused rescue operations surface.",
  primaryAction = { label: "Open case search", href: "/search.html" },
  secondaryAction = { label: "Call command desk", href: "tel:+66000000000" },
  className
}: AnimatedHeroProps) {
  const rotatingWords = useMemo(() => {
    const providedWords = words?.filter(Boolean)
    return providedWords?.length
      ? providedWords
      : ["public reports", "drone teams", "field logs", "human review"]
  }, [words])
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % rotatingWords.length)
    }, 2400)

    return () => window.clearInterval(timer)
  }, [rotatingWords.length])

  return (
    <section
      className={cn(
        "relative isolate flex min-h-[640px] items-center overflow-hidden bg-background px-6 py-24 text-foreground sm:px-10",
        className
      )}
    >
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.22),transparent_34%),linear-gradient(135deg,hsl(var(--background)),hsl(var(--muted)))]" />
      <div className="mx-auto grid w-full max-w-6xl gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className="max-w-3xl">
          <motion.p
            className="mb-5 text-sm font-semibold uppercase tracking-[0.18em] text-primary"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
          >
            {eyebrow}
          </motion.p>

          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-6xl lg:text-7xl">
            {title}{" "}
            <span className="relative inline-flex min-h-[1.15em] min-w-[9ch] overflow-hidden align-bottom text-primary">
              <motion.span
                key={rotatingWords[activeIndex]}
                className="absolute left-0 top-0"
                initial={{ y: "100%", opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: "-100%", opacity: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 28 }}
              >
                {rotatingWords[activeIndex]}
              </motion.span>
            </span>
          </h1>

          <motion.p
            className="mt-6 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.45 }}
          >
            {description}
          </motion.p>

          <motion.div
            className="mt-8 flex flex-col gap-3 sm:flex-row"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22, duration: 0.45 }}
          >
            <Button asChild size="lg">
              <a href={primaryAction.href}>
                {primaryAction.label}
                <MoveRight className="h-4 w-4" />
              </a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href={secondaryAction.href}>
                <PhoneCall className="h-4 w-4" />
                {secondaryAction.label}
              </a>
            </Button>
          </motion.div>
        </div>

        <motion.div
          className="rounded-2xl border bg-card/75 p-6 shadow-2xl backdrop-blur"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.18, duration: 0.5 }}
        >
          <div className="grid gap-4">
            {[
              ["Active cases", "18"],
              ["Drone candidates", "7"],
              ["Awaiting review", "4"]
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between rounded-xl border bg-background/80 px-5 py-4">
                <span className="text-sm text-muted-foreground">{label}</span>
                <strong className="text-2xl">{value}</strong>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
