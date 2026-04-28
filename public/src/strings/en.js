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

  // Display labels for staff roles. Used wherever a role name is shown to a user.
  // Stored value in Firestore is the raw role key ("SuperAdmin" / "Admin" / "Operator");
  // this map is for display only.
  roles: {
    SuperAdmin: "Owner / SuperAdmin",
    Admin: "Administrator",
    Operator: "Operator"
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

    // Step 4 — First subscription model (OPTIONAL — Skip allowed)
    step4: {
      title: "Your first subscription (optional)",
      subtitle: "Subscriptions let regular families pay once for a whole period. You can skip this step and add subscriptions later — or leave the name and price blank to skip and click Next.",

      nameLabel: "Name",
      namePlaceholder: "e.g. Monthly Unlimited",
      nameHelp: "Short label families will see when choosing this subscription.",

      durationMonthsLabel: "Length",
      durationMonthsHelp: "How long the subscription lasts.",
      durationMonthsOption1:  "1 month",
      durationMonthsOption3:  "3 months",
      durationMonthsOption6:  "6 months",
      durationMonthsOption12: "12 months",

      visitsPerWeekLabel: "Visits per week",
      visitsPerWeekHelp: "How many times the kid can come each week. Pick Unlimited for no weekly cap.",
      visitsPerWeekOption1: "1 visit per week",
      visitsPerWeekOption2: "2 visits per week",
      visitsPerWeekOption3: "3 visits per week",
      visitsPerWeekOption4: "4 visits per week",
      visitsPerWeekOption5: "5 visits per week",
      visitsPerWeekOption6: "6 visits per week",
      visitsPerWeekOptionUnlimited: "Unlimited",

      minutesPerVisitLabel: "Minutes per visit",
      minutesPerVisitHelp: "How long each visit lasts.",
      // Reuses Step 3's durationOption keys for consistency.

      priceLabel: "Total price",
      pricePlaceholder: "50.00",
      priceHelp: "The total a family pays for the whole subscription period — not per visit.",
      priceSuffix: "USD"
    },

    // Step 5 — First bundle (OPTIONAL — Skip allowed)
    step5: {
      title: "Your first bundle (optional)",
      subtitle: "A bundle is a prepaid pack of visits — like a punch card. The family pays once and uses the visits within a validity period. You can skip this step and add bundles later — or leave the name and price blank to skip and click Next.",

      nameLabel: "Name",
      namePlaceholder: "e.g. 10-Visit Pack",
      nameHelp: "Short label families will see when choosing this bundle.",

      totalVisitsLabel: "Number of visits",
      totalVisitsHelp: "How many visits the bundle contains in total.",
      totalVisitsOption5:  "5 visits",
      totalVisitsOption10: "10 visits",
      totalVisitsOption15: "15 visits",
      totalVisitsOption20: "20 visits",
      totalVisitsOption25: "25 visits",

      validityMonthsLabel: "Validity",
      validityMonthsHelp: "How long the family has to use up the visits before they expire.",
      validityMonthsOption1:  "1 month",
      validityMonthsOption3:  "3 months",
      validityMonthsOption6:  "6 months",
      validityMonthsOption12: "12 months",

      minutesPerVisitLabel: "Minutes per visit",
      minutesPerVisitHelp: "How long each visit lasts.",
      // Reuses Step 3's durationOption keys for consistency.

      priceLabel: "Total price",
      pricePlaceholder: "40.00",
      priceHelp: "The total a family pays for the whole bundle — not per visit.",
      priceSuffix: "USD"
    },

    // Step 7 — placeholder until built (display-only by design, see §39.4)
    placeholderStepTitle: "Step {n}: {name}",
    placeholderStepBody: "This step will be built next. For now, click Next to continue.",

    // Step 6 — Confirm SuperAdmin account
    step6: {
      title: "Your account",
      subtitle: "This is the SuperAdmin account you used to start the setup. You can update your display name now or change it later from the Admin Panel.",

      emailLabel: "Email",
      emailHelp: "This is how you sign in. To change it, open the Admin Panel after setup.",

      roleLabel: "Role",
      roleHelp: "SuperAdmin is the owner role — full access to everything. You can add more staff with limited access later.",

      usernameLabel: "Display name",
      usernamePlaceholder: "e.g. Rafic",
      usernameHelp: "What appears in audit logs and on the dashboard. Leave it as it is to keep your current display name."
    }
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

    // Wizard validation — Step 4
    subscriptionNameTooShort: "Subscription name must be at least 2 characters.",
    subscriptionNameTooLong: "Subscription name is too long.",
    subscriptionPriceInvalid: "Price must be a number, e.g. 50 or 50.00.",
    subscriptionPriceNegative: "Price cannot be negative.",
    subscriptionPriceTooManyDecimals: "Price can have at most two decimal places.",
    subscriptionPriceTooHigh: "Price is unreasonably high.",
    subscriptionPartialFill: "Please fill in both name and price, or leave both blank to skip.",

    // Wizard validation — Step 5
    bundleNameTooShort: "Bundle name must be at least 2 characters.",
    bundleNameTooLong: "Bundle name is too long.",
    bundlePriceInvalid: "Price must be a number, e.g. 40 or 40.00.",
    bundlePriceNegative: "Price cannot be negative.",
    bundlePriceTooManyDecimals: "Price can have at most two decimal places.",
    bundlePriceTooHigh: "Price is unreasonably high.",
    bundlePartialFill: "Please fill in both name and price, or leave both blank to skip.",

    // Generic fallback
    unexpected: "Something went wrong. Please try again."
  },

  toast: {
    signedOut: "You have been signed out.",
    setupComplete: "Setup complete! Welcome to Aquaria."
  }

};