(async function () {
  const gateway = globalThis.GatewayApp;

  if (!gateway) {
    throw new Error(
      "Lantern preview injects window.GatewayApp. Start this app with `deno task app:preview`.",
    );
  }

  const root = {
    title: document.querySelector("[data-test='app-title']"),
    instructions: document.querySelector("#instructions"),
    scenario: document.querySelector("#scenario"),
    launchChip: document.querySelector("#launch-chip"),
    statusChip: document.querySelector("#status-chip"),
    htmlChecks: document.querySelector("#html-checks"),
    cssChecks: document.querySelector("#css-checks"),
    jsChecks: document.querySelector("#js-checks"),
    reviewedCount: document.querySelector("#reviewed-count"),
    finalizeState: document.querySelector("#finalize-state"),
    reviewButton: document.querySelector("#review-button"),
    completeButton: document.querySelector("#complete-button"),
  };

  if (
    !root.title || !root.instructions || !root.scenario || !root.launchChip ||
    !root.statusChip || !root.htmlChecks || !root.cssChecks || !root.jsChecks ||
    !root.reviewedCount || !root.finalizeState || !root.reviewButton ||
    !root.completeButton
  ) {
    throw new Error("Web Checkup could not find its required DOM nodes.");
  }

  const [launchContext, content, localState] = await Promise.all([
    gateway.getLaunchContext(),
    gateway.getActivityContent(),
    gateway.readLocalState(),
  ]);
  const activity = normalizeActivity(content);
  const totalSections = [
    activity.html_checks,
    activity.css_checks,
    activity.js_checks,
  ].filter(function (checks) {
    return checks.length > 0;
  }).length;
  const state = normalizeState(localState);

  root.title.textContent = activity.title;
  root.instructions.textContent = activity.instructions;
  root.scenario.textContent = activity.scenario;
  root.launchChip.textContent = launchContext.userRole + " in " +
    launchContext.courseId;
  root.statusChip.textContent = "Checklist ready";

  renderChecklist(root.htmlChecks, activity.html_checks);
  renderChecklist(root.cssChecks, activity.css_checks);
  renderChecklist(root.jsChecks, activity.js_checks);
  render();

  root.reviewButton.addEventListener("click", handleReviewMark);
  root.completeButton.addEventListener("click", handleComplete);

  function normalizeActivity(value) {
    const raw = value && typeof value === "object" ? value : {};

    return {
      title: typeof raw.title === "string" && raw.title.trim() !== ""
        ? raw.title.trim()
        : "Web Checkup",
      instructions:
        typeof raw.instructions === "string" && raw.instructions.trim() !== ""
          ? raw.instructions.trim()
          : "Review the revised page checklist.",
      scenario: typeof raw.scenario === "string" && raw.scenario.trim() !== ""
        ? raw.scenario.trim()
        : "Inspect the page revision before final submission.",
      html_checks: normalizeChecks(raw.html_checks),
      css_checks: normalizeChecks(raw.css_checks),
      js_checks: normalizeChecks(raw.js_checks),
    };
  }

  function normalizeChecks(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.map(function (item, index) {
      const raw = item && typeof item === "object" ? item : {};

      return {
        id: typeof raw.id === "string" && raw.id.trim() !== ""
          ? raw.id.trim()
          : "check-" + index,
        label: typeof raw.label === "string" && raw.label.trim() !== ""
          ? raw.label.trim()
          : "Review item " + (index + 1),
      };
    });
  }

  function normalizeState(value) {
    const raw = value && typeof value === "object" ? value : {};

    return {
      sectionsReviewed:
        typeof raw.sectionsReviewed === "number" && raw.sectionsReviewed >= 0
          ? Math.min(raw.sectionsReviewed, totalSections)
          : 0,
      finalized: typeof raw.finalized === "string"
        ? raw.finalized
        : "Not finished",
    };
  }

  function renderChecklist(container, items) {
    container.textContent = "";

    for (const item of items) {
      const entry = document.createElement("li");
      entry.textContent = item.label;
      entry.dataset.checkId = item.id;
      container.appendChild(entry);
    }
  }

  async function handleReviewMark() {
    state.sectionsReviewed = Math.min(
      state.sectionsReviewed + 1,
      totalSections,
    );
    root.statusChip.textContent = "Saving progress...";
    await gateway.emitAttemptEvent({
      type: "progress",
      checkpoint: "section-reviewed",
      value: state.sectionsReviewed,
      timestamp: new Date().toISOString(),
    });
    await gateway.writeLocalState({
      sectionsReviewed: state.sectionsReviewed,
      finalized: state.finalized,
    });
    root.statusChip.textContent = "Progress saved";
    render();
  }

  async function handleComplete() {
    root.statusChip.textContent = "Finalizing review...";
    await gateway.emitAttemptEvent({
      type: "complete",
      timestamp: new Date().toISOString(),
    });
    const browserGraderResult = await gateway.runBrowserGrader();

    if (launchContext.submissionMode === "anonymous_submission") {
      const evidenceResult = await gateway.submitEvidenceArtifact({
        kind: "structured_json",
        contentType: "application/json",
        fileName: "submission.json",
        bodyBase64: encodeJsonBase64({
          submissionMode: launchContext.submissionMode,
          completionState: "completed",
          localState: {
            sectionsReviewed: state.sectionsReviewed,
            finalized: "completed",
          },
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
    await gateway.writeLocalState({
      sectionsReviewed: state.sectionsReviewed,
      finalized: state.finalized,
    });
    root.statusChip.textContent = "Review finalized";
    render();
  }

  function render() {
    root.reviewedCount.textContent = String(state.sectionsReviewed);
    root.finalizeState.textContent = state.finalized;
  }

  function encodeJsonBase64(value) {
    return btoa(JSON.stringify(value));
  }
})();
