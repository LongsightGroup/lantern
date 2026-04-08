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
    hint: document.querySelector("#hint"),
    answerCount: document.querySelector("#answer-count"),
    finalizeState: document.querySelector("#finalize-state"),
    answerButton: document.querySelector("#answer-button"),
    completeButton: document.querySelector("#complete-button"),
  };

  if (
    !root.title || !root.instructions || !root.launchChip || !root.statusChip ||
    !root.prompt || !root.hint || !root.answerCount || !root.finalizeState ||
    !root.answerButton || !root.completeButton
  ) {
    throw new Error("Template app could not find its required DOM nodes.");
  }

  const [launchContext, content, localState] = await Promise.all([
    gateway.getLaunchContext(),
    gateway.getActivityContent(),
    gateway.readLocalState(),
  ]);
  const question = normalizeQuestion(content);
  const state = normalizeState(localState);

  root.title.textContent = question.title;
  root.instructions.textContent = question.instructions;
  root.prompt.textContent = question.prompt;
  root.hint.textContent = question.hint;
  root.launchChip.textContent = launchContext.userRole + " in " +
    launchContext.courseId;
  root.statusChip.textContent = "Lantern runtime ready";

  render();
  root.answerButton.addEventListener("click", handleAnswer);
  root.completeButton.addEventListener("click", handleComplete);

  function normalizeQuestion(value) {
    const raw = value && typeof value === "object" ? value : {};

    return {
      title: typeof raw.title === "string" && raw.title.trim() !== ""
        ? raw.title.trim()
        : "Template App",
      instructions:
        typeof raw.instructions === "string" && raw.instructions.trim() !== ""
          ? raw.instructions.trim()
          : "Add one activity prompt in content/activity.json.",
      prompt: typeof raw.prompt === "string" && raw.prompt.trim() !== ""
        ? raw.prompt.trim()
        : "Replace this prompt with your lesson content.",
      hint: typeof raw.hint === "string" && raw.hint.trim() !== ""
        ? raw.hint.trim()
        : "Use this app as the starting point for a Lantern activity.",
    };
  }

  function normalizeState(value) {
    const raw = value && typeof value === "object" ? value : {};

    return {
      answers: typeof raw.answers === "number" && raw.answers >= 0
        ? raw.answers
        : 0,
      finalized: typeof raw.finalized === "string"
        ? raw.finalized
        : "Not finished",
    };
  }

  async function handleAnswer() {
    state.answers += 1;
    root.statusChip.textContent = "Recording answer...";
    await gateway.emitAttemptEvent({
      type: "answer",
      questionId: "template-question",
      answer: "answered",
      timestamp: new Date().toISOString(),
    });
    await gateway.writeLocalState({
      answers: state.answers,
      finalized: state.finalized,
    });
    root.statusChip.textContent = "Answer recorded";
    render();
  }

  async function handleComplete() {
    root.statusChip.textContent = "Finalizing...";
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
            answers: state.answers,
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
      answers: state.answers,
      finalized: state.finalized,
    });
    root.statusChip.textContent = "Attempt finalized";
    render();
  }

  function render() {
    root.answerCount.textContent = String(state.answers);
    root.finalizeState.textContent = state.finalized;
  }

  function encodeJsonBase64(value) {
    return btoa(JSON.stringify(value));
  }
})();
