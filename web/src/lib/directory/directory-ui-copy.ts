/** Resolved UI strings for directory + profile discovery (passed from server via `createTranslator`). */
export type DirectoryUiCopy = {
  common: { brand: string };
  discoverLoadError: string;
  loadResultsError: string;
  emptyResults: string;
  loadingMore: string;
  mobile: { filters: string; sheetTitle: string; sheetDescription: string };
  toolbar: {
    resultLayoutAria: string;
    gridViewAria: string;
    listViewAria: string;
    resultsOne: string;
    resultsMany: string;
  };
  refine: {
    suggestionsTitle: string;
  };
  intent: {
    showingForPrefix: string;
    interpretedAsPrefix: string;
    heightUnitCm: string;
  };
  hero: {
    interpreting: string;
    interpretError: string;
  };
  sort: { aria: string; recommended: string; featured: string; recent: string; updated: string };
  filters: {
    locationSearchLabel: string;
    locationPlaceholder: string;
    clearCityAria: string;
    noCitiesYet: string;
    noCitiesMatch: string;
    searchFiltersLabel: string;
    searchFiltersPlaceholder: string;
    clearFilterSearchAria: string;
    showLess: string;
    showAll: string;
    resetHeight: string;
    minCm: string;
    maxCm: string;
    resetAge: string;
    minAge: string;
    maxAge: string;
    gridProfileAriaOne: string;
    gridProfileAriaMany: string;
    sidebarTitle: string;
    clearAll: string;
    radioMore: string;
    emptyAsideTitle: string;
    emptyAsideBody: string;
    emptyAsideBulletAdmin: string;
    emptyAsideBulletMigration: string;
    emptyAsideLink: string;
    filterMatchesOne: string;
    filterMatchesMany: string;
    filterGroupsOne: string;
    filterGroupsMany: string;
    filterMatchesAcross: string;
    filterNoLabelsMatch: string;
    filterNothingMatches: string;
  };
  chips: {
    height: string;
    searchPrefix: string;
    clearTaxonomy: string;
    heightMinPart: string;
    heightMaxPart: string;
  };
  talentType: { barAria: string; all: string };
  /** ALL label for the configurable taxonomy pill row above results. */
  topBarPills: { all: string };
  taxonomyBarAria: string;
  card: {
    available: string;
    saveAria: string;
    removeSaveAria: string;
    shareAria: string;
    featuredAria: string;
    featuredLabel: string;
    livesInTitle: string;
    viewPortfolio: string;
    inquire: string;
    quickPreview: string;
    /** Accessible label for optional AI “why this match” list on directory cards. */
    aiMatchWhyAria: string;
    aiDetailsOpenAria: string;
    aiDetailsDrawerTitle: string;
    aiDetailsDrawerDescription: string;
    aiDetailsVectorScore: string;
    /** Classic directory filter overlap heading. */
    matchWhyPrefix: string;
    footerTalent: string;
    linkCopiedTitle: string;
    linkCopiedMessage: string;
    linkCopyFailedTitle: string;
    linkCopyFailedMessage: string;
    srOnlyProfileCode: string;
    imageAltTalentPhoto: string;
    shareNativeText: string;
  };
  list: {
    saveAria: string;
    removeSaveAria: string;
    view: string;
    inquire: string;
    preview: string;
  };
  preview: {
    originallyFrom: string;
    editorialOnly: string;
    languagesPrefix: string;
    skillsPrefix: string;
    viewFullProfile: string;
    close: string;
    saveThisTalent: string;
    savedToCart: string;
    imageAlt: string;
    dialogAria: string;
  };
  lightbox: {
    dialogAria: string;
    closeAria: string;
    prevAria: string;
    nextAria: string;
  };
  flash: { dismissAria: string };
  inquiry: {
    saveThisTalent: string;
    savedToInquiryCart: string;
    contactAboutTalent: string;
    openInquiry: string;
    flashCouldNotUpdateSaved: string;
    flashSavedTitle: string;
    flashRemovedTitle: string;
    flashAddedShortlist: string;
    flashRemovedShortlist: string;
    flashCouldNotSaveTalent: string;
  };
  profileCta: {
    addToMyList: string;
    savedToMyList: string;
    contactAboutTalent: string;
    openInquiryCart: string;
    browseMoreTalent: string;
    contactImpronta: string;
  };
  inquirySheet: {
    titleThankYou: string;
    titleContactAgency: string;
    titleStartInquiry: string;
    descThankYou: string;
    descWithShortlist: string;
    descEmptyShortlist: string;
    loading: string;
    unconfigured: string;
    shortlistTitle: string;
    shortlistEmptyDescription: string;
    shortlistEmptyHintBefore: string;
    shortlistSaveWord: string;
    shortlistEmptyHintAfter: string;
    yourShortlistTitle: string;
    profilesInRequestOne: string;
    profilesInRequestMany: string;
    messageDetailsTitle: string;
    messageDetailsPaused: string;
    messageDetailsClient: string;
    messageDetailsGuest: string;
    inquiriesPausedNotice: string;
    guestCtaCreateAccount: string;
    guestCtaAfterCreateLink: string;
    guestCtaLogIn: string;
    guestCtaAfterLoginLink: string;
    backToDirectory: string;
    talentFallbackName: string;
    aiAssistTitle: string;
    aiAssistBody: string;
  };
  inquirySuccess: {
    inquirySentTitle: string;
    inquirySentDescription: string;
    followUpNoEmail: string;
    followUpWithEmail: string;
    activationMatched: string;
    activationPrepared: string;
    activationAnyTime: string;
    activationBenefits: string;
    activateAccountButton: string;
    logInTrackRequestButton: string;
  };
  inquiryQuickAdd: {
    label: string;
    placeholder: string;
    searching: string;
    noMatches: string;
    minCharsHint: string;
    add: string;
    added: string;
    couldNotAddTitle: string;
  };
  inquiryCart: {
    remove: string;
    removeAria: string;
    couldNotRemoveTitle: string;
    removedTitle: string;
    removedMessage: string;
  };
  inquiryForm: {
    sending: string;
    submitInquiry: string;
    whatsAppCompose: string;
    whatsAppTitleOn: string;
    whatsAppTitleOff: string;
    labelYourName: string;
    labelEmail: string;
    labelPhone: string;
    labelCompany: string;
    labelLookingFor: string;
    placeholderLookingFor: string;
    eventTypeNone: string;
    labelEventType: string;
    labelEventDate: string;
    labelEventLocation: string;
    placeholderEventLocation: string;
    labelQuantity: string;
    placeholderQuantity: string;
    labelBrief: string;
    placeholderBrief: string;
    privacyNotice: string;
    draftGenerate: string;
    draftPolish: string;
    draftWorking: string;
    draftError: string;
    draftPolishNeedText: string;
    draftHint: string;
  };
};

