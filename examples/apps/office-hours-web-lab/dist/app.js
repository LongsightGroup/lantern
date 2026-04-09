(async function () {
  const gateway = globalThis.GatewayApp;

  if (!gateway) {
    throw new Error(
      "Lantern preview injects window.GatewayApp. Start this app with `deno task app:preview`.",
    );
  }

  const root = {
    shell: document.querySelector("#app-shell"),
    title: document.querySelector("[data-test='app-title']"),
    instructions: document.querySelector("#instructions"),
    scenario: document.querySelector("#scenario"),
    launchChip: document.querySelector("#launch-chip"),
    statusChip: document.querySelector("#status-chip"),
    htmlRequirements: document.querySelector("#html-requirements"),
    cssRequirements: document.querySelector("#css-requirements"),
    jsRequirements: document.querySelector("#js-requirements"),
    headingInput: document.querySelector("#heading-input"),
    altInput: document.querySelector("#alt-input"),
    themeSelect: document.querySelector("#theme-select"),
    spacingSelect: document.querySelector("#spacing-select"),
    buttonInput: document.querySelector("#button-input"),
    successInput: document.querySelector("#success-input"),
    saveButton: document.querySelector("#save-button"),
    completeButton: document.querySelector("#complete-button"),
    studentPreview: document.querySelector("#student-preview"),
    studentHeading: document.querySelector("[data-test='student-heading']"),
    studentImage: document.querySelector("[data-test='student-image']"),
    studentButton: document.querySelector("[data-test='student-preview-button']"),
    studentMessage: document.querySelector("[data-test='student-message']"),
    matchCount: document.querySelector("#match-count"),
    rehearsalCount: document.querySelector("#rehearsal-count"),
    saveState: document.querySelector("#save-state"),
    finalizeState: document.querySelector("#finalize-state"),
  };

  if (
    !root.shell || !root.title || !root.instructions || !root.scenario ||
    !root.launchChip || !root.statusChip || !root.htmlRequirements ||
    !root.cssRequirements || !root.jsRequirements || !root.headingInput ||
    !root.altInput || !root.themeSelect || !root.spacingSelect ||
    !root.buttonInput || !root.successInput || !root.saveButton ||
    !root.completeButton || !root.studentPreview || !root.studentHeading ||
    !root.studentImage || !root.studentButton || !root.studentMessage ||
    !root.matchCount || !root.rehearsalCount || !root.saveState ||
    !root.finalizeState
  ) {
    throw new Error("Office Hours Web Lab could not find its required DOM nodes.");
  }

  const [launchContext, content, localState] = await Promise.all([
    gateway.getLaunchContext(),
    gateway.getActivityContent(),
    gateway.readLocalState(),
  ]);
  const activity = normalizeActivity(content);
  const state = normalizeState(localState, activity);
  let dirty = false;

  root.title.textContent = activity.title;
  root.instructions.textContent = activity.instructions;
  root.scenario.textContent = activity.scenario;
  root.launchChip.textContent = launchContext.userRole + " in " +
    launchContext.courseId;
  root.statusChip.textContent = "Workbench ready";

  root.shell.dataset.targetHeading = activity.targets.heading;
  root.shell.dataset.targetAlt = activity.targets.image_alt;
  root.shell.dataset.targetTheme = activity.targets.theme;
  root.shell.dataset.targetSpacing = activity.targets.spacing;
  root.shell.dataset.targetButtonLabel = activity.targets.button_label;
  root.shell.dataset.targetSuccessMessage = activity.targets.success_message;

  renderChecklist(root.htmlRequirements, activity.html_requirements);
  renderChecklist(root.cssRequirements, activity.css_requirements);
  renderChecklist(root.jsRequirements, activity.js_requirements);
  renderOptions(root.themeSelect, activity.theme_options, state.theme);
  renderOptions(root.spacingSelect, activity.spacing_options, state.spacing);
  hydrateInputs();
  render();

  root.headingInput.addEventListener("input", handleFormChange);
  root.altInput.addEventListener("input", handleFormChange);
  root.themeSelect.addEventListener("change", handleFormChange);
  root.spacingSelect.addEventListener("change", handleFormChange);
  root.buttonInput.addEventListener("input", handleFormChange);
  root.successInput.addEventListener("input", handleFormChange);
  root.saveButton.addEventListener("click", handleSave);
  root.studentButton.addEventListener("click", handlePreviewAction);
  root.completeButton.addEventListener("click", handleComplete);

  function normalizeActivity(value) {
    const raw = value && typeof value === "object" ? value : {};

    return {
      title: readString(raw.title, "Office Hours Web Lab"),
      instructions: readString(
        raw.instructions,
        "Repair the office-hours sign-up page before you finalize.",
      ),
      scenario: readString(
        raw.scenario,
        "Repair the office-hours page before Lantern grades it.",
      ),
      targets: normalizeTargets(raw.targets),
      html_requirements: normalizeChecklist(raw.html_requirements),
      css_requirements: normalizeChecklist(raw.css_requirements),
      js_requirements: normalizeChecklist(raw.js_requirements),
      theme_options: normalizeOptions(raw.theme_options, [
        { id: "paper", label: "Paper" },
        { id: "harbor", label: "Harbor" },
      ]),
      spacing_options: normalizeOptions(raw.spacing_options, [
        { id: "compact", label: "Compact" },
        { id: "comfortable", label: "Comfortable" },
      ]),
    };
  }

  function normalizeTargets(value) {
    const raw = value && typeof value === "object" ? value : {};

    return {
      heading: readString(raw.heading, "Office Hours Sign-Up"),
      image_alt: readString(
        raw.image_alt,
        "Students reviewing notes before office hours.",
      ),
      theme: readString(raw.theme, "harbor"),
      spacing: readString(raw.spacing, "comfortable"),
      button_label: readString(raw.button_label, "Reserve My Seat"),
      success_message: readString(
        raw.success_message,
        "Your office hours request is ready to send.",
      ),
    };
  }

  function normalizeChecklist(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.map(function (item, index) {
      const raw = item && typeof item === "object" ? item : {};

      return {
        id: readString(raw.id, "item-" + index),
        label: readString(raw.label, "Checklist item " + (index + 1)),
      };
    });
  }

  function normalizeOptions(value, fallback) {
    if (!Array.isArray(value) || value.length === 0) {
      return fallback;
    }

    return value.map(function (item, index) {
      const raw = item && typeof item === "object" ? item : {};

      return {
        id: readString(raw.id, "option-" + index),
        label: readString(raw.label, "Option " + (index + 1)),
      };
    });
  }

  function normalizeState(value, activityContent) {
    const raw = value && typeof value === "object" ? value : {};

    return {
      headingText: readString(raw.headingText, "Office Hours Draft"),
      altText: readString(raw.altText, ""),
      theme: resolveOptionValue(
        raw.theme,
        activityContent.theme_options,
        "paper",
      ),
      spacing: resolveOptionValue(
        raw.spacing,
        activityContent.spacing_options,
        "compact",
      ),
      buttonText: readString(raw.buttonText, "Join Office Hours"),
      successMessage: readString(raw.successMessage, ""),
      rehearsalCount:
        typeof raw.rehearsalCount === "number" && raw.rehearsalCount >= 0
          ? raw.rehearsalCount
          : 0,
      messageVisible: raw.messageVisible === true,
      savedAt: typeof raw.savedAt === "string" && raw.savedAt.trim() !== ""
        ? raw.savedAt
        : null,
      finalized: readString(raw.finalized, "Not finished"),
    };
  }

  function resolveOptionValue(value, options, fallback) {
    const normalized = typeof value === "string" ? value.trim() : "";

    if (normalized !== "" && options.some(function (option) {
      return option.id === normalized;
    })) {
      return normalized;
    }

    return fallback;
  }

  function readString(value, fallback) {
    return typeof value === "string" && value.trim() !== ""
      ? value.trim()
      : fallback;
  }

  function renderChecklist(container, items) {
    container.textContent = "";

    for (const item of items) {
      const entry = document.createElement("li");
      entry.dataset.checkId = item.id;
      entry.textContent = item.label;
      container.appendChild(entry);
    }
  }

  function renderOptions(select, options, selectedValue) {
    select.textContent = "";

    for (const option of options) {
      const node = document.createElement("option");
      node.value = option.id;
      node.textContent = option.label;
      node.selected = option.id === selectedValue;
      select.appendChild(node);
    }
  }

  function hydrateInputs() {
    root.headingInput.value = state.headingText;
    root.altInput.value = state.altText;
    root.themeSelect.value = state.theme;
    root.spacingSelect.value = state.spacing;
    root.buttonInput.value = state.buttonText;
    root.successInput.value = state.successMessage;
  }

  function syncStateFromInputs() {
    state.headingText = root.headingInput.value.trim();
    state.altText = root.altInput.value.trim();
    state.theme = root.themeSelect.value;
    state.spacing = root.spacingSelect.value;
    state.buttonText = root.buttonInput.value.trim();
    state.successMessage = root.successInput.value.trim();
  }

  function handleFormChange() {
    syncStateFromInputs();
    dirty = true;
    root.statusChip.textContent = "Unsaved edits";
    render();
  }

  async function handleSave() {
    syncStateFromInputs();
    root.statusChip.textContent = "Saving workbench...";
    state.savedAt = new Date().toISOString();
    await gateway.emitAttemptEvent({
      type: "progress",
      checkpoint: "workbench-saved",
      matchedTargets: countMatchedTargets(),
      timestamp: state.savedAt,
    });
    await gateway.writeLocalState(serializeState());
    dirty = false;
    root.statusChip.textContent = "Workbench saved";
    render();
  }

  function handlePreviewAction() {
    syncStateFromInputs();
    state.rehearsalCount += 1;
    state.messageVisible = true;
    dirty = true;
    root.statusChip.textContent = "Preview message shown";
    render();
  }

  async function handleComplete() {
    syncStateFromInputs();
    state.savedAt = new Date().toISOString();
    root.statusChip.textContent = "Finalizing lab...";
    await gateway.emitAttemptEvent({
      type: "complete",
      matchedTargets: countMatchedTargets(),
      timestamp: state.savedAt,
    });
    const browserGraderResult = await gateway.runBrowserGrader();

    if (launchContext.submissionMode === "anonymous_submission") {
      const evidenceResult = await gateway.submitEvidenceArtifact({
        kind: "structured_json",
        contentType: "application/json",
        fileName: "office-hours-submission.json",
        bodyBase64: encodeJsonBase64({
          submissionMode: launchContext.submissionMode,
          completionState: "completed",
          submittedWork: serializeState(),
          browserGraderResult,
        }),
      });

      if (!evidenceResult.accepted) {
        root.statusChip.textContent = evidenceResult.denial.message;
        return;
      }
    }

    const result = await gateway.finalizeAttempt({
      completionState: "completed",
      browserGraderResult,
    });

    if (!result.accepted) {
      root.statusChip.textContent = result.denial.message;
      return;
    }

    state.finalized = result.completionState || "completed";
    dirty = false;
    await gateway.writeLocalState(serializeState());
    root.statusChip.textContent = "Lab finalized";
    render();
  }

  function serializeState() {
    return {
      headingText: state.headingText,
      altText: state.altText,
      theme: state.theme,
      spacing: state.spacing,
      buttonText: state.buttonText,
      successMessage: state.successMessage,
      rehearsalCount: state.rehearsalCount,
      messageVisible: state.messageVisible,
      savedAt: state.savedAt,
      finalized: state.finalized,
    };
  }

  function countMatchedTargets() {
    let matches = 0;

    if (state.headingText === activity.targets.heading) {
      matches += 1;
    }
    if (state.altText === activity.targets.image_alt) {
      matches += 1;
    }
    if (state.theme === activity.targets.theme) {
      matches += 1;
    }
    if (state.spacing === activity.targets.spacing) {
      matches += 1;
    }
    if (state.buttonText === activity.targets.button_label) {
      matches += 1;
    }
    if (state.successMessage === activity.targets.success_message) {
      matches += 1;
    }

    return matches;
  }

  function render() {
    root.studentPreview.dataset.theme = state.theme;
    root.studentPreview.dataset.spacing = state.spacing;
    root.studentHeading.textContent = state.headingText || "Add the page heading";
    root.studentImage.alt = state.altText;
    root.studentButton.textContent = state.buttonText || "Add button label";
    root.matchCount.textContent = String(countMatchedTargets());
    root.rehearsalCount.textContent = String(state.rehearsalCount);
    root.finalizeState.textContent = state.finalized;
    root.saveState.textContent = dirty
      ? "Unsaved changes"
      : state.savedAt
      ? "Saved " + formatSavedAt(state.savedAt)
      : "Not saved yet";

    if (state.messageVisible) {
      root.studentMessage.hidden = false;
      root.studentMessage.textContent = state.successMessage || "Add a confirmation message.";
    } else {
      root.studentMessage.hidden = true;
      root.studentMessage.textContent = "";
    }
  }

  function formatSavedAt(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString();
  }

  function encodeJsonBase64(value) {
    return btoa(JSON.stringify(value));
  }
})();
