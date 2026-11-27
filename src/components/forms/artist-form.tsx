"use client";

import { useActionState, useState } from "react";
import { useUnsavedWarning } from "@components/forms/unsaved";
import { SlugField } from "@components/forms/slug-field";
import { saveArtistAction } from "@domains/catalogue/actions";
import { emptyFormState } from "@domains/catalogue/form-state";
import { ARTIST_KINDS } from "@domains/music/types";

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
    standalone_artist: boolean;
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
      <h2>Details</h2>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      {artist ? <input type="hidden" name="id" value={artist.id} /> : null}
      <label>Name<input name="name" required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} disabled={!canWrite} /></label>
      {state.fieldErrors.name ? <p className="field-error">{state.fieldErrors.name}</p> : null}
      <SlugField source={name} initial={artist?.slug ?? ""} locked={Boolean(artist)} />
      <label>Bio<textarea name="bio" maxLength={4000} defaultValue={artist?.bio ?? ""} disabled={!canWrite} /></label>
      <label>Artist type
        <select name="artist_kind" defaultValue={artist?.artist_kind ?? "individual"} disabled={!canWrite}>
          {ARTIST_KINDS.map((kind) => <option key={kind} value={kind}>{kind === "band" ? "Band" : "Individual"}</option>)}
        </select>
      </label>
      <label className="check"><input type="checkbox" name="standalone_artist" defaultChecked={artist?.standalone_artist ?? true} disabled={!canWrite} /><span>Standalone artist. Bands can be standalone. Individuals stay standalone.</span></label>
      <label className="check"><input type="checkbox" name="distrokid_distributed" defaultChecked={artist?.distrokid_distributed ?? false} disabled={!canWrite} /><span>Distributed with DistroKid</span></label>
      <button className="primary" disabled={!canWrite || pending} type="submit">{pending ? "Saving…" : "Save artist"}</button>
    </form>
  );
}
