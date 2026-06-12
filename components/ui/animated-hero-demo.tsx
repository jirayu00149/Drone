import { AnimatedHero } from "@/components/ui/animated-hero"

export function AnimatedHeroDemo() {
  return (
    <AnimatedHero
      title="Coordinate rescue work with"
      words={["drone teams", "case reports", "field logs", "human review"]}
      primaryAction={{ label: "Open Drone Ops", href: "/drone/" }}
      secondaryAction={{ label: "Report missing person", href: "/report.html" }}
    />
  )
}
