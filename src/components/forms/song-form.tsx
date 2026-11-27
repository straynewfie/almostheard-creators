"use client";

import { useActionState, useState } from "react";
import { SlugField } from "@components/forms/slug-field";
import { useUnsavedWarning } from "@components/forms/unsaved";
import { publishSongAction, saveSongAction } from "@domains/catalogue/actions";
import { emptyFormState } from "@domains/catalogue/form-state";
import { RECORDING_KINDS, RECORDING_KIND_LABELS, visibilityLabel, type CatalogueVisibility } from "@domains/music/types";

export function SongForm({
  song,
  artists,
  releaseId,
  trackId,
  blockers,
  canWrite,
  publicationTestMode,
}: {
  song: {
    id: string;
    title: string;
    slug: string;
    description: string | null;
    primary_artist_id: string;
    recording_kind: string | null;
    distrokid_distributed: boolean;
    visibility: CatalogueVisibility;
    duration_ms: number | null;
  } | null;
  artists: { id: string; name: string }[];
  releaseId?: string;
  trackId?: string;
  blockers: string[];
  canWrite: boolean;
  publicationTestMode: boolean;
}) {
  const [state, action, pending] = useActionState(saveSongAction, emptyFormState);
  const [title, setTitle] = useState(song?.title ?? "");
  const [dirty, setDirty] = useState(false);
  useUnsavedWarning(dirty);
  return (
    <div>
      <form action={action} className="form-grid" onChange={() => setDirty(true)}>
        <section className="form-section">
        <h2>Details</h2>
        {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
        {song ? <input type="hidden" name="id" value={song.id} /> : null}
        {releaseId ? <input type="hidden" name="release_id" value={releaseId} /> : null}
        {trackId ? <input type="hidden" name="track_id" value={trackId} /> : null}
        <label>Title<input name="title" required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} disabled={!canWrite} /></label>
        <SlugField source={title} initial={song?.slug ?? ""} locked={Boolean(song)} />
        <label>Primary artist
          <select name="primary_artist_id" defaultValue={song?.primary_artist_id ?? ""} required disabled={!canWrite}>
            <option value="">Choose an artist</option>
            {artists.map((artist) => <option key={artist.id} value={artist.id}>{artist.name}</option>)}
          </select>
        </label>
        <label>Description<textarea name="description" maxLength={4000} defaultValue={song?.description ?? ""} disabled={!canWrite} /></label>
        <p className="muted">Genres are not collected here. Creators will use the shared Almost Heard genre catalogue once the website defines it.</p>
        <label>Recording kind
          <select name="recording_kind" defaultValue={song?.recording_kind ?? ""} disabled={!canWrite}>
            <option value="">Not set</option>
            {RECORDING_KINDS.map((kind) => <option key={kind} value={kind}>{RECORDING_KIND_LABELS[kind]}</option>)}
          </select>
        </label>
        <label className="check"><input name="distrokid_distributed" type="checkbox" defaultChecked={song?.distrokid_distributed ?? false} disabled={!canWrite} /><span>Distributed with DistroKid</span></label>
        {song ? <p>Duration: {song.duration_ms ? `${Math.round(song.duration_ms / 1000)} seconds` : "Waiting for verified audio."}</p> : null}
        <div className="form-actions">
          <button className="primary" type="submit" disabled={!canWrite || pending}>{pending ? "Saving…" : "Save song"}</button>
        </div>
        </section>
      </form>
      <section className="form-section">
        <h2>Publishing</h2>
        <p><span className="badge">{song ? visibilityLabel(song.visibility) : "Draft"}</span></p>
        {publicationTestMode ? <p className="form-error">Test-only publication is enabled. Do not use this setting in production.</p> : null}
        <ul>{blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
        {song && publicationTestMode && canWrite && blockers.length === 0 ? (
          <form action={publishSongAction}>
            <input type="hidden" name="id" value={song.id} />
            <div className="form-actions"><button className="primary" type="submit">Publish song</button></div>
          </form>
        ) : <div className="form-actions"><button type="button" disabled>Publish song</button></div>}
      </section>
    </div>
  );
}
