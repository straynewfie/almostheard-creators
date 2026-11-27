"use client";

import { useState } from "react";
import {
  createAudioUploadAction,
  createCoverUploadAction,
  finalizeUploadAction,
} from "@domains/media/uploads";

async function checksum(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
}

export function MediaUpload({
  label,
  accept,
  mode,
  parent,
  parentId,
  songId,
  needsReplacementConfirm,
}: {
  label: string;
  accept: string;
  mode: "cover" | "audio";
  parent?: "artists" | "releases" | "songs";
  parentId?: string;
  songId?: string;
  needsReplacementConfirm?: boolean;
}) {
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function onFile(file: File, confirm: boolean) {
    setError(null);
    setDone(false);
    setPending(true);
    setProgress(0);
    const hash = await checksum(file);
    const form = new FormData();
    form.set("byte_size", String(file.size));
    form.set("checksum", hash);
    form.set("idempotency_key", crypto.randomUUID());
    form.set("confirm_replacement", confirm ? "1" : "0");
    const ticket = mode === "audio"
      ? await createAudioUploadAction(withSong(form, songId))
      : await createCoverUploadAction(withCover(form, parent, parentId, file.type));
    if (ticket.error || !ticket.uploadUrl || !ticket.intentId || !ticket.contentType) {
      setPending(false);
      setError(ticket.error ?? "The upload could not be started.");
      return;
    }
    const uploaded = await putFile(ticket.uploadUrl, file, ticket.contentType, setProgress);
    if (!uploaded) {
      setPending(false);
      setError("The upload did not finish. You can try again.");
      return;
    }
    const fin = new FormData();
    fin.set("intent_id", ticket.intentId);
    fin.set("confirm_replacement", confirm ? "1" : "0");
    const result = await finalizeUploadAction(fin);
    setPending(false);
    if (result.error) setError(result.error);
    else setDone(true);
  }

  return (
    <form
      className="form-grid"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const file = data.get("file");
        if (!(file instanceof File) || file.size < 1) {
          setError("Choose a file.");
          return;
        }
        void onFile(file, data.get("confirm_replacement") === "on");
      }}
    >
      <label>{label}<input name="file" type="file" accept={accept} required /></label>
      {needsReplacementConfirm ? (
        <label className="check">
          <input name="confirm_replacement" type="checkbox" />
          <span>I understand this replacement creates a new recording. Plays, publication date, and promotion eligibility start over. The previous recording stays in history and is not swapped into old playlists.</span>
        </label>
      ) : null}
      {pending ? <div className="progress" aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {done ? <p role="status">Upload verified.</p> : null}
      <button className="primary" type="submit" disabled={pending}>{pending ? "Uploading…" : "Upload"}</button>
    </form>
  );
}

function withSong(form: FormData, songId?: string) {
  form.set("song_id", songId ?? "");
  return form;
}

function withCover(
  form: FormData,
  parent: "artists" | "releases" | "songs" | undefined,
  parentId: string | undefined,
  mime: string,
) {
  form.set("parent", parent ?? "");
  form.set("parent_id", parentId ?? "");
  form.set("mime", mime);
  return form;
}

function putFile(
  url: string,
  file: File,
  contentType: string,
  onProgress: (value: number) => void,
): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.send(file);
  });
}