type T = (key: string) => string;

function replaceCount(template: string, count: number): string {
  return template.replace(/\{count\}/g, String(count));
}

export function buildDirectoryUiCopy(t: T): DirectoryUiCopy {
  return {
    common: { brand: t("public.common.brand") },
    discoverLoadError: t("public.directory.discoverLoadError"),
    loadResultsError: t("public.directory.loadResultsError"),
    emptyResults: t("public.directory.emptyResults"),
    loadingMore: t("public.directory.loadingMore"),
    mobile: {
      filters: t("public.directory.ui.mobile.filters"),
      sheetTitle: t("public.directory.ui.mobile.sheetTitle"),
      sheetDescription: t("public.directory.ui.mobile.sheetDescription"),
    },
    toolbar: {
      resultLayoutAria: t("public.directory.ui.toolbar.resultLayoutAria"),
      gridViewAria: t("public.directory.ui.toolbar.gridViewAria"),
      listViewAria: t("public.directory.ui.toolbar.listViewAria"),
      resultsOne: t("public.directory.ui.toolbar.resultsOne"),
      resultsMany: t("public.directory.ui.toolbar.resultsMany"),
    },
    refine: {
      suggestionsTitle: t("public.directory.ui.refine.suggestionsTitle"),
    },
    intent: {
      showingForPrefix: t("public.directory.ui.intent.showingForPrefix"),
      interpretedAsPrefix: t("public.directory.ui.intent.interpretedAsPrefix"),
      heightUnitCm: t("public.directory.ui.intent.heightUnitCm"),
    },
    hero: {
      interpreting: t("public.directory.ui.hero.interpreting"),
      interpretError: t("public.directory.ui.hero.interpretError"),
    },
    sort: {
      aria: t("public.directory.ui.sort.aria"),
      recommended: t("public.directory.ui.sort.recommended"),
      featured: t("public.directory.ui.sort.featured"),
      recent: t("public.directory.ui.sort.recent"),
      updated: t("public.directory.ui.sort.updated"),
    },
    filters: {
      locationSearchLabel: t("public.directory.ui.filters.locationSearchLabel"),
      locationPlaceholder: t("public.directory.ui.filters.locationPlaceholder"),
      clearCityAria: t("public.directory.ui.filters.clearCityAria"),
      noCitiesYet: t("public.directory.ui.filters.noCitiesYet"),
      noCitiesMatch: t("public.directory.ui.filters.noCitiesMatch"),
      searchFiltersLabel: t("public.directory.ui.filters.searchFiltersLabel"),
      searchFiltersPlaceholder: t("public.directory.ui.filters.searchFiltersPlaceholder"),
      clearFilterSearchAria: t("public.directory.ui.filters.clearFilterSearchAria"),
      showLess: t("public.directory.ui.filters.showLess"),
      showAll: t("public.directory.ui.filters.showAll"),
      resetHeight: t("public.directory.ui.filters.resetHeight"),
      minCm: t("public.directory.ui.filters.minCm"),
      maxCm: t("public.directory.ui.filters.maxCm"),
      resetAge: t("public.directory.ui.filters.resetAge"),
      minAge: t("public.directory.ui.filters.minAge"),
      maxAge: t("public.directory.ui.filters.maxAge"),
      gridProfileAriaOne: t("public.directory.ui.filters.gridProfileAriaOne"),
      gridProfileAriaMany: t("public.directory.ui.filters.gridProfileAriaMany"),
      sidebarTitle: t("public.directory.ui.filters.sidebarTitle"),
      clearAll: t("public.directory.ui.filters.clearAll"),
      radioMore: t("public.directory.ui.filters.radioMore"),
      emptyAsideTitle: t("public.directory.ui.filters.emptyAsideTitle"),
      emptyAsideBody: t("public.directory.ui.filters.emptyAsideBody"),
      emptyAsideBulletAdmin: t("public.directory.ui.filters.emptyAsideBulletAdmin"),
      emptyAsideBulletMigration: t("public.directory.ui.filters.emptyAsideBulletMigration"),
      emptyAsideLink: t("public.directory.ui.filters.emptyAsideLink"),
      filterMatchesOne: t("public.directory.ui.filters.filterMatchesOne"),
      filterMatchesMany: t("public.directory.ui.filters.filterMatchesMany"),
      filterGroupsOne: t("public.directory.ui.filters.filterGroupsOne"),
      filterGroupsMany: t("public.directory.ui.filters.filterGroupsMany"),
      filterMatchesAcross: t("public.directory.ui.filters.filterMatchesAcross"),
      filterNoLabelsMatch: t("public.directory.ui.filters.filterNoLabelsMatch"),
      filterNothingMatches: t("public.directory.ui.filters.filterNothingMatches"),
    },
    chips: {
      height: t("public.directory.ui.chips.height"),
      searchPrefix: t("public.directory.ui.chips.searchPrefix"),
      clearTaxonomy: t("public.directory.ui.chips.clearTaxonomy"),
      heightMinPart: t("public.directory.ui.chips.heightMinPart"),
      heightMaxPart: t("public.directory.ui.chips.heightMaxPart"),
    },
    talentType: {
      barAria: t("public.directory.ui.talentType.barAria"),
      all: t("public.directory.ui.talentType.all"),
    },
    topBarPills: {
      all: t("public.directory.ui.topBarPills.all"),
    },
    taxonomyBarAria: t("public.directory.ui.taxonomyBarAria"),
    card: {
      available: t("public.directory.ui.card.available"),
      saveAria: t("public.directory.ui.card.saveAria"),
      removeSaveAria: t("public.directory.ui.card.removeSaveAria"),
      shareAria: t("public.directory.ui.card.shareAria"),
      featuredAria: t("public.directory.ui.card.featuredAria"),
      featuredLabel: t("public.directory.ui.card.featuredLabel"),
      livesInTitle: t("public.directory.ui.card.livesInTitle"),
      viewPortfolio: t("public.directory.ui.card.viewPortfolio"),
      inquire: t("public.directory.ui.card.inquire"),
      quickPreview: t("public.directory.ui.card.quickPreview"),
      aiMatchWhyAria: t("public.directory.ui.card.aiMatchWhyAria"),
      aiDetailsOpenAria: t("public.directory.ui.card.aiDetailsOpenAria"),
      aiDetailsDrawerTitle: t("public.directory.ui.card.aiDetailsDrawerTitle"),
      aiDetailsDrawerDescription: t("public.directory.ui.card.aiDetailsDrawerDescription"),
      aiDetailsVectorScore: t("public.directory.ui.card.aiDetailsVectorScore"),
      matchWhyPrefix: t("public.directory.ui.card.matchWhyPrefix"),
      footerTalent: t("public.directory.ui.card.footerTalent"),
      linkCopiedTitle: t("public.directory.ui.card.linkCopiedTitle"),
      linkCopiedMessage: t("public.directory.ui.card.linkCopiedMessage"),
      linkCopyFailedTitle: t("public.directory.ui.card.linkCopyFailedTitle"),
      linkCopyFailedMessage: t("public.directory.ui.card.linkCopyFailedMessage"),
      srOnlyProfileCode: t("public.directory.ui.card.srOnlyProfileCode"),
      imageAltTalentPhoto: t("public.directory.ui.card.imageAltTalentPhoto"),
      shareNativeText: t("public.directory.ui.card.shareNativeText"),
    },
    list: {
      saveAria: t("public.directory.ui.card.saveAria"),
      removeSaveAria: t("public.directory.ui.card.removeSaveAria"),
      view: t("public.directory.ui.list.view"),
      inquire: t("public.directory.ui.card.inquire"),
      preview: t("public.directory.ui.list.preview"),
    },
    preview: {
      originallyFrom: t("public.directory.ui.preview.originallyFrom"),
      editorialOnly: t("public.directory.ui.preview.editorialOnly"),
      languagesPrefix: t("public.directory.ui.preview.languagesPrefix"),
      skillsPrefix: t("public.directory.ui.preview.skillsPrefix"),
      viewFullProfile: t("public.directory.ui.preview.viewFullProfile"),
      close: t("public.directory.ui.preview.close"),
      saveThisTalent: t("public.directory.ui.preview.saveThisTalent"),
      savedToCart: t("public.directory.ui.preview.savedToCart"),
      imageAlt: t("public.directory.ui.preview.imageAlt"),
      dialogAria: t("public.directory.ui.preview.dialogAria"),
    },
    lightbox: {
      dialogAria: t("public.directory.ui.lightbox.dialogAria"),
      closeAria: t("public.directory.ui.lightbox.closeAria"),
      prevAria: t("public.directory.ui.lightbox.prevAria"),
      nextAria: t("public.directory.ui.lightbox.nextAria"),
    },
    flash: {
      dismissAria: t("public.directory.ui.flash.dismissAria"),
    },
    inquiry: {
      saveThisTalent: t("public.directory.inquiry.saveThisTalent"),
      savedToInquiryCart: t("public.directory.inquiry.savedToInquiryCart"),
      contactAboutTalent: t("public.directory.inquiry.contactAboutTalent"),
      openInquiry: t("public.directory.inquiry.openInquiry"),
      flashCouldNotUpdateSaved: t("public.directory.inquiry.flashCouldNotUpdateSaved"),
      flashSavedTitle: t("public.directory.inquiry.flashSavedTitle"),
      flashRemovedTitle: t("public.directory.inquiry.flashRemovedTitle"),
      flashAddedShortlist: t("public.directory.inquiry.flashAddedShortlist"),
      flashRemovedShortlist: t("public.directory.inquiry.flashRemovedShortlist"),
      flashCouldNotSaveTalent: t("public.directory.inquiry.flashCouldNotSaveTalent"),
    },
    profileCta: {
      addToMyList: t("public.profile.cta.addToMyList"),
      savedToMyList: t("public.profile.cta.savedToMyList"),
      contactAboutTalent: t("public.profile.cta.contactAboutTalent"),
      openInquiryCart: t("public.profile.cta.openInquiryCart"),
      browseMoreTalent: t("public.profile.cta.browseMoreTalent"),
      contactImpronta: t("public.profile.cta.contactImpronta"),
    },
    inquirySheet: {
      titleThankYou: t("public.forms.inquiry.thankYou"),
      titleContactAgency: t("public.forms.inquiry.contactAgency"),
      titleStartInquiry: t("public.forms.inquiry.startInquiry"),
      descThankYou: t("public.forms.inquiry.messageInGoodHands"),
      descWithShortlist: t("public.forms.inquiry.sheetDescWithShortlist"),
      descEmptyShortlist: t("public.forms.inquiry.sheetDescEmptyShortlist"),
      loading: t("public.forms.inquiry.sheetLoading"),
      unconfigured: t("public.forms.inquiry.directoryNotConfigured"),
      shortlistTitle: t("public.forms.inquiry.shortlistTitle"),
      shortlistEmptyDescription: t("public.forms.inquiry.shortlistEmptyDescription"),
      shortlistEmptyHintBefore: t("public.forms.inquiry.shortlistEmptyHintBefore"),
      shortlistSaveWord: t("public.forms.inquiry.shortlistSaveWord"),
      shortlistEmptyHintAfter: t("public.forms.inquiry.shortlistEmptyHintAfter"),
      yourShortlistTitle: t("public.forms.inquiry.yourShortlistTitle"),
      profilesInRequestOne: t("public.forms.inquiry.profilesInRequestOne"),
      profilesInRequestMany: t("public.forms.inquiry.profilesInRequestMany"),
      messageDetailsTitle: t("public.forms.inquiry.messageDetailsTitle"),
      messageDetailsPaused: t("public.forms.inquiry.messageDetailsPaused"),
      messageDetailsClient: t("public.forms.inquiry.messageDetailsClient"),
      messageDetailsGuest: t("public.forms.inquiry.messageDetailsGuest"),
      inquiriesPausedNotice: t("public.forms.inquiry.inquiriesPausedNotice"),
      guestCtaCreateAccount: t("public.forms.inquiry.guestCtaCreateAccount"),
      guestCtaAfterCreateLink: t("public.forms.inquiry.guestCtaAfterCreateLink"),
      guestCtaLogIn: t("public.forms.inquiry.guestCtaLogIn"),
      guestCtaAfterLoginLink: t("public.forms.inquiry.guestCtaAfterLoginLink"),
      backToDirectory: t("public.forms.inquiry.backToDirectory"),
      talentFallbackName: t("public.forms.inquiry.talentFallbackName"),
      aiAssistTitle: t("public.forms.inquiry.aiAssistTitle"),
      aiAssistBody: t("public.forms.inquiry.aiAssistBody"),
    },
    inquirySuccess: {
      inquirySentTitle: t("public.forms.inquiry.successInquirySentTitle"),
      inquirySentDescription: t("public.forms.inquiry.successInquirySentDescription"),
      followUpNoEmail: t("public.forms.inquiry.successFollowUpNoEmail"),
      followUpWithEmail: t("public.forms.inquiry.successFollowUpWithEmail"),
      activationMatched: t("public.forms.inquiry.activationEmailMatched"),
      activationPrepared: t("public.forms.inquiry.preparedClientAccount"),
      activationAnyTime: t("public.forms.inquiry.activateAccountAnyTime"),
      activationBenefits: t("public.forms.inquiry.activationBenefits"),
      activateAccountButton: t("public.forms.inquiry.activateAccountButton"),
      logInTrackRequestButton: t("public.forms.inquiry.logInTrackRequestButton"),
    },
    inquiryQuickAdd: {
      label: t("public.forms.inquiry.quickAddLabel"),
      placeholder: t("public.forms.inquiry.quickAddPlaceholder"),
      searching: t("public.forms.inquiry.quickAddSearching"),
      noMatches: t("public.forms.inquiry.quickAddNoMatches"),
      minCharsHint: t("public.forms.inquiry.quickAddMinCharsHint"),
      add: t("public.forms.inquiry.quickAddAdd"),
      added: t("public.forms.inquiry.quickAddAdded"),
      couldNotAddTitle: t("public.forms.inquiry.quickAddCouldNotAdd"),
    },
    inquiryCart: {
      remove: t("public.forms.inquiry.cartRemove"),
      removeAria: t("public.forms.inquiry.cartRemoveAria"),
      couldNotRemoveTitle: t("public.forms.inquiry.cartCouldNotRemove"),
      removedTitle: t("public.forms.inquiry.cartRemovedTitle"),
      removedMessage: t("public.forms.inquiry.cartRemovedMessage"),
    },
    inquiryForm: {
      sending: t("public.forms.inquiry.formSending"),
      submitInquiry: t("public.forms.inquiry.formSubmitInquiry"),
      whatsAppCompose: t("public.forms.inquiry.formWhatsAppCompose"),
      whatsAppTitleOn: t("public.forms.inquiry.formWhatsAppTitleOn"),
      whatsAppTitleOff: t("public.forms.inquiry.formWhatsAppTitleOff"),
      labelYourName: t("public.forms.inquiry.formLabelYourName"),
      labelEmail: t("public.forms.inquiry.formLabelEmail"),
      labelPhone: t("public.forms.inquiry.formLabelPhone"),
      labelCompany: t("public.forms.inquiry.formLabelCompany"),
      labelLookingFor: t("public.forms.inquiry.formLabelLookingFor"),
      placeholderLookingFor: t("public.forms.inquiry.formPlaceholderLookingFor"),
      eventTypeNone: t("public.forms.inquiry.formEventTypeNone"),
      labelEventType: t("public.forms.inquiry.formLabelEventType"),
      labelEventDate: t("public.forms.inquiry.formLabelEventDate"),
      labelEventLocation: t("public.forms.inquiry.formLabelEventLocation"),
      placeholderEventLocation: t("public.forms.inquiry.formPlaceholderEventLocation"),
      labelQuantity: t("public.forms.inquiry.formLabelQuantity"),
      placeholderQuantity: t("public.forms.inquiry.formPlaceholderQuantity"),
      labelBrief: t("public.forms.inquiry.formLabelBrief"),
      placeholderBrief: t("public.forms.inquiry.formPlaceholderBrief"),
      privacyNotice: t("public.forms.inquiry.formPrivacyNotice"),
      draftGenerate: t("public.forms.inquiry.formDraftGenerate"),
      draftPolish: t("public.forms.inquiry.formDraftPolish"),
      draftWorking: t("public.forms.inquiry.formDraftWorking"),
      draftError: t("public.forms.inquiry.formDraftError"),
      draftPolishNeedText: t("public.forms.inquiry.formDraftPolishNeedText"),
      draftHint: t("public.forms.inquiry.formDraftHint"),
    },
  };
}

