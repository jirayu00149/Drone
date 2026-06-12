# React/shadcn setup notes

This repository is currently a static HTML/CSS/JavaScript prototype. It does
not yet compile React, Tailwind CSS, or TypeScript files.

The requested shadcn-style component has been placed at:

- `components/ui/tubelight-navbar.tsx`
- `components/ui/tubelight-navbar-demo.tsx`
- `lib/utils.ts`

`/components/ui` is the default shadcn location for reusable UI primitives. It
matters because imports such as `@/components/ui/tubelight-navbar` assume this
path, and future shadcn CLI additions will also place components there.

To turn this static prototype into a real React/shadcn app, create a Next.js
TypeScript + Tailwind project and then move the existing pages into React
routes:

```bash
npx create-next-app@latest drone2-react --ts --tailwind --eslint --app --src-dir false
cd drone2-react
npx shadcn@latest init
npm install lucide-react framer-motion clsx tailwind-merge
```

Recommended shadcn aliases:

```json
{
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib"
  }
}
```

If the component is used in a non-Next React app, replace `next/link` with the
router link for that framework or a normal `<a>` element.

Current production path:

- The live static site uses `tubelight-nav.js` and CSS in `styles.css`.
- The React TSX component is ready for the later React/shadcn migration.
