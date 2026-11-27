"use client";

import { useActionState, useState } from "react";
import { useUnsavedWarning } from "@components/forms/unsaved";
import { SlugField } from "@components/forms/slug-field";
import { saveArtistAction } from "@domains/catalogue/actions";
import { emptyFormState } from "@domains/catalogue/form-state";

export function ArtistForm({
  artist,
  canWrite,
}: {
  artist: {
    id: string;
    name: string;
    slug: string;
    bio: string | null;
    artist_kind: string;
    distrokid_distributed: boolean;
  } | null;
  canWrite: boolean;
}) {
  const [state, action, pending] = useActionState(saveArtistAction, emptyFormState);
  const [name, setName] = useState(artist?.name ?? "");
  const [dirty, setDirty] = useState(false);
  useUnsavedWarning(dirty);
  return (
    <form action={action} className="form-grid" onChange={() => setDirty(true)}>
      <section className="form-section">
        <h2>Details</h2>
        {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
        {artist ? <input type="hidden" name="id" value={artist.id} /> : null}
        <label>Name<input name="name" required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} disabled={!canWrite} /></label>
        {state.fieldErrors.name ? <p className="field-error">{state.fieldErrors.name}</p> : null}
        <SlugField source={name} initial={artist?.slug ?? ""} locked={Boolean(artist)} />
        <label>Bio<textarea name="bio" maxLength={4000} defaultValue={artist?.bio ?? ""} disabled={!canWrite} /></label>
        <label className="check">
          <input type="checkbox" name="artist_kind" value="band" defaultChecked={artist?.artist_kind === "band"} disabled={!canWrite} />
          <span>Band / group</span>
        </label>
        <p className="muted">Unchecked means an individual. Each artist is its own catalogue entry.</p>
        <label className="check"><input type="checkbox" name="distrokid_distributed" defaultChecked={artist?.distrokid_distributed ?? false} disabled={!canWrite} /><span>Distributed with DistroKid</span></label>
        <div className="form-actions">
          <button className="primary" disabled={!canWrite || pending} type="submit">{pending ? "Saving…" : "Save artist"}</button>
        </div>
      </section>
    </form>
  );
}
