# Quality First Turf — App Design Notes

> This file started life as a spec for the marketing website (https://qualityfirstturf.com/). The app in this repo is the customer intake form and the sales on-site tool, so the notes below describe **this app**. The brand sections that follow are still a valid reference for look and feel; the token table is the original proposal.

## App surfaces

| Surface | Route | CSS prefixes |
|---|---|---|
| Customer intake (details, services, review, confirmation) | `/` | `intake-*`, `services-*`, `review-*`, `confirmation-*` |
| Sales sign-in and project list | `/visit` | `sales-login*`, `sales-list__*`, `sales-skeleton__*` |
| On-site visit | `/visit/[projectId]` | `visit-*` |

All styles live in `app/globals.css` (not `global.css`). Fonts: IBM Plex Sans (body) and DM Sans (headings) via `next/font` in `app/layout.tsx`.

## Conventions

- Every text input has a visible label **and** a placeholder showing a realistic example (`Jane`, `(555) 123-4567`, `e.g. 500`).
- Primary actions are pill buttons ≥ 48px tall; Back is a quieter secondary style.
- Headings: one `h1` per page; keep card headings clearly smaller than the page `h1`.
- List cards show only name, status, short address and date; details belong on the project page.
- Slow screens show skeletons (`components/sales-skeleton.tsx`, `loading.tsx`), not blank pages.
- Breakpoints in use: 1100, 860, 720 and 560 px. Prefer these over new values.
- Known debt: several overlapping token sets (`--forest-green…`, `--color-brand-*`, `--visit-*`) and dead CSS from earlier designs; consolidate when touching a surface.

## 1. Brand and experience

Quality First Turf presents itself as a specialist in artificial turf, landscape design, pavers, hardscape, outdoor lighting, and outdoor-living transformations. The site should communicate:

- **Trust:** established expertise, customer testimonials, clear contact information.
- **Natural quality:** rich green accents, earthy neutrals, and authentic project photography.
- **Low maintenance:** make the benefits of synthetic turf easy to understand.
- **Transformation:** emphasize before-and-after imagery and finished outdoor spaces.
- **Lead generation:** keep the “Get Estimate” / custom-design action prominent and repeat it at useful decision points.

The overall direction should feel professional, approachable, outdoors-oriented, and service-led rather than like a generic SaaS or ecommerce template.

## 2. Global visual system

### Color tokens

The starter palette is defined as CSS custom properties in `global.css`.

| Token | Value | Intended use |
|---|---|---|
| `--color-brand-900` | `#173D2A` | Deep green, footer, high-emphasis text |
| `--color-brand-800` | `#205236` | Strong brand surfaces |
| `--color-brand-700` | `#2E6A43` | Primary buttons and links |
| `--color-brand-600` | `#3D8050` | Hover states and secondary emphasis |
| `--color-brand-100` | `#E8F0E8` | Soft green surfaces |
| `--color-brand-50` | `#F4F8F3` | Subtle feature backgrounds |
| `--color-sand-100` | `#F5F1E9` | Warm alternating section background |
| `--color-earth-800` | `#554838` | Earth-tone secondary accent |
| `--color-text` | `#202821` | Main body text |
| `--color-text-muted` | `#626B63` | Secondary copy |
| `--color-border` | `#E1E6DF` | Dividers, card outlines |
| `--color-surface` | `#FFFFFF` | Main content surface |

Use white and near-white as the primary canvas. Reserve deep green for important actions, footer surfaces, and image overlays. Warm sand should be used sparingly to separate sections without making the page feel busy.

### Typography

- Use a clean sans-serif family. `IBM Plex Sans` is the body face; `DM Sans` is the heading stack.
- Headings should be bold, compact, and slightly tight in letter spacing.
- Use fluid `clamp()` sizing for hero and section headings.
- Body copy should remain comfortable to read at roughly 16px with a line height around 1.65.
- Use uppercase eyebrow labels sparingly for small section-introduction text.
- Keep long text blocks to a readable line length (about 60–70 characters where possible).

If web fonts are not loaded, the CSS includes system-font fallbacks.

### Layout and spacing

- Main content maximum width: approximately 1200px.
- Narrow reading content: approximately 800px.
- Use generous vertical section spacing and consistent horizontal gutters.
- Alternate white and subtle neutral backgrounds to clarify the page rhythm.
- Use a consistent spacing scale rather than one-off margins.
- Prefer CSS Grid for card collections and Flexbox for action rows and header alignment.

### Corners, borders, and elevation

- Buttons: pill-shaped, with a minimum target height around 48px.
- Cards: rounded corners around 12–18px, subtle borders, restrained shadows.
- Gallery images: medium rounded corners; let the photography carry the visual weight.
- Avoid excessive shadows, gradients, and decorative effects.

## 3. Homepage information architecture

The reference homepage contains the following content groups. Preserve the intent and sequence when building a close recreation.

### A. Header and primary action

**Content:** Brand mark/logo, navigation, and a visible **Get Estimate** action.

**Design guidance:**
- Keep the header visually light, with a white background and subtle bottom border.
- Align the logo left and navigation/action controls to the right on desktop.
- Keep the estimate CTA visually stronger than standard navigation links.
- On mobile, allow navigation to wrap or become a compact menu; do not let the CTA disappear.

**Primary conversion:** Request an estimate or custom yard design.

### B. Hero — “Transform Your Outdoor Space”

**Content:** A headline focused on artificial turf and outdoor solutions, supporting copy, and a primary estimate CTA.

**Design guidance:**
- Use a large, high-quality completed-project image as the background or main visual.
- Apply a deep-green overlay or gradient when text sits on the image.
- Keep the headline short and visually dominant.
- Supporting copy should explain artificial turf, landscape planning, and outdoor-living services without becoming a wall of text.
- Include one prominent primary CTA and optionally a quieter secondary link.

**Image direction:** Real residential lawns, turf installations, putting greens, pavers, and inviting backyard spaces. Favor authentic project photography over generic stock imagery.

### C. “Why Choose Us?” value propositions

**Content:** Professional expertise, premium turf and hardscape, custom designs, low maintenance, and additional outdoor features.

**Design guidance:**
- Present as a concise grid of benefit cards or icon-led feature blocks.
- Each item should have a clear heading and a short explanatory sentence.
- Use simple line icons with consistent size and stroke weight.
- Avoid repeating the same benefit in multiple cards.

### D. Artificial turf installation / social proof

**Content:** Service-area or installation heading and customer testimonials, including customer names and review copy.

**Design guidance:**
- Use a clear section title and 3-column testimonial grid on wide screens.
- Cards should prioritize readable review text, customer attribution, and optional star-rating display when verified.
- Keep testimonial copy intact when supplied; do not fabricate review text or ratings.
- On mobile, stack cards or use a well-controlled carousel with keyboard support.

### E. Outdoor sanctuary / pavers CTA

**Content:** Invitation to create an outdoor living space, payment-option messaging, and a no-obligation custom design CTA; supporting paver-related content.

**Design guidance:**
- Treat this as a conversion section, distinct from the general benefits grid.
- Use a wide split layout: copy on one side, finished-project photography on the other.
- The CTA should be direct and action-oriented.
- Mention payment options only if the current business offering confirms them.

### F. Synthetic turf education

**Content:** A short explanation of modern synthetic turf and its appearance / maintenance benefits.

**Design guidance:**
- Use a photo-led editorial block with a clear heading, concise copy, and a relevant service or product link.
- Explain benefits in customer language; avoid unsupported environmental claims.
- Keep this section visually lighter than the hero.

### G. Hardscape / outdoor-living solutions

**Content:** A section describing hardscape design and durable outdoor surfaces, with a link to explore solutions.

**Design guidance:**
- Use a split content-and-image composition or a wide feature card.
- Keep the text focused on the customer's use case and the practical benefit.
- Ensure the link destination is a real page on the site.

### H. “Some Of Our Designs” gallery

**Content:** Project photography, including before-and-after examples and additional installation images.

**Design guidance:**
- Photography is the primary element; use a consistent grid and predictable image ratios.
- Pair before/after images so the comparison is immediately clear.
- Use explicit “Before” and “After” labels rather than relying on image order alone.
- Use `object-fit: cover` for uniform tiles, while preserving the ability to open a larger image.
- Add descriptive alt text for meaningful project images.

### I. “Our Difference” trust section

**Content:** Quality assurance, experience, tailored solutions, and customer service.

**Design guidance:**
- Use four compact feature cards or a four-column icon grid on desktop.
- Keep headings short and descriptions to one or two sentences.
- Use a soft green background to separate this section from the gallery.

### J. Transformation / final conversion content

**Content:** Transformation-oriented heading and closing brand message.

**Design guidance:**
- Use a strong project image or a video only when a real, accessible media asset exists.
- End the main content with a clear estimate CTA.
- Avoid autoplaying sound; provide accessible controls for video.

### K. Footer and contact information

The reference lists a phone number, service hours, an email address, and quick links. Verify these details against the current business source before launch.

**Design guidance:**
- Use a deep-green footer with strong contrast.
- Suggested desktop columns: company summary/contact, service hours, and quick links.
- Make phone and email clickable (`tel:` and `mailto:`).
- Include the current copyright year dynamically if the stack supports it.
- Keep privacy and other legal links discoverable.

## 4. Reusable components

The starter stylesheet includes reusable class patterns:

- `.container` / `.container--narrow` — consistent page width.
- `.section`, `.section--compact`, `.section--soft`, `.section--sand` — section spacing and surface variants.
- `.eyebrow`, `.section-heading` — section introductions.
- `.button`, `.button--light`, `.button--outline`, `.button-row` — CTA styles.
- `.site-header`, `.site-header__inner`, `.site-nav`, `.site-logo` — header structure.
- `.hero`, `.hero__media`, `.hero__content` — image-led hero.
- `.card-grid`, `.card`, `.card__media`, `.card__body` — service and content cards.
- `.feature-grid`, `.feature`, `.feature__icon` — benefit / trust cards.
- `.testimonial-grid`, `.testimonial` — social proof.
- `.gallery-grid`, `.gallery-item`, `.gallery-item__label` — project gallery.
- `.cta-panel` — high-emphasis conversion panel.
- `.site-footer`, `.site-footer__grid`, `.site-footer__bottom` — footer layout.
- `.form-field` — estimate/contact form controls.

Use semantic HTML (`header`, `nav`, `main`, `section`, `article`, `footer`) and keep component names consistent with the application's framework.

## 5. Responsive behavior

Breakpoints in `global.css` are starting points, not a claim about the original site's exact breakpoints.

### Desktop — above 960px
- Three-column service, testimonial, and gallery grids where content permits.
- Four-column value-proposition grid.
- Full header navigation.
- Split hero and conversion layouts.

### Tablet — 641px to 960px
- Two-column content/testimonial grids.
- Two-column feature grid.
- Footer reorganizes into two columns.
- Preserve generous spacing but reduce oversized gutters.

### Mobile — 640px and below
- Single-column cards and galleries.
- Stack conversion panels and CTA buttons.
- Allow header navigation to scroll or use a real menu toggle.
- Use shorter hero text measure and maintain readable contrast over photography.
- Avoid small tap targets and horizontal overflow.
- Keep the estimate action easy to reach.

## 6. Interaction and accessibility requirements

- Use real links for navigation and real buttons for actions.
- Every interactive element must work with a keyboard.
- Preserve a visible `:focus-visible` outline.
- Meet WCAG AA contrast for body text and interactive controls.
- Provide meaningful `alt` text for project imagery; use empty alt text for purely decorative images.
- Do not convey before/after status through color alone; include text labels.
- Honor `prefers-reduced-motion`.
- Give form fields persistent labels, helpful validation messages, and clear submission feedback.
- Make phone and email contact details actionable on mobile.
- Do not rely on hover alone to expose essential content.

## 7. Imagery direction

Use the business's own project imagery wherever available. Prioritize:

1. Finished turf lawns in real residential settings.
2. Before-and-after transformations.
3. Putting greens, pet-friendly spaces, and play areas.
4. Pavers, paths, seating zones, and complementary hardscape.
5. Detail shots that demonstrate seams, edges, turf texture, and workmanship.

Image handling:
- Use consistent aspect ratios within each grid.
- Use `loading="lazy"` for below-the-fold images.
- Give the hero image high priority because it affects initial visual loading.
- Use responsive image sizes and modern formats where possible.
- Do not invent project claims, client identities, or image captions.

## 8. Conversion and content rules

- Keep **Get Estimate** as the primary CTA label unless the business uses a different current label.
- Place a CTA in the hero, after key service/value sections, and near the bottom of the page.
- Keep the phone number visible and clickable.
- Explain the service, the benefit, and the next step in that order.
- Do not promise guaranteed outcomes or add unverified warranties, certifications, review scores, financing terms, or environmental claims.
- Keep service-area SEO headings natural; avoid repetitive keyword stuffing.

## 9. Implementation checklist

- [ ] Confirm the official logo, font files, brand colors, and approved imagery.
- [ ] Compare the implementation with current desktop and mobile screenshots.
- [ ] Tune token values for exact brand matching.
- [ ] Verify all navigation and CTA destinations.
- [ ] Confirm business phone, email, hours, and service area.
- [ ] Check gallery labels and image alt text.
- [ ] Test responsive layout at 320px, 375px, 768px, 1024px, and wide desktop widths.
- [ ] Test keyboard navigation, focus visibility, contrast, and reduced motion.
- [ ] Optimize image payloads and avoid layout shifts.
- [ ] Verify estimate form validation and submission success/error states.
