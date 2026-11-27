export function registrationAcknowledgement(): string {
  return "If this is a new address, check your email to verify it. A new account stays inactive until an operator activates it. This does not start a subscription.";
}

export function passwordResetAcknowledgement(): string {
  return "If an account exists for that address, a reset message has been sent.";
}

export function signInFailureMessage(): string {
  return "Email or password is incorrect.";
}
