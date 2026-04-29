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
    loadingProfile: "Loading your account…",
    navKids: "Kids"
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

  kids: {
    register: {
      pageTitle: "Register a new kid",
      pageSubtitle: "Fill in the child's information. Required fields are marked.",

      // Sections
      sectionChild: "Child",
      sectionSchool: "School",
      sectionParent: "Parent & contacts",
      sectionLocation: "Location",
      sectionNotes: "Notes",

      // Photo
      photoLabel: "Photo (optional)",
      photoHelp: "Will be replaced by face capture once the terminal is connected.",
      photoPick: "Choose photo",
      photoTake: "Take photo",
      photoRemove: "Remove",
      photoProcessing: "Processing photo…",

      // Child fields
      firstNameLabel: "First name",
      firstNamePlaceholder: "e.g. Maya",
      lastNameLabel: "Last name",
      lastNamePlaceholder: "e.g. Khoury",
      dobLabel: "Date of birth",
      dobHelp: "Between 1 and 18 years ago.",
      genderLabel: "Gender",
      genderMale: "Male",
      genderFemale: "Female",

      // School fields
      schoolTypeLabel: "School type",
      schoolTypeLocal: "Local school",
      schoolTypeOoc: "Out-of-country school",
      schoolNameLabel: "School name",
      schoolNameLocalPlaceholder: "e.g. AIS",
      schoolNameOocPlaceholder: "Optional — name of school abroad",
      schoolNameLocalHelp: "Type the school name. Suggestions appear as you type.",
      schoolNameOocHelp: "If parents share the school's name, enter it here.",
      gradeLabel: "Grade",
      gradePlaceholder: "e.g. Grade 3",
      gradeHelp: "Type the grade. Suggestions appear as you type.",

      // Parent fields
      parentNameLabel: "Parent name",
      parentNamePlaceholder: "e.g. Sarah Khoury",
      phoneLabel: "Parent phone",
      phoneHelp: "Pick the country code, then enter the local number.",
      phonePlaceholder: "70 123 456",
      emergencyLabel: "Emergency contact (optional)",
      emergencyHelp: "A second number reachable in case the parent isn't.",
      emergencyPlaceholder: "Local number",

      // Location fields
      cityLabel: "City of residence",
      cityPlaceholder: "e.g. Beirut",
      addressLabel: "Full address (optional)",
      addressPlaceholder: "Street, building, floor",

      // Notes
      notesLabel: "Notes (optional)",
      notesPlaceholder: "Allergies, medical notes, behavioral notes…",
      notesHelp: "Up to 500 characters.",

      // Actions
      submitButton: "Register kid",
      submittingButton: "Registering…",
      cancelButton: "Cancel",

      // Validation messages
      requiredField: "This field is required.",
      firstNameTooShort: "First name is too short.",
      firstNameTooLong: "First name is too long.",
      lastNameTooShort: "Last name is too short.",
      lastNameTooLong: "Last name is too long.",
      dobInvalid: "Please pick a valid date.",
      dobOutOfRange: "Date of birth must be between 1 and 18 years ago.",
      schoolNameRequiredLocal: "School name is required for local schools.",
      schoolNameTooLong: "School name is too long.",
      gradeTooLong: "Grade is too long.",
      parentNameTooShort: "Parent name is too short.",
      parentNameTooLong: "Parent name is too long.",
      phoneInvalid: "Phone number must have between 6 and 14 digits.",
      emergencyInvalid: "Emergency contact must have between 6 and 14 digits.",
      cityTooShort: "City is required.",
      cityTooLong: "City name is too long.",
      addressTooLong: "Address is too long.",
      notesTooLong: "Notes must be 500 characters or fewer.",
      photoTooLarge: "Photo file is too large (max 10 MB).",
      photoNotImage: "Selected file is not an image."
    },

    edit: {
      pageTitle: "Edit kid",
      pageSubtitle: "Update this kid's details. Photo replacement comes in a later update.",
 
      photoCaptionReadOnly: "Only admins can change photos.",

    photoAddButton:     "Add photo",
    photoReplaceButton: "Replace photo",
    photoRemoveButton:  "Remove photo",
    photoReplacing:     "Uploading…",
    photoRemoving:      "Removing…",

    confirmRemovePhotoTitle:   "Remove this photo?",
    confirmRemovePhotoBody:    "Remove the current photo for {name}? You can upload a new one anytime.",
    confirmRemovePhotoConfirm: "Remove photo",
    confirmRemovePhotoCancel:  "Cancel",
 
      cancelButton: "Cancel",
      saveButton: "Save changes",
      savingButton: "Saving…",
 
      lockedTitle: "Someone is already editing this kid",
      lockedBody: "{name} has the edit form open. Your changes would overwrite theirs, so editing is locked until they finish.",
      lockedWaiting: "Waiting for the lock to release…",
      lockedNowAvailable: "The lock is now available. You can start editing.",
      lockedBack: "Back to profile",
      lockedRetry: "Start editing"
    },

    profile: {
      pageTitle: "Kid profile",
      backToDashboard: "Back to dashboard",
      editButton: "Edit",
      blockButton:    "Block",
    unblockButton:  "Unblock",
    deleteButton:   "Delete",

    confirmCancel:  "Cancel",

    confirmBlockTitle:    "Block this kid?",
    confirmBlockBody:     "{name} will be marked as Blocked. Staff can still see the profile, but the kid won't be able to check in. Provide a reason for the audit log.",
    confirmBlockConfirm:  "Block kid",
    blockReasonLabel:     "Reason",
    blockReasonPlaceholder: "e.g. Repeated rough play with younger kids — parent informed.",
    blockReasonRequired:  "A reason is required when blocking a kid.",
    permanentBlockLabel:  "Permanent block",
    permanentBlockHelp:   "Permanent blocks require explicit unmarking before unblocking. Use only for serious safety concerns.",

    confirmUnblockTitle:   "Unblock this kid?",
    confirmUnblockBody:    "{name} will be marked as Active again. The block history is preserved.",
    confirmUnblockConfirm: "Unblock kid",

    confirmDeleteTitle:    "Delete this kid?",
    confirmDeleteBody:     "{name} will be soft-deleted. The record can be restored from the kids list with \"Show deleted\" turned on.",
    confirmDeleteConfirm:  "Delete kid",

    blockHistorySection:    "Block history",
    blockHistoryCurrent:    "Currently blocked",
    blockHistoryPast:       "Resolved",
    blockHistoryPermanent:  "Permanent",
    blockHistoryResolvedOn: "Unblocked on {date}.",
      registerAnother: "Register another kid",

      // Family / siblings (§39.14)
    familySectionTitle:      "Family",
    familyLoading:           "Loading siblings…",
    familyEmpty:             "No siblings linked yet.",
    familyLinkButton:        "Link sibling",
    familyUnlinkButton:      "Unlink",
 
    confirmUnlinkTitle:      "Unlink this sibling?",
    confirmUnlinkBody:       "{name} will no longer be linked to this kid as a sibling. You can re-link them at any time.",
    confirmUnlinkConfirm:    "Unlink",
 
    linkModalTitle:          "Link a sibling",
    linkModalBody:           "Search for a kid to link. Linking will use a shared family ID; you can unlink at any time.",
    linkModalSearchPlaceholder: "Type a name…",
    linkModalLoading:        "Searching…",
    linkModalNoResults:      "No matching kids.",
    linkModalAlreadyInFamily: "Already in another family",
    linkModalCancel:         "Close",

      // Sections
      sectionChild: "Child",
      sectionSchool: "School",
      sectionParent: "Parent & contacts",
      sectionLocation: "Location",
      sectionNotes: "Notes",

      // Field labels (read-only display)
      labelFirstName: "First name",
      labelLastName: "Last name",
      labelFullName: "Full name",
      labelDob: "Date of birth",
      labelAge: "Age",
      labelGender: "Gender",
      labelSchoolType: "School type",
      labelSchool: "School",
      labelGrade: "Grade",
      labelParentName: "Parent",
      labelPhone: "Phone",
      labelEmergency: "Emergency contact",
      labelCity: "City",
      labelAddress: "Address",
      labelNotes: "Notes",
      labelStatus: "Status",
      labelLoyalty: "Loyalty",
      labelRegisteredOn: "Registered",

      // Display values
      schoolTypeLocal: "Local",
      schoolTypeOoc: "Out-of-country",
      ageYears: "{years} years",
      ageOneYear: "1 year",
      none: "—",
      statusActive: "Active",
      statusBlocked: "Blocked",
      loyaltyLine: "{points} pts · {level}",

      notFoundTitle: "Kid not found",
      notFoundBody: "This kid record does not exist or has been deleted."
    }
  },

  // Developer-only tools, gated to dev project + SuperAdmin role at runtime.
  // These strings are shown only on the dev project and never reach end users.
  devTools: {
    badge: "Dev",
    title: "Developer tools",
    subtitle: "Only visible in the development project. These actions write to the live database — use with care.",

    seedButton: "Seed 5 fake kids",
    seedRunning: "Seeding…",
    seedSuccess: "Seeded {count} fake kids.",

    backfillButton: "Backfill SearchKey on existing kids",
    backfillRunning: "Backfilling…",
    backfillSuccess: "Backfill done — {updated} of {scanned} kids updated."
  },

  kidsList: {
    title: "Kids",
    registerButton: "+ Register kid",

    searchPlaceholder: "Search by name…",

    statusLabel: "Status",
    statusAll: "All",
    statusActive: "Active",
    statusBlocked: "Blocked",

    schoolLabel: "School",
    schoolAny: "Any school",
    schoolOoc: "Out-of-country",

    sortLabel: "Sort",
    sortName: "Name (A–Z)",
    sortNewest: "Newest first",
    sortOldest: "Oldest first",

    showDeleted: "Show deleted",

    badgeBlocked: "Blocked",
    badgeDeleted: "Deleted",

    loading: "Loading kids…",
    loadingMore: "Loading…",
    loadMore: "Load {n} more",

    // Result count line.  {n} = number,  {verb} = "active kids" / "blocked kids" / etc.
    countExact: "Showing all {n} {verb}.",
    countMany:  "Showing {n} {verb} (more available).",
    countZero:  "No {verb} match these filters.",
    verbActive:  "active kids",
    verbBlocked: "blocked kids",
    verbAll:     "kids",

    // Empty states
    emptyTitle: "No kids registered yet",
    emptyBody: "Register your first kid to get started.",
    emptyCta: "Register your first kid",
    noMatchTitle: "No kids match these filters",
    noMatchBody: "Try clearing filters or adjusting your search.",
    clearFilters: "Clear filters",
    restoreButton:  "Restore",
    thisKid:        "this kid",

    confirmRestoreTitle:   "Restore this kid?",
    confirmRestoreBody:    "{name} will be restored to the active list. Block history and other data are preserved.",
    confirmRestoreConfirm: "Restore kid",
    confirmRestoreCancel:  "Cancel",

    errorTitle: "Could not load the kids list"
  },

