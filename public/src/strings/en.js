// public/src/strings/en.js
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

  wizard: {
    headerTitle: "Aquaria Setup",
    stepLabel: "Step {current} of {total}",
    progressLabel: "{percent}% complete",

    backButton: "Back",
    nextButton: "Next",
    skipButton: "Skip this step",
    finishButton: "Finish setup",
    finishingButton: "Saving…",

    // Step 1 — Identity
    step1: {
      title: "Welcome to Aquaria",
      subtitle: "Let's set up your playground. This takes about 3 minutes.",
      playgroundNameLabel: "Playground name",
      playgroundNamePlaceholder: "e.g. Aquaria",
      playgroundNameHelp: "This name appears on the dashboard, the TV display, and on parent messages.",
      countryCodeLabel: "Default country code",
      countryCodeHelp: "Used as the default when staff registers a new family. They can pick a different country per kid."
    },

    // Step 2 — Operating settings
    step2: {
      title: "Operating settings",
      subtitle: "How prices, language, and time will work in your playground. You can change these later from the Admin Panel.",

      currencyLabel: "Currency",
      currencyValue: "USD — US Dollar",
      currencyHelp: "Currency is locked to USD in this version of Aquaria. Multi-currency support is planned for a future release.",

      languageLabel: "Default language",
      languageHelp: "The language used by the staff app. Each staff member can change theirs later. Other languages are coming soon.",
      languageOptionEnglish: "English",
      languageOptionArabic: "Arabic (coming soon)",
      languageOptionFrench: "French (coming soon)",

      timezoneLabel: "Timezone",
      timezoneHelp: "Used to time-stamp sessions, schedule rush hours, and reset weekly counters.",
      timezoneRegionMiddleEast: "Middle East",
      timezoneRegionAfrica: "Africa",
      timezoneRegionEurope: "Europe",
      timezoneRegionAmericas: "Americas",
      timezoneRegionAsiaOceania: "Asia & Oceania"
    },

    // Step 3 — First session type (REQUIRED)
    step3: {
      title: "Your first session type",
      subtitle: "A session type is what a kid pays for — a length of play and a price. Most playgrounds start with one and add more later. You'll need at least one to open.",

      nameLabel: "Name",
      namePlaceholder: "e.g. Standard 2-hour",
      nameHelp: "Short label staff will see on the check-in screen.",

      durationLabel: "Duration",
      durationHelp: "How long the session lasts.",
      durationOption30: "30 minutes",
      durationOption45: "45 minutes",
      durationOption60: "1 hour",
      durationOption90: "1 hour 30 minutes",
      durationOption120: "2 hours",

      priceLabel: "Price",
      pricePlaceholder: "5.00",
      priceHelp: "What a kid pays for one session. Cents are optional.",
      priceSuffix: "USD"
    },

    // Steps 4-7 — placeholder until built
    placeholderStepTitle: "Step {n}: {name}",
    placeholderStepBody: "This step will be built next. For now, click Next to continue."
  },

  setupIncomplete: {
    title: "Setup not finished",
    greeting: "Hello {email} ({role}).",
    body: "The playground setup hasn't been completed yet. Please ask the SuperAdmin to sign in and finish the onboarding."
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

    // Setup status
    setupCheckFailed: "Could not check setup status. Please try again.",
    setupSaveFailed: "Could not save the setup. Please check your connection and try again.",

    // Wizard validation — Step 1
    playgroundNameRequired: "Please enter a name for your playground.",
    playgroundNameTooShort: "Playground name must be at least 2 characters.",
    playgroundNameTooLong: "Playground name is too long.",

    // Wizard validation — Step 3
    sessionTypeNameRequired: "Please enter a name for the session type.",
    sessionTypeNameTooShort: "Session type name must be at least 2 characters.",
    sessionTypeNameTooLong: "Session type name is too long.",
    sessionTypePriceRequired: "Please enter a price.",
    sessionTypePriceInvalid: "Price must be a number, e.g. 5 or 5.00.",
    sessionTypePriceNegative: "Price cannot be negative.",
    sessionTypePriceTooManyDecimals: "Price can have at most two decimal places.",
    sessionTypePriceTooHigh: "Price is unreasonably high.",

    // Generic fallback
    unexpected: "Something went wrong. Please try again."
  },

  toast: {
    signedOut: "You have been signed out.",
    setupComplete: "Setup complete! Welcome to Aquaria."
  }

};