export function formatShowAllFilters(t: T, count: number): string {
  return replaceCount(t("public.directory.ui.filters.showAll"), count);
}

export function formatResultsCount(copy: DirectoryUiCopy, total: number): string {
  return total === 1 ? copy.toolbar.resultsOne : copy.toolbar.resultsMany.replace("{count}", String(total));
}

export function formatProfilesInRequest(
  sheet: DirectoryUiCopy["inquirySheet"],
  count: number,
): string {
  return count === 1
    ? sheet.profilesInRequestOne
    : sheet.profilesInRequestMany.replace("{count}", String(count));
}

export function formatInquiryCartRemoveAria(
  cart: DirectoryUiCopy["inquiryCart"],
  displayName: string,
): string {
  return cart.removeAria.replace("{name}", displayName);
}

export function formatSrOnlyProfileCode(
  card: DirectoryUiCopy["card"],
  profileCode: string,
): string {
  return card.srOnlyProfileCode.replace("{code}", profileCode);
}

export function formatCardImageAlt(card: DirectoryUiCopy["card"], displayName: string): string {
  return card.imageAltTalentPhoto.replace("{name}", displayName);
}

export function formatPreviewImageAlt(preview: DirectoryUiCopy["preview"], displayName: string): string {
  return preview.imageAlt.replace("{name}", displayName);
}

export function formatPreviewDialogAria(preview: DirectoryUiCopy["preview"], displayName: string): string {
  return preview.dialogAria.replace("{name}", displayName);
}

export function formatShareNativeText(
  card: DirectoryUiCopy["card"],
  displayName: string,
  brand: string,
): string {
  return card.shareNativeText.replace("{name}", displayName).replace("{brand}", brand);
}

export function formatInquirySuccessFollowUp(
  success: DirectoryUiCopy["inquirySuccess"],
  email: string | null,
): string {
  return email
    ? success.followUpWithEmail.replace("{email}", email)
    : success.followUpNoEmail;
}

export function formatFilterSearchSummary(
  fc: DirectoryUiCopy["filters"],
  matchCount: number,
  groupCount: number,
): string {
  const matches =
    matchCount === 1
      ? fc.filterMatchesOne
      : fc.filterMatchesMany.replace("{count}", String(matchCount));
  const groups =
    groupCount === 1
      ? fc.filterGroupsOne
      : fc.filterGroupsMany.replace("{count}", String(groupCount));
  return fc.filterMatchesAcross.replace("{matches}", matches).replace("{groups}", groups);
}
