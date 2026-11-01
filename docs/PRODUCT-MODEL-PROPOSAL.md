# Proposal: richer product model (grades, packaging, images)

Status: **proposal, deferred.** Decision (29 Oct 2026): the API will be added later, in this same folder structure; product code, category, several images, documents and drafts are built and stored in the database then, and stay editable. Until then the web app uses the existing one-row-per-grade products on mock data. It needs the API repo before any code changes. The web app in this repo
runs on mock data, so the real tables and routes live elsewhere.

## Why
The Add Product mockup treats one product (e.g. Cumin Seeds) as having a code, a category, several grades,
several packaging options and several images. Today a `Product` is one flat row: name + optional grade, with
`packing_options: string[]` and one packaging image. Two grades of cumin are two unrelated rows, and the
Products screen only groups them by name.

## Proposed shape

```
product            id, name, sku (unique, required), category, description (<=500), archived, updated_at
product_grade      id, product_id, name, purity_min, moisture_max, foreign_matter_max,
                   cleaning, description, hs_code, hsn_code, gst_rate, unit, archived, sort_order
product_packaging  id, product_id, name, net_weight, unit (kg|g|mt|qtl), material, usage_type
                   (bulk_export|retail), description, archived, sort_order   (first row = default)
product_image      id, product_id, path, sort_order   (first = primary; PNG/JPG, max 5 MB)
price_hint         unchanged in meaning: reference rate per grade, USD and INR (guidance only)
```

Rules that must not change:
- Quote lines keep a **frozen snapshot** of product, grade and packing text (BR-03). Editing or archiving a
  product, grade or packaging never alters an issued quote.
- Products, grades and packaging are **archived, never deleted** (BR-12).
- Reference rates stay guidance; the buyer-specific price lives on the quote.
- Cost and margin never leave the API.

## Migration (new migration file; never edit an applied one)
1. Create `product_grade`, `product_packaging`, `product_image`; add `sku`, `category`, `description` to `product`.
2. Backfill: each existing row becomes one `product` (by name) plus one `product_grade` (its grade/specs/codes/GST/unit);
   `packing_options[]` becomes `product_packaging` rows (first = default); `image_path` becomes the first `product_image`.
3. `sku`: generate from name (e.g. JM-CMN) for existing rows, then make it NOT NULL + UNIQUE.
4. Keep the old columns until the quote form and PDF are switched over, then drop them in a later migration.

## API (replaces the flat `/products`)
- `GET /products` returns products with `grades[]`, `packaging[]`, `images[]` (signed links) and counts.
- `POST /products`, `PATCH /products/:id` accept the product fields plus nested grades/packaging in one call, so the
  modal saves atomically. `POST/DELETE /products/:id/images` for images.
- `GET /products/:id/price-hints` stays; the quote form picks product, then grade, then packaging.

## Web changes once the API exists
- `types.ts`: `Product` gains `sku`, `category`, `description`, `grades`, `packaging`, `images`.
- Add Product modal: sections 1 to 5 of the mockup (basic information, grades table, packaging table, reference
  pricing, images), a Save and a Save-as-draft only if drafts are wanted (needs an `status: draft` value).
- Products screen: cards and detail panel read the nested data directly (no grouping by name).
- Quote form: product picker becomes product, then grade, then packaging; the preview and PDF read the snapshot.
- Mock data and `docs/UI-SCREENS.md` updated to match.

## Decisions needed
1. Where is the API repo (the quote and product service)? This repo's `api/` folder is a different project.
2. Is `sku` required and unique, and is `category` a fixed list? Suggested: Whole Seeds, Ground Spices, Husks and
   Powders, Other.
3. Documents (COA, specs): in scope now, or later? Suggested: later, as a separate file store.
4. Does "Save as Draft" mean a hidden, not-yet-quotable product? Suggested: yes, via a `draft` status.
5. Should the quote form switch to product, grade, packaging in the same release? Suggested: yes, otherwise grades
   added here cannot be quoted.
