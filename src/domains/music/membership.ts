/**
 * Membership access. Signup creates an inactive creator.
 * Active is the only state that can change a catalogue or preview media.
 * The 60-day cancelled read window is the agreed retention rule from planning 02.
 */

import type { MembershipState } from "@domains/music/types";

export const RETENTION_DAYS = 60;

export type MembershipSnapshot = {
  state: MembershipState;
  retentionUntil: string | null;
};

export function initialMembershipState(): "inactive" {
  return "inactive";
}

export function canMutateCatalogue(state: MembershipState): boolean {
  return state === "active";
}

export function canPreviewMedia(state: MembershipState): boolean {
  return state === "active";
}

export function canReadMetadata(
  membership: MembershipSnapshot,
  now: Date,
): boolean {
  if (membership.state === "active" || membership.state === "inactive") {
    return true;
  }
  if (!membership.retentionUntil) return false;
  return new Date(membership.retentionUntil).getTime() > now.getTime();
}

export function retentionUntilFromCancellation(cancelledAt: Date): string {
  const until = new Date(cancelledAt.getTime());
  until.setUTCDate(until.getUTCDate() + RETENTION_DAYS);
  return until.toISOString();
}

export function membershipNotice(state: MembershipState): string {
  if (state === "active") {
    return "This creator account can edit its private catalogue.";
  }
  if (state === "inactive") {
    return "This account is not active. Catalogue changes and media preview stay unavailable until an operator activates it. Signup does not start a subscription.";
  }
  return "This membership is cancelled. Private media and edits are unavailable. Metadata remains readable only until the end of the retention window.";
}
