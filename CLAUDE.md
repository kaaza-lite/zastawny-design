# Portfolio site: implementation brief for Claude Code

Oct 5, 2026 · @Tomasz

## Before you start

Do these steps first, then hand the brief to Claude Code.

- [x] Install Figma's plugin in Claude Code: `claude plugin install figma@claude-plugins-official`. Restart Claude Code and allow access to your Figma account.
- [x] Copy every page from the Figma Sites file into a new Figma Design file, keeping all breakpoints. The Figma MCP reads Design files, not Sites files.
- [x] Paste each page's desktop, tablet and mobile frame links into the table below.
- [x] Put the CS Ariston Halfpixel web font files (.woff2) in a `fonts/` folder inside the project folder.
- [ ] Export this brief as Markdown and save it as `CLAUDE.md` in the project folder, so Claude Code reads it every session.
- [ ] Open Claude Code in the desktop app (for the live preview) on Opus 5.5 with effort high. Send: "Read CLAUDE.md and start with Step 1." Drop effort to low for quick motion tweaks.

| Page | Desktop | Tablet | Mobile |
| --- | --- | --- | --- |
| Home | <https://www.figma.com/design/FEx0HxAUj4KBJKZTC4sDG4/Untitled?node-id=4-3577&t=H5wtqcOkxxFuptsh-1> | <https://www.figma.com/design/FEx0HxAUj4KBJKZTC4sDG4/Untitled?node-id=4-3736&t=H5wtqcOkxxFuptsh-1> | <https://www.figma.com/design/FEx0HxAUj4KBJKZTC4sDG4/Untitled?node-id=4-3895&t=H5wtqcOkxxFuptsh-1> |
| Works (if it's its own page) | <https://www.figma.com/design/FEx0HxAUj4KBJKZTC4sDG4/Untitled?node-id=4-3577&t=H5wtqcOkxxFuptsh-1> | <https://www.figma.com/design/FEx0HxAUj4KBJKZTC4sDG4/Untitled?node-id=4-3736&t=H5wtqcOkxxFuptsh-1> | <https://www.figma.com/design/FEx0HxAUj4KBJKZTC4sDG4/Untitled?node-id=4-3895&t=H5wtqcOkxxFuptsh-1> |
| About | <https://www.figma.com/design/FEx0HxAUj4KBJKZTC4sDG4/Untitled?node-id=4-323&t=H5wtqcOkxxFuptsh-1> | <https://www.figma.com/design/FEx0HxAUj4KBJKZTC4sDG4/Untitled?node-id=4-571&t=H5wtqcOkxxFuptsh-1> | <https://www.figma.com/design/FEx0HxAUj4KBJKZTC4sDG4/Untitled?node-id=4-819&t=H5wtqcOkxxFuptsh-1> |
| Calastone | <https://www.figma.com/design/FEx0HxAUj4KBJKZTC4sDG4/Untitled?node-id=4-1069&t=H5wtqcOkxxFuptsh-1> | <https://www.figma.com/design/FEx0HxAUj4KBJKZTC4sDG4/Untitled?node-id=4-1375&t=H5wtqcOkxxFuptsh-1> | <https://www.figma.com/design/FEx0HxAUj4KBJKZTC4sDG4/Untitled?node-id=4-1681&t=H5wtqcOkxxFuptsh-1> |
| Bamboo | <https://www.figma.com/design/FEx0HxAUj4KBJKZTC4sDG4/Untitled?node-id=4-1986&t=H5wtqcOkxxFuptsh-1> | <https://www.figma.com/design/FEx0HxAUj4KBJKZTC4sDG4/Untitled?node-id=4-2180&t=H5wtqcOkxxFuptsh-1> | <https://www.figma.com/design/FEx0HxAUj4KBJKZTC4sDG4/Untitled?node-id=4-2374&t=H5wtqcOkxxFuptsh-1> |
| Juicyway | <https://www.figma.com/design/FEx0HxAUj4KBJKZTC4sDG4/Untitled?node-id=4-2570&t=H5wtqcOkxxFuptsh-1> | <https://www.figma.com/design/FEx0HxAUj4KBJKZTC4sDG4/Untitled?node-id=4-2905&t=H5wtqcOkxxFuptsh-1> | <https://www.figma.com/design/FEx0HxAUj4KBJKZTC4sDG4/Untitled?node-id=4-3240&t=H5wtqcOkxxFuptsh-1> |
| Other pages (add rows) |  |  |  |

Live reference: [emoji-fresco-65178203.figma.site](https://emoji-fresco-65178203.figma.site/), the published Figma Sites version. Use it for link targets and interactions the frames don't show.

Domain: (fill in)

## Goal

Rebuild Tomasz Zastawny's portfolio, currently in Figma Sites, as a fast static site that matches the Figma design. Add a few restrained motion highlights. It's a recruiter-facing portfolio for a Senior Product Designer job search, and it must be live today.

Work in two layers. First, a faithful, responsive build of every page, deployed on the domain. Then the motion highlights and the before/after slider, shipped as follow-up deploys.

A working live site beats a perfect unfinished one.

## Hard rules

These override everything else in this brief.

1. Figma is the source of truth for structure, layout, copy, images and breakpoints. Build every page in the Figma file. If this brief conflicts with Figma, follow Figma and tell me.
2. Do not add new content: no new pages, sections, copy, buttons, contact areas, forms, CV links or placeholder text. Do not reword existing copy.
3. The only new visual elements are the ones this brief asks for: the floating pill navigation, three motion highlights and the before/after slider. Show each one to me before it ships.
4. Never use em dashes in any text: copy, metadata, alt text or labels.
5. Work page by page. After each page, show it next to the Figma frames at every breakpoint, list every difference, and wait for my approval.
6. When Figma is unclear (a missing state, an odd value), ask. Don't guess.
7. Keep motion restrained: only the highlights in the Motion section. No scroll reveals, smooth scrolling, parallax, custom cursor or logo marquees.
8. Keep the code easy for a designer to edit: readable HTML and CSS, clear file names, short comments where the intent isn't obvious.

## Stack

Astro, because it best fits the three goals: easy content updates, hand-editable HTML and CSS, and room to add animation later.

- **Why Astro:** pages and components are close to plain HTML with scoped CSS, so future edits stay readable. It ships almost no JavaScript, so pages load fast. Page transitions are built in, and any animation library can be added where needed.
- **Output:** a static site, no server.
- **Styling:** plain CSS. Design tokens (colors, type scale, spacing, radii, shadows) as CSS custom properties taken from Figma variables and styles. Styles scoped per component. No Tailwind.
- **Content:** each case study is an MDX file in a content folder, so text can be added later without touching layout code. The before/after slider must work inside MDX.
- **Images:** Astro's built-in image optimization: modern formats, responsive sizes, lazy loading below the fold, and explicit dimensions so nothing shifts while loading.
- **Fonts:** self-hosted, with no third-party font requests. Google Sans Flex (free, from Google Fonts) and CS Ariston Halfpixel (licensed; files in `fonts/`). Use `font-display: swap` and preload the fonts used above the fold. Subset Google Sans Flex if it's large; don't modify the licensed font files.
- **Animation:** CSS transitions and Astro's built-in view transitions first. Add a small library (GSAP or Motion) only if the hero needs it, and say why.
- **Hosting:** a GitHub repository connected to Vercel, so every push deploys. Use Vercel preview URLs for reviews.

## Working with Figma

Use the Figma MCP from Figma's plugin, with its design-to-code skill, on the frame links in the setup table.

- For each page, get the design context, variables and a screenshot of every breakpoint before writing code.
- Treat the MCP's React and Tailwind output as a reference only. Rebuild it as Astro components with plain CSS.
- Take exact values from Figma variables and styles (colors, font sizes, line heights, letter spacing, spacing). Don't estimate from screenshots.
- Download images through the MCP at 2x and let Astro optimize them. Use SVG for icons and logos.
- Map auto layout to flexbox or grid, and Figma's breakpoints to media queries at the same widths.
- Links between pages don't survive the copy from Sites into Design. Take link targets, and any hover states the frames don't show, from the live Figma Sites URL.
- Body copy in Figma has manual line breaks mid-sentence (for example "end clients" / "including"). Join those lines with a space and let the text wrap naturally. Keep a break only where it's clearly intentional.

## Build order for today

A faithful site goes live first, the highlights follow. Every step ends with a review; don't start the next step until I approve.

1. **Setup.** Astro project, Git repository, tokens, fonts and base layout. Deploy the empty shell to Vercel so a live preview URL exists from the start. Then list every page found in Figma and confirm the build order with me.
2. **Home and navigation.** Build Home at every breakpoint. Show 2 or 3 floating pill navigation variants on it for me to pick from (see Navigation).
3. **Remaining pages, one review each.** Usually Work, About, then each case study. Add the case study card hovers on the first page that shows cards.
4. **Launch.** Metadata and alt text drafts for my approval, the checks in Quality bar, then connect the domain. The site is live.
5. **Page transitions and hero moment.** Add them to the live site through a preview deploy first.
6. **Before/after slider.** Build and test the component on a dev-only page. Its place in the Calastone case study comes later, with the new images.

At each review, show: screenshots next to the Figma frames at every breakpoint, a list of differences, and the preview URL.

## Navigation: floating pill bar

Replace the current navigation with a floating pill bar. It's the one deliberate design change, so propose 2 or 3 variants and let me pick.

- **Content:** the same items and labels as the current navigation in Figma. Nothing added.
- **Form:** a compact pill floating near the top edge, over the content. Translucent background with backdrop blur, a hairline border and a soft shadow. It must stay legible over every section.
- **Active page:** a highlight behind the current item that slides to the new item when the page changes. This is the nav's only motion.
- **Behavior:** stays visible while scrolling and persists across page transitions without flashing or replaying.
- **Mobile:** fits at 360 px wide. If the items don't fit, propose a compact variant instead of defaulting to a hamburger menu.
- **Accessibility:** real links inside a `nav` element, `aria-current` on the active link, visible focus states, touch targets of at least 44 px.
- **Variants:** can differ in alignment, spacing, density and the active-state style. Use only what's in the current nav and the site's tokens.

## Motion

Restrained: a calm site with three highlights, the hero moment, page transitions and case study card hovers. Everything else is static.

### Principles

- Every animation has a purpose: feedback, continuity between pages, or the one moment of personality in the hero.
- Animate only `transform`, `opacity` and `clip-path`. Never `transition: all`.
- Ease-out for things entering, ease-in-out for things moving on screen, never ease-in.
- Nothing appears from `scale(0)`; start at about 0.95 with opacity 0.
- Motion never blocks reading, scrolling or clicking.
- Hover effects only under `@media (hover: hover) and (pointer: fine)`. Keyboard focus gets the same treatment as hover.
- With `prefers-reduced-motion: reduce`, remove movement and keep only short fades.

### Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | Entering, hovers |
| `--ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` | Movement, page transitions |
| `--dur-fast` | 160 ms | Small feedback |
| `--dur-base` | 240 ms | Hovers, nav highlight |
| `--dur-page` | 350 ms | Page transitions |
| `--dur-hero` | 1200 ms max, total | Hero moment only |

### Hero moment (Home)

- One entrance on the first load of a visit, using the existing hero content only. It doesn't replay when returning to Home in the same visit.
- Propose 2 options that suit the type, for example a line-by-line mask reveal of the headline, or an effect that plays off the half-pixel style of CS Ariston Halfpixel. I pick one.
- The headline is readable within about 600 ms, and the end state matches Figma exactly.

### Case study card hovers (Home and Work)

- The image scales slightly inside its frame (about 1.03) and the title or arrow shifts a few pixels, using `--dur-base` and `--ease-out`.
- No new labels or text. Same effect on keyboard focus, none on touch.

### Page transitions

- Astro's built-in view transitions on every page: outgoing content fades out, incoming content fades in with a slight upward move, over `--dur-page`.
- Highlight: opening a case study, the card image morphs into that case study's hero image, and back again on return.
- The navigation persists across transitions. New pages start at the top; the Back button restores the scroll position.
- Browsers without view transition support simply navigate normally.

## Before/after slider

A reusable component that stacks two versions of the same screen, with a handle you drag to reveal one or the other. First use: the Calastone case study.

- **Images:** two images of identical size, `before` and `now`, each with its own alt text. The component keeps their aspect ratio at every width.
- **Reveal:** left of the handle shows Before, right shows Now. The `before` image sits on top, clipped with `clip-path: inset()` at the handle position, so nothing reflows while dragging.
- **Handle:** a vertical divider with a grab handle, starting at 50%. Clicking anywhere on the image moves the handle there.
- **Input:** mouse, touch and pen through pointer events, with pointer capture so a drag continues outside the component. On touch, horizontal drags move the handle and vertical swipes still scroll the page.
- **Keyboard:** the handle is focusable. Arrow keys move it 5%, Shift plus arrow 10%, Home and End jump to the edges.
- **Accessibility:** `role="slider"` with `aria-valuenow`, a readable `aria-valuetext` and a visible focus ring.
- **Labels:** "Before" and "Now" in small type in the top corners, styled with the site's tokens and overridable per use.
- **Props:** `before`, `now`, both alt texts, `start` (default 50) and `labels`.
- **Motion:** none beyond following the pointer. No intro animation.
- **Testing:** build it on a dev-only page excluded from production, using any two existing images. I'll decide placement once the new Calastone images are ready.

## SEO, metadata and accessibility

Invisible text still counts as content, so draft all of it and show me before adding.

- **Titles and descriptions:** one per page, built from existing copy. The job title is "Senior Product Designer"; "UX/UI" may appear only in the About page copy and in meta tags.
- **Share image:** one Open Graph image built from the existing hero (name and title) in the site's type. Show it to me first.
- **Technical:** sitemap.xml, robots.txt, canonical URLs on the final domain, `lang="en"`, and a favicon from existing assets (ask if there isn't one).
- **Alt text:** a draft for every meaningful image, listed for my approval. Decorative images get empty alt text.
- **Accessibility:** headings in order, landmarks, keyboard access to everything interactive, visible focus, WCAG AA contrast. Flag any contrast failure in the Figma design instead of changing colors silently.

## Quality bar and launch

A page is done when every check below passes.

- [ ] Matches the Figma frames at every breakpoint, with no overflow or awkward wrapping at the widths in between.
- [ ] Lighthouse on mobile scores 95 or more for Performance, Accessibility, Best Practices and SEO. Report anything under 90 with its cause.
- [ ] No console errors, no broken links, and no layout shift as fonts and images load.
- [ ] Works with the keyboard alone and with reduced motion turned on.
- [ ] Checked in Chromium and WebKit (Safari's engine). I'll check on my iPhone.

### Launch

1. Production deploy on Vercel with HTTPS.
2. Connect the domain from the setup table and redirect the www version to the bare domain. No domain yet: launch on the Vercel URL.
3. The Framer site stays live until I approve the new one. Then move the domain from Framer to the new site.
4. After launch, every change goes to a preview deploy first, then to production once I approve.

## Out of scope, and later

Not in this build; ask me before adding any of these: a contact section or form, CV download, analytics, cookie banner, blog, CMS, new pages or copy, scroll reveals, smooth scrolling, parallax, custom cursor, client logo strip, and dark mode unless it's in Figma.

Later:

- New Calastone content and images, then the slider's placement in that case study.
- Small copy additions: edit the case study MDX files directly, or ask Claude Code to.
- Replace the FinX card thumbnail, which reuses the Juicyway image for now. This is known, not a bug.
