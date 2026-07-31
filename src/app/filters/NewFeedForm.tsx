"use client";

import { useActionState } from "react";
import { createFilter } from "@/lib/actions";
import { DISCOGS_FORMATS, DISCOGS_GENRES } from "@/lib/discogsOptions";

const FIELDS: { name: string; label: string; placeholder?: string; options?: string[] }[] = [
  { name: "q", label: "Free text (q)", placeholder: "e.g. moog" },
  { name: "artist", label: "Artist" },
  { name: "anv", label: "Artist name variation" },
  { name: "title", label: "Title (artist - title)" },
  { name: "releaseTitle", label: "Release title" },
  { name: "credit", label: "Credit" },
  { name: "label", label: "Label" },
  { name: "genre", label: "Genre", placeholder: "e.g. Funk / Soul", options: DISCOGS_GENRES },
  { name: "style", label: "Style", placeholder: "e.g. Disco" },
  { name: "country", label: "Pressing country", placeholder: "e.g. UK" },
  { name: "format", label: "Format", placeholder: "e.g. Vinyl", options: DISCOGS_FORMATS },
  { name: "catno", label: "Catalog number" },
  { name: "barcode", label: "Barcode" },
  { name: "track", label: "Track" },
  { name: "submitter", label: "Submitter username" },
  { name: "contributor", label: "Contributor username" },
];

export function NewFeedForm() {
  const [state, formAction, pending] = useActionState(createFilter, null);

  return (
    <form action={formAction} className="space-y-4">
      <h2 className="font-medium">New feed</h2>

      {state?.error && (
        <p className="rounded border border-red-600/30 bg-red-600/10 px-3 py-2 text-sm text-red-600">
          {state.error}
        </p>
      )}

      <div>
        <label className="block text-sm font-medium" htmlFor="name">
          Feed name
        </label>
        <input
          id="name"
          name="name"
          required
          placeholder="e.g. 70s funk cheap"
          className="w-full rounded border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-black"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <div key={field.name}>
            <label className="block text-sm font-medium" htmlFor={field.name}>
              {field.label}
            </label>
            <input
              id={field.name}
              name={field.name}
              placeholder={field.placeholder}
              list={field.options ? `${field.name}-options` : undefined}
              autoComplete="off"
              className="w-full rounded border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-black"
            />
            {field.options && (
              <datalist id={`${field.name}-options`}>
                {field.options.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            )}
          </div>
        ))}

        <div>
          <label className="block text-sm font-medium" htmlFor="yearFrom">
            Year from
          </label>
          <input
            id="yearFrom"
            name="yearFrom"
            type="number"
            className="w-full rounded border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-black"
          />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="yearTo">
            Year to
          </label>
          <input
            id="yearTo"
            name="yearTo"
            type="number"
            className="w-full rounded border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-black"
          />
        </div>

        <div>
          <label className="block text-sm font-medium" htmlFor="sort">
            Sort by
          </label>
          <select
            id="sort"
            name="sort"
            defaultValue=""
            className="w-full rounded border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-black"
          >
            <option value="">Relevance (default)</option>
            <option value="year">Year</option>
            <option value="title">Title</option>
            <option value="artist">Artist</option>
            <option value="format">Format</option>
            <option value="catno">Catalog number</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="sortOrder">
            Sort order
          </label>
          <select
            id="sortOrder"
            name="sortOrder"
            defaultValue=""
            className="w-full rounded border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-black"
          >
            <option value="">Default</option>
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>
      </div>

      <div className="border-t border-black/10 pt-4 dark:border-white/10">
        <h3 className="mb-2 text-sm font-medium">
          Marketplace thresholds (aggregate, from the release page)
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium" htmlFor="maxLowestPrice">
              Max lowest price
            </label>
            <input
              id="maxLowestPrice"
              name="maxLowestPrice"
              type="number"
              step="0.01"
              placeholder="e.g. 10"
              className="w-full rounded border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-black"
            />
            <p className="mt-1 text-xs text-black/50 dark:text-white/50">
              Currency is whatever Discogs reports for the listing (not converted).
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium" htmlFor="minForSale">
              Min number for sale
            </label>
            <input
              id="minForSale"
              name="minForSale"
              type="number"
              placeholder="e.g. 5"
              className="w-full rounded border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-black"
            />
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {pending ? "Creating…" : "Create feed"}
      </button>
    </form>
  );
}
