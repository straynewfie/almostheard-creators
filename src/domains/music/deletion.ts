/**
 * Soft deletion removes an entity from the working catalogue.
 * Songs referenced by a release stay. Release deletion removes associations only.
 */

export function artistDeleteBlockers(input: {
  activeReleaseCount: number;
  activeSongCount: number;
}): string | null {
  if (input.activeReleaseCount > 0 || input.activeSongCount > 0) {
    return "Remove or move this artist's releases and songs before deleting the artist.";
  }
  return null;
}

export function songDeleteBlockers(input: {
  releaseAppearanceCount: number;
}): string | null {
  if (input.releaseAppearanceCount > 0) {
    return "Remove this song from its releases before deleting it. The releases stay.";
  }
  return null;
}

export function releaseDeletePlan(): {
  deletesSongs: false;
  removesAssociations: true;
} {
  return { deletesSongs: false, removesAssociations: true };
}
