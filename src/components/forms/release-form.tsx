"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { SlugField } from "@components/forms/slug-field";
import { useUnsavedWarning } from "@components/forms/unsaved";
import {
  addPlaceholderAction,
  attachExistingSongAction,
  moveTrackAction,
  removeTrackAction,
  saveReleaseAction,
} from "@domains/catalogue/actions";
import { emptyFormState } from "@domains/catalogue/form-state";
import { CREATOR_RELEASE_TYPES, CREATOR_RELEASE_TYPE_LABELS } from "@domains/music/types";

export type ReleaseTrackView = {
  id: string;
  discNumber: number;
  trackNumber: number;
  songId: string | null;
  songTitle: string | null;
  placeholderTitle: string | null;
};

export function ReleaseForm({
  release,
  artists,
  tracks,
  songs,
  blockers,
  canWrite,
}: {
  release: {
    id: string;
    title: string;
    slug: string;
    description: string | null;
    primary_artist_id: string;
    release_type: string;
    release_date: string | null;
    distrokid_distributed: boolean;
  } | null;
  artists: { id: string; name: string }[];
  tracks: ReleaseTrackView[];
  songs: { id: string; title: string }[];
  blockers: string[];
  canWrite: boolean;
}) {
  const [state, action, pending] = useActionState(saveReleaseAction, emptyFormState);
  const [title, setTitle] = useState(release?.title ?? "");
  const [dirty, setDirty] = useState(false);
  useUnsavedWarning(dirty);
  return (
    <div>
      <form action={action} className="form-grid" onChange={() => setDirty(true)}>
        <section className="form-section">
        <h2>Details</h2>
        {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
        {release ? <input type="hidden" name="id" value={release.id} /> : null}
        <label>Title<input name="title" required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} disabled={!canWrite} /></label>
        <SlugField source={title} initial={release?.slug ?? ""} locked={Boolean(release)} />
        <label>Primary artist
          <select name="primary_artist_id" defaultValue={release?.primary_artist_id ?? ""} required disabled={!canWrite}>
            <option value="">Choose an artist</option>
            {artists.map((artist) => <option key={artist.id} value={artist.id}>{artist.name}</option>)}
          </select>
        </label>
        <label>Description<textarea name="description" maxLength={4000} defaultValue={release?.description ?? ""} disabled={!canWrite} /></label>
        <label>Release type
          <select name="release_type" defaultValue={release?.release_type ?? "album"} disabled={!canWrite}>
            {CREATOR_RELEASE_TYPES.map((type) => <option key={type} value={type}>{CREATOR_RELEASE_TYPE_LABELS[type]}</option>)}
          </select>
        </label>
        <label>Release date<input name="release_date" type="date" defaultValue={release?.release_date ?? ""} disabled={!canWrite} /></label>
        <label className="check"><input name="distrokid_distributed" type="checkbox" defaultChecked={release?.distrokid_distributed ?? false} disabled={!canWrite} /><span>Distributed with DistroKid</span></label>
        <div className="form-actions">
          <button className="primary" type="submit" disabled={!canWrite || pending}>{pending ? "Saving…" : "Save release"}</button>
        </div>
        </section>
      </form>
      <section className="form-section">
        <h2>Tracks</h2>
        {!release ? <p>Save the release before adding songs.</p> : null}
        {release ? (
          <ol>
            {tracks.map((track) => (
              <li key={track.id}>
                <strong>{track.discNumber}.{track.trackNumber}</strong>{" "}
                {track.songId ? <Link href={`/dashboard/music/songs/${track.songId}`}>{track.songTitle}</Link> : track.placeholderTitle}
                {canWrite ? (
                  <span className="row-actions">
                    <form action={moveTrackAction}><input type="hidden" name="release_id" value={release.id} /><input type="hidden" name="track_id" value={track.id} /><input type="hidden" name="direction" value="up" /><button className="quiet" type="submit">Up</button></form>
                    <form action={moveTrackAction}><input type="hidden" name="release_id" value={release.id} /><input type="hidden" name="track_id" value={track.id} /><input type="hidden" name="direction" value="down" /><button className="quiet" type="submit">Down</button></form>
                    <form action={removeTrackAction}><input type="hidden" name="release_id" value={release.id} /><input type="hidden" name="track_id" value={track.id} /><button className="quiet" type="submit">Remove</button></form>
                    {!track.songId ? <Link href={`/dashboard/music/songs/new?releaseId=${release.id}&trackId=${track.id}`}>Create song</Link> : null}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}
        {release && canWrite ? (
          <>
            <form action={addPlaceholderAction} className="form-grid">
              <input type="hidden" name="release_id" value={release.id} />
              <label>Placeholder title<input name="placeholder_title" required maxLength={200} /></label>
              <div className="form-actions"><button className="primary" type="submit">Add placeholder</button></div>
            </form>
            <form action={attachExistingSongAction} className="form-grid">
              <input type="hidden" name="release_id" value={release.id} />
              <label>Existing song
                <select name="song_id" required defaultValue="">
                  <option value="">Choose a song</option>
                  {songs.filter((song) => !tracks.some((track) => track.songId === song.id)).map((song) => (
                    <option key={song.id} value={song.id}>{song.title}</option>
                  ))}
                </select>
              </label>
              <div className="form-actions"><button className="primary" type="submit">Add song</button></div>
            </form>
          </>
        ) : null}
      </section>
      <section className="form-section">
        <h2>Publishing</h2>
        <ul>{blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
        <div className="form-actions"><button type="button" disabled>Publish release</button></div>
      </section>
    </div>
  );
}
