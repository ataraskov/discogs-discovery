"use client";

import { useActionState } from "react";
import { saveToken, type TokenActionState } from "@/lib/actions";

const initialState: TokenActionState = { status: "idle" };

export default function TokenForm({ hasToken }: { hasToken: boolean }) {
  const [state, formAction, pending] = useActionState(saveToken, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label htmlFor="token" className="block text-sm font-medium">
          Discogs personal access token
        </label>
        <p className="text-sm text-black/60 dark:text-white/60">
          Generate one at{" "}
          <a
            href="https://www.discogs.com/settings/developers"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            discogs.com/settings/developers
          </a>
          . Used to search the catalog, read marketplace stats, and write to your
          wantlist.
        </p>
      </div>
      <input
        id="token"
        name="token"
        type="password"
        required={!hasToken}
        placeholder={hasToken ? "•".repeat(24) : undefined}
        className="w-full rounded border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-black"
      />
      {hasToken && (
        <p className="text-xs text-black/50 dark:text-white/50">
          A token is already saved. Leave this blank and save to re-test it, or enter a
          new token to replace it.
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {pending ? "Testing…" : "Save"}
        </button>
        {!pending && state.status === "success" && (
          <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-500">
            <span aria-hidden className="font-bold">
              ✓
            </span>
            {state.message}
          </span>
        )}
        {!pending && state.status === "error" && (
          <span className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-500">
            <span aria-hidden className="font-bold">
              ✕
            </span>
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