editLocks: {
    // Generic
    unknownHolder: "Another staff member",

    autoExitedToast: "Your edit session ended due to inactivity. Changes were not saved.",
    lockLostToast: "Your edit lock was released by an administrator. Changes were not saved.",

    // Warning modal (shown by the service when inactivity timer fires)
    warningTitle: "Are you still there?",
    warningBody: "You haven't made any changes for a while. Your unsaved edits will be discarded if you don't continue.",
    warningCountdown: "{n}s",
    warningContinue: "Keep editing",
    warningLeave: "Discard and leave",

    // Playground (dev-tools)
    playground: {
      title: "Edit-locks playground",
      subtitle: "Exercise the edit-locks service against a fake lock key. Open in two windows as different users to test concurrent acquisition. Inactivity and warning seconds are short by default for fast testing.",

      inactivityLabel: "Inactivity (seconds)",
      warningLabel: "Warning (seconds)",

      acquireButton: "Acquire lock",
      acquiring: "Acquiring…",
      activityButton: "Simulate activity",
      activityRecorded: "Activity recorded.",
      releaseButton: "Release lock",
      releasing: "Releasing…",
      forceExpireButton: "Force expire",
      forceReleaseButton: "Force release",

      readoutTitle: "Lock document",
      readoutLoading: "Loading…",

      acquired: "Lock acquired.",
      released: "Lock released.",
      autoExited: "Lock auto-released after warning timeout.",
      heldByOther: "Lock is held by {name}.",
      forcedExpire: "Lock expiry pushed to the past — anyone can now reclaim it.",
      forceExpireFailed: "Couldn't force expire — lock document may not exist.",
      forceReleased: "Lock force-released.",
      alreadyHeld: "You already hold this lock."
    }
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

    // Kids module
    notSignedIn: "Your session has ended. Please sign in again.",
    kidWriteFailed: "Could not save the kid. Please try again.",
    editForbidden:        "Only admins and super-admins can edit kid records.",
    siblingsReadFailed:        "Could not load siblings. Please try again.",
    siblingLinkFailed:         "Could not link this sibling. Please try again.",
    siblingUnlinkFailed:       "Could not unlink this sibling. Please try again.",
    siblingFamiliesConflict:   "These two kids are already in different families. Unlink one side first.",
    siblingSameKid:            "A kid can't be their own sibling.",
    siblingNotLinked:          "This kid isn't linked to a family yet.",
    blockReasonRequired:  "A reason is required when blocking a kid.",
    blockReasonTooLong:   "Block reason is too long (max 500 characters).",
    kidBlockFailed:       "Could not block this kid. Please try again.",
    kidUnblockFailed:     "Could not unblock this kid. Please try again.",
    kidDeleteFailed:      "Could not delete this kid. Please try again.",
    kidRestoreFailed:     "Could not restore this kid. Please try again.",
    photoMissing:         "No photo file was selected.",
    photoReplaceFailed:   "Could not replace the photo. Please try again.",
    photoRemoveFailed:    "Could not remove the photo. Please try again.",
    
    kidReadFailed: "Could not load the kid. Please try again.",
    kidNotFound: "That kid was not found.",
    kidIdMissing: "Missing kid ID.",
    photoUploadPartial: "Kid registered, but the photo couldn't be uploaded. You can add it later.",
    kidsListLoadFailed: "Could not load the kids list. Please try again.",

    // Dev tools
    seedFailed: "Could not seed any kids. Check console for details.",
    backfillReadFailed: "Could not read kids to backfill. Please try again.",

    // Generic fallback
    unexpected: "Something went wrong. Please try again."
  },

  toast: {
    signedOut: "You have been signed out.",
    setupComplete: "Setup complete! Welcome to Aquaria.",
    kidRegistered: "{name} registered.",
    kidUpdated: "Saved changes for {name}.",
    kidBlocked:     "{name} blocked.",
    kidUnblocked:   "{name} unblocked.",
    kidDeleted:     "{name} deleted.",
    kidRestored:    "{name} restored.",
    photoReplaced:  "Photo updated.",
    photoRemoved:   "Photo removed.",
    siblingLinked:    "Linked sibling: {name}.",
    siblingUnlinked:  "Unlinked sibling: {name}.",
  }

};