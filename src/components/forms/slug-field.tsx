"use client";

import { useState } from "react";
import { normalizeSlug } from "@domains/music/validation";

export function SlugField({
  source,
  initial,
  locked,
}: {
  source: string;
  initial: string;
  locked: boolean;
}) {
  const [override, setOverride] = useState<string | null>(locked && initial ? initial : null);
  const slug = override ?? normalizeSlug(source);
  return (
    <label>
      Slug
      <input
        name="slug"
        value={slug}
        maxLength={120}
        onChange={(event) => setOverride(normalizeSlug(event.target.value))}
      />
      <input type="hidden" name="slug_touched" value={override === null ? "0" : "1"} />
    </label>
  );
}
