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
    launchChip: document.querySelector("#launch-chip"),
    statusChip: document.querySelector("#status-chip"),
    prompt: document.querySelector("#prompt"),
    progressCount: document.querySelector("#progress-count"),
    finalizeState: document.querySelector("#finalize-state"),
    progressButton: document.querySelector("#progress-button"),
    completeButton: document.querySelector("#complete-button"),
  };

  if (
    !root.title || !root.instructions || !root.launchChip || !root.statusChip ||
    !root.prompt || !root.progressCount || !root.finalizeState ||
    !root.progressButton || !root.completeButton
  ) {
    throw new Error(
      "Simple Activity Starter could not find its required DOM nodes.",
    );
  }

  const [launchContext, content, localState] = await Promise.all([
    gateway.getLaunchContext(),
    gateway.getActivityContent(),
    gateway.readLocalState(),
  ]);
  const activity = normalizeActivity(content);
  const state = normalizeState(localState);

  root.title.textContent = activity.title;
  root.instructions.textContent = activity.instructions;
  root.prompt.textContent = activity.prompt;
  root.launchChip.textContent = launchContext.userRole + " in " +
    launchContext.courseId;
  root.statusChip.textContent = "Lantern runtime ready";

  root.progressButton.addEventListener("click", handleProgress);
  root.completeButton.addEventListener("click", handleComplete);
  render();

  function normalizeActivity(value) {
    const raw = value && typeof value === "object" ? value : {};

    return {
      title: typeof raw.title === "string" && raw.title.trim() !== ""
        ? raw.title.trim()
        : "Simple Activity Starter",
      instructions:
        typeof raw.instructions === "string" && raw.instructions.trim() !== ""
          ? raw.instructions.trim()
          : "Edit content/activity.json first and keep the activity small.",
      prompt: typeof raw.prompt === "string" && raw.prompt.trim() !== ""
        ? raw.prompt.trim()
        : "Replace this prompt with your lesson content.",
    };
  }

  function normalizeState(value) {
    const raw = value && typeof value === "object" ? value : {};

    return {
      progressCount:
        typeof raw.progressCount === "number" && raw.progressCount >= 0
          ? raw.progressCount
          : 0,
      finalized: typeof raw.finalized === "string"
        ? raw.finalized
        : "Not finished",
    };
  }

  async function handleProgress() {
    state.progressCount += 1;
    root.statusChip.textContent = "Recording progress...";
    await gateway.emitAttemptEvent({
      type: "progress",
      checkpoint: "simple-activity-step",
      value: state.progressCount,
      timestamp: new Date().toISOString(),
    });
    await gateway.writeLocalState({
      progressCount: state.progressCount,
      finalized: state.finalized,
    });
    root.statusChip.textContent = "Progress saved";
    render();
  }

  async function handleComplete() {
    root.statusChip.textContent = "Finalizing...";
    await gateway.emitAttemptEvent({
      type: "complete",
      timestamp: new Date().toISOString(),
    });
    const result = await gateway.finalizeAttempt({
      completionState: "completed",
    });

    if (!result.accepted) {
      root.statusChip.textContent = result.denial.message;
      return;
    }

    state.finalized = result.completionState || "completed";
    await gateway.writeLocalState({
      progressCount: state.progressCount,
      finalized: state.finalized,
    });
    root.statusChip.textContent = "Attempt finalized";
    render();
  }

  function render() {
    root.progressCount.textContent = String(state.progressCount);
    root.finalizeState.textContent = state.finalized;
  }
})();
