(async function () {
  const gateway = await waitForGatewayApp();

  const root = {
    shell: document.querySelector("#app-shell"),
    title: document.querySelector("[data-test='app-title']"),
    instructions: document.querySelector("#instructions"),
    scenario: document.querySelector("#scenario"),
    reviewedNote: document.querySelector("#reviewed-note"),
    launchChip: document.querySelector("#launch-chip"),
    contextChip: document.querySelector("#context-chip"),
    statusChip: document.querySelector("#status-chip"),
    progressCount: document.querySelector("#progress-count"),
    currentLabel: document.querySelector("#current-label"),
    saveState: document.querySelector("#save-state"),
    finalizeState: document.querySelector("#finalize-state"),
    progressMeterFill: document.querySelector("#progress-meter-fill"),
    stepList: document.querySelector("#step-list"),
    stepNumber: document.querySelector("#step-number"),
    currentStepTitle: document.querySelector("#current-step-title"),
    stepPrompt: document.querySelector("#step-prompt"),
    conceptChip: document.querySelector("#concept-chip"),
    difficultyChip: document.querySelector("#difficulty-chip"),
    stepGoal: document.querySelector("#step-goal"),
    stepHint: document.querySelector("#step-hint"),
    stepWhy: document.querySelector("#step-why"),
    editorMode: document.querySelector("#editor-mode"),
    stepEditor: document.querySelector("#step-editor"),
    feedbackBox: document.querySelector("#feedback-box"),
    feedbackMessage: document.querySelector("#feedback-message"),
    checkButton: document.querySelector("#check-button"),
    continueButton: document.querySelector("#continue-button"),
    saveButton: document.querySelector("#save-button"),
    resetButton: document.querySelector("#reset-button"),
    completeButton: document.querySelector("#complete-button"),
  };

  if (
    !root.shell || !root.title || !root.instructions || !root.scenario ||
    !root.reviewedNote || !root.launchChip || !root.contextChip ||
    !root.statusChip || !root.progressCount || !root.currentLabel ||
    !root.saveState || !root.finalizeState || !root.progressMeterFill ||
    !root.stepList || !root.stepNumber || !root.currentStepTitle ||
    !root.stepPrompt || !root.conceptChip || !root.difficultyChip ||
    !root.stepGoal || !root.stepHint || !root.stepWhy || !root.editorMode ||
    !root.stepEditor ||
    !root.feedbackBox || !root.feedbackMessage || !root.checkButton ||
    !root.continueButton || !root.saveButton || !root.resetButton ||
    !root.completeButton
  ) {
    throw new Error(
      "TypeScript Ladder Game could not find its required DOM nodes.",
    );
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
  root.reviewedNote.textContent = activity.reviewedNote;
  root.launchChip.textContent = launchContext.userRole + " in " +
    launchContext.courseId;
  root.contextChip.textContent = launchContext.assignmentId
    ? "Assignment " + launchContext.assignmentId
    : "Course-level launch";

  root.stepEditor.addEventListener("input", handleEditorInput);
  root.stepList.addEventListener("click", handleStepListClick);
  root.checkButton.addEventListener("click", handleCheckStep);
  root.continueButton.addEventListener("click", handleContinue);
  root.saveButton.addEventListener("click", handleSaveDraft);
  root.resetButton.addEventListener("click", handleResetStep);
  root.completeButton.addEventListener("click", handleComplete);

  render();

  function normalizeActivity(value) {
    const raw = value && typeof value === "object" ? value : null;

    if (!raw) {
      throw new Error(
        "TypeScript Ladder Game requires reviewed activity content.",
      );
    }

    const steps = Array.isArray(raw.steps) ? raw.steps.map(normalizeStep) : [];

    if (steps.length !== 10) {
      throw new Error(
        "TypeScript Ladder Game requires exactly 10 reviewed TypeScript steps.",
      );
    }

    return {
      title: readRequiredString(raw.title, "Activity title is required."),
      instructions: readRequiredString(
        raw.instructions,
        "Activity instructions are required.",
      ),
      scenario: readRequiredString(
        raw.scenario,
        "Activity scenario is required.",
      ),
      reviewedNote: readRequiredString(
        raw.reviewed_note,
        "Reviewed note is required.",
      ),
      completionNote: readRequiredString(
        raw.completion_note,
        "Completion note is required.",
      ),
      steps,
    };
  }

  function normalizeStep(value, index) {
    const raw = value && typeof value === "object" ? value : null;

    if (!raw) {
      throw new Error("Each reviewed step must be an object.");
    }

    return {
      id: readRequiredString(raw.id, "Each step requires an id."),
      title: readRequiredString(raw.title, "Each step requires a title."),
      concept: readRequiredString(raw.concept, "Each step requires a concept."),
      difficulty: readRequiredString(
        raw.difficulty,
        "Each step requires a difficulty label.",
      ),
      prompt: readRequiredString(raw.prompt, "Each step requires a prompt."),
      goal: readRequiredString(raw.goal, "Each step requires a goal."),
      hint: readRequiredString(raw.hint, "Each step requires a hint."),
      whyItMatters: readRequiredString(
        raw.why_it_matters,
        "Each step requires why_it_matters.",
      ),
      successNote: readRequiredString(
        raw.success_note,
        "Each step requires success_note.",
      ),
      starterCode: readRequiredString(
        raw.starter_code,
        "Each step requires starter_code.",
      ),
      solutionCode: readRequiredString(
        raw.solution_code,
        "Each step requires solution_code.",
      ),
      stepNumber: index + 1,
    };
  }

  function normalizeState(value, activityContent) {
    const raw = value && typeof value === "object" ? value : {};
    const rawStepCodes = raw.stepCodes && typeof raw.stepCodes === "object"
      ? raw.stepCodes
      : {};
    const completedCount = normalizeCompletedCount(
      raw.completedCount,
      activityContent.steps.length,
    );
    const savedCurrentIndex = normalizeCurrentStepIndex(
      raw.currentStepIndex,
      activityContent.steps.length,
    );
    const currentStepIndex = completedCount >= activityContent.steps.length
      ? activityContent.steps.length - 1
      : Math.min(savedCurrentIndex, completedCount);
    const stepCodes = {};

    for (const step of activityContent.steps) {
      const savedCode = readOptionalString(rawStepCodes[step.id]);
      stepCodes[step.id] = savedCode ?? step.starterCode;
    }

    for (let index = 0; index < completedCount; index += 1) {
      const solvedStep = activityContent.steps[index];
      stepCodes[solvedStep.id] = solvedStep.solutionCode;
    }

    return {
      completedCount,
      currentStepIndex,
      stepCodes,
      feedbackTone: readFeedbackTone(raw.feedbackTone),
      feedbackMessage: readOptionalString(raw.feedbackMessage) ??
        buildIntroFeedback(activityContent.steps[0]),
      savedAt: readOptionalString(raw.savedAt),
      finalized: readOptionalString(raw.finalized) ?? "Not finished",
    };
  }

  function normalizeCompletedCount(value, totalSteps) {
    return typeof value === "number" && Number.isInteger(value) &&
        value >= 0 && value <= totalSteps
      ? value
      : 0;
  }

  function normalizeCurrentStepIndex(value, totalSteps) {
    return typeof value === "number" && Number.isInteger(value) &&
        value >= 0 && value < totalSteps
      ? value
      : 0;
  }

  function readRequiredString(value, message) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(message);
    }

    return value;
  }

  function readOptionalString(value) {
    return typeof value === "string" && value.trim() !== "" ? value : null;
  }

  function readFeedbackTone(value) {
    switch (value) {
      case "success":
      case "error":
      case "idle":
        return value;
      default:
        return "idle";
    }
  }

  function getSelectedStep() {
    return activity.steps[state.currentStepIndex];
  }

  function stepIsSolved(index) {
    return index < state.completedCount;
  }

  function stepIsLocked(index) {
    return index > state.completedCount;
  }

  function selectedStepIsEditable() {
    return state.currentStepIndex === state.completedCount &&
      state.completedCount < activity.steps.length;
  }

  function handleEditorInput() {
    const step = getSelectedStep();

    if (!selectedStepIsEditable()) {
      return;
    }

    state.stepCodes[step.id] = root.stepEditor.value;
    dirty = true;
    state.feedbackTone = "idle";
    state.feedbackMessage = "Draft updated. " + step.goal;
    render();
  }

  function handleStepListClick(event) {
    const target = event.target instanceof Element
      ? event.target.closest("[data-step-index]")
      : null;

    if (!target) {
      return;
    }

    const index = Number(target.getAttribute("data-step-index"));

    if (
      !Number.isInteger(index) || index < 0 || index >= activity.steps.length
    ) {
      return;
    }

    if (stepIsLocked(index)) {
      return;
    }

    state.currentStepIndex = index;
    setFeedbackForSelectedStep(index);
    render();
  }

  async function handleCheckStep() {
    if (!selectedStepIsEditable()) {
      return;
    }

    const step = getSelectedStep();
    const draft = state.stepCodes[step.id];
    const solved = codeMatches(step.solutionCode, draft);

    await gateway.emitAttemptEvent({
      type: "progress",
      checkpoint: step.id + ":checked",
      value: state.completedCount,
      timestamp: new Date().toISOString(),
    });

    if (!solved) {
      state.feedbackTone = "error";
      state.feedbackMessage = buildFailureFeedback(step, draft);
      render();
      return;
    }

    state.stepCodes[step.id] = step.solutionCode;
    state.completedCount += 1;
    state.savedAt = new Date().toISOString();
    dirty = false;

    await gateway.emitAttemptEvent({
      type: "progress",
      checkpoint: step.id + ":solved",
      value: state.completedCount,
      timestamp: state.savedAt,
    });
    await gateway.writeLocalState(serializeState());

    if (state.completedCount >= activity.steps.length) {
      state.currentStepIndex = activity.steps.length - 1;
      state.feedbackTone = "success";
      state.feedbackMessage = step.successNote +
        " All ten reviewed examples are solved. Finish the ladder when you are ready.";
    } else {
      state.currentStepIndex = state.completedCount;
      state.feedbackTone = "success";
      state.feedbackMessage = step.successNote + " Step " +
        (state.completedCount + 1) + " is now unlocked.";
    }

    render();
  }

  function handleContinue() {
    if (
      state.currentStepIndex < state.completedCount &&
      state.currentStepIndex + 1 < activity.steps.length
    ) {
      state.currentStepIndex += 1;
      setFeedbackForSelectedStep(state.currentStepIndex);
      render();
    }
  }

  async function handleSaveDraft() {
    if (!selectedStepIsEditable()) {
      return;
    }

    state.savedAt = new Date().toISOString();
    dirty = false;
    await gateway.emitAttemptEvent({
      type: "progress",
      checkpoint: getSelectedStep().id + ":saved",
      value: state.completedCount,
      timestamp: state.savedAt,
    });
    await gateway.writeLocalState(serializeState());
    state.feedbackTone = "idle";
    state.feedbackMessage = "Draft saved. " + step.goal;
    render();
  }

  function handleResetStep() {
    if (!selectedStepIsEditable()) {
      return;
    }

    const step = getSelectedStep();
    state.stepCodes[step.id] = step.starterCode;
    dirty = false;
    state.feedbackTone = "idle";
    state.feedbackMessage = "Starter restored. " + step.goal;
    render();
  }

  async function handleComplete() {
    if (state.completedCount !== activity.steps.length) {
      state.feedbackTone = "error";
      state.feedbackMessage = activity.completionNote;
      render();
      return;
    }

    state.feedbackTone = "idle";
    state.feedbackMessage = "Running the reviewed browser grader...";
    render();

    const browserGraderResult = await gateway.runBrowserGrader();
    const submittedAt = new Date().toISOString();

    if (launchContext.submissionMode === "anonymous_submission") {
      const evidenceResult = await gateway.submitEvidenceArtifact({
        kind: "structured_json",
        contentType: "application/json",
        fileName: "typescript-ladder-submission.json",
        bodyBase64: encodeJsonBase64({
          submissionMode: launchContext.submissionMode,
          completionState: "completed",
          submittedAt,
          submittedWork: serializeState(),
          browserGraderResult,
        }),
      });

      if (!evidenceResult.accepted) {
        state.feedbackTone = "error";
        state.feedbackMessage = evidenceResult.denial.message;
        render();
        return;
      }
    }

    const result = await gateway.finalizeAttempt({
      completionState: "completed",
      browserGraderResult,
    });

    if (!result.accepted) {
      state.feedbackTone = "error";
      state.feedbackMessage = result.denial.message;
      render();
      return;
    }

    state.finalized = result.completionState || "completed";
    state.savedAt = submittedAt;
    dirty = false;
    await gateway.emitAttemptEvent({
      type: "complete",
      timestamp: submittedAt,
    });
    await gateway.writeLocalState(serializeState());
    state.feedbackTone = "success";
    state.feedbackMessage = "Ladder finalized. Lantern recorded " +
      result.scoreGiven + " / " + result.scoreMaximum + ".";
    render();
  }

  function serializeState() {
    return {
      completedCount: state.completedCount,
      currentStepIndex: state.currentStepIndex,
      stepCodes: { ...state.stepCodes },
      feedbackTone: state.feedbackTone,
      feedbackMessage: state.feedbackMessage,
      savedAt: state.savedAt,
      finalized: state.finalized,
    };
  }

  function codeMatches(solutionCode, draftCode) {
    return normalizeCode(solutionCode) === normalizeCode(draftCode);
  }

  function buildIntroFeedback(step) {
    return "Start with: " + step.goal + " Hint: " + step.hint;
  }

  function buildFailureFeedback(step, draft) {
    if (normalizeCode(step.starterCode) === normalizeCode(draft)) {
      return "No change yet. Start with: " + step.goal + " Hint: " + step.hint;
    }

    return "Closer, but this step still does not match the reviewed fix. Hint: " +
      step.hint + " Why it matters: " + step.whyItMatters;
  }

  function setFeedbackForSelectedStep(index) {
    const step = activity.steps[index];

    if (stepIsSolved(index)) {
      state.feedbackTone = "success";
      state.feedbackMessage = step.successNote;
      return;
    }

    state.feedbackTone = "idle";
    state.feedbackMessage = buildIntroFeedback(step);
  }

  function normalizeCode(value) {
    return String(value)
      .replace(/\r\n/g, "\n")
      .replace(/"/g, "'")
      .replace(/\s+/g, "")
      .trim();
  }

  function render() {
    const selectedStep = getSelectedStep();
    const solvedCount = state.completedCount;
    const totalSteps = activity.steps.length;
    const allSolved = solvedCount === totalSteps;
    const editable = selectedStepIsEditable();
    const progressPercent = Math.round((solvedCount / totalSteps) * 100);

    root.shell.dataset.completedCount = String(solvedCount);
    root.shell.dataset.totalSteps = String(totalSteps);
    root.shell.dataset.allSolved = allSolved ? "true" : "false";
    root.progressCount.textContent = solvedCount + " / " + totalSteps;
    root.currentLabel.textContent = allSolved
      ? "All steps solved"
      : "Step " + (state.currentStepIndex + 1);
    root.finalizeState.textContent = state.finalized;
    root.progressMeterFill.style.width = progressPercent + "%";
    root.saveState.textContent = dirty
      ? "Unsaved changes"
      : state.savedAt
      ? "Saved " + formatSavedAt(state.savedAt)
      : "Not saved yet";
    root.statusChip.textContent = describeStatus(allSolved, editable);

    root.stepNumber.textContent = "Step " + selectedStep.stepNumber;
    root.currentStepTitle.textContent = selectedStep.title;
    root.stepPrompt.textContent = selectedStep.prompt;
    root.conceptChip.textContent = selectedStep.concept;
    root.difficultyChip.textContent = selectedStep.difficulty;
    root.stepGoal.textContent = selectedStep.goal;
    root.stepHint.textContent = selectedStep.hint;
    root.stepWhy.textContent = selectedStep.whyItMatters;
    root.editorMode.textContent = editable
      ? "Editable current step"
      : stepIsSolved(state.currentStepIndex)
      ? "Solved step locked in"
      : "Locked";
    root.stepEditor.readOnly = !editable;
    root.stepEditor.value = state.stepCodes[selectedStep.id];
    root.feedbackBox.dataset.tone = state.feedbackTone;
    root.feedbackMessage.textContent = state.feedbackMessage;

    root.checkButton.disabled = !editable;
    root.resetButton.disabled = !editable;
    root.saveButton.disabled = !editable;
    root.continueButton.disabled = !(
      stepIsSolved(state.currentStepIndex) &&
      state.currentStepIndex + 1 < activity.steps.length
    );
    root.completeButton.disabled = !allSolved ||
      state.finalized === "completed";

    renderStepCards();
  }

  function renderStepCards() {
    root.stepList.textContent = "";

    activity.steps.forEach(function (step, index) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      const solved = stepIsSolved(index);
      const locked = stepIsLocked(index);
      const active = index === state.currentStepIndex;
      const statusLabel = solved ? "Solved" : locked ? "Locked" : "Current";

      button.type = "button";
      button.className = "step-card";
      button.dataset.stepIndex = String(index);
      button.dataset.stepCard = step.id;
      button.dataset.solved = solved ? "true" : "false";
      button.dataset.locked = locked ? "true" : "false";
      button.dataset.active = active ? "true" : "false";
      button.disabled = locked;
      button.innerHTML = '<div class="step-card-top">' +
        '<span class="step-number">' + step.stepNumber + "</span>" +
        '<span class="step-card-status">' + statusLabel + "</span>" +
        "</div>" +
        "<strong>" + escapeHtml(step.title) + "</strong>" +
        "<p>" + escapeHtml(step.concept) + "</p>";
      item.appendChild(button);
      root.stepList.appendChild(item);
    });
  }

  function describeStatus(allSolved, editable) {
    if (state.finalized === "completed") {
      return "Ladder finalized";
    }

    if (allSolved) {
      return "Ready to finalize";
    }

    if (editable) {
      return "Working on step " + (state.currentStepIndex + 1);
    }

    return "Reviewing solved step " + (state.currentStepIndex + 1);
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

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  async function waitForGatewayApp() {
    const deadline = Date.now() + 3000;

    while (Date.now() < deadline) {
      if (globalThis.GatewayApp) {
        return globalThis.GatewayApp;
      }

      await new Promise(function (resolve) {
        setTimeout(resolve, 16);
      });
    }

    throw new Error(
      "Lantern preview injects window.GatewayApp. Start this app with `deno task app:preview`.",
    );
  }
})();
