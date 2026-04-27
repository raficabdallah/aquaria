// src/strings/en.js
//
// English strings for user-facing text.
// Per master prompt §3: no hardcoded strings in business logic — everything goes here.
// Future: ar.js and fr.js will mirror this shape; selectable via the `language` setting.
//
// Convention: nested objects grouped by feature area (login, shell, errors, etc.).
// Keep keys descriptive. Variable substitution uses {curly} placeholders that
// the consumer replaces with String.replace() — kept simple, no template engine.

export const strings = {

  app: {
    name: "Aquaria",
    tagline: "Playground management"
  },

  login: {
    title: "Sign in",
    emailLabel: "Email",
    emailPlaceholder: "you@example.com",
    passwordLabel: "Password",
    passwordPlaceholder: "Your password",
    submitButton: "Sign in",
    submittingButton: "Signing in…"
  },

  shell: {
    loggedInAs: "Signed in as {email}",
    role: "Role: {role}",
    logoutButton: "Sign out",
    loadingProfile: "Loading your account…"
  },

  dashboard: {
    placeholderTitle: "Dashboard",
    placeholderBody: "The dashboard will be built in a later phase. For now, this screen confirms that authentication and role lookup are working."
  },

  errors: {
    // Login-specific
    invalidCredentials: "Invalid email or password.",
    networkProblem: "Cannot reach the server. Check your internet connection.",
    tooManyAttempts: "Too many failed attempts. Please wait a few minutes and try again.",
    accountDisabled: "This account has been deactivated. Contact your administrator.",
    emailRequired: "Please enter your email.",
    passwordRequired: "Please enter your password.",

    // Profile / role lookup
    profileNotFound: "Your account exists but has no profile in this playground. Contact your administrator.",
    profileInactive: "Your account is deactivated. Contact your administrator.",

    // Generic fallback
    unexpected: "Something went wrong. Please try again."
  },

  toast: {
    signedOut: "You have been signed out."
  }

};