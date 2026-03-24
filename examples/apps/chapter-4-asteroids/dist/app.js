(async function () {
  const fallbackContent = {
    title: "Chapter 4 Asteroids",
    instructions:
      "Shoot the correct vocabulary target. Wrong targets cost points.",
    questions: [
      {
        id: "q1",
        prompt: "Select the correct meaning of inertia.",
        correct: "resistance to a change in motion",
        choices: [
          "stored heat in an object",
          "resistance to a change in motion",
          "the speed of a falling object",
        ],
      },
    ],
  };

  const gateway = globalThis.GatewayApp;
  const content = gateway && gateway.getActivityContent
    ? await gateway.getActivityContent().catch(function () {
      return fallbackContent;
    })
    : fallbackContent;

  const question = content.questions[0];
  document.querySelector("#instructions").textContent = content.instructions;
  document.querySelector("#prompt").textContent = question.prompt;

  const choices = document.querySelector("#choices");
  const status = document.querySelector("#status");

  question.choices.forEach(function (choice) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = choice;
    button.addEventListener("click", async function () {
      const correct = choice === question.correct;
      status.textContent = correct
        ? "Correct answer recorded"
        : "Incorrect answer recorded";

      if (gateway && gateway.emitAttemptEvent) {
        await gateway.emitAttemptEvent({
          type: "answer",
          questionId: question.id,
          answer: choice,
          timestamp: new Date().toISOString(),
        });
      }
    });
    choices.append(button);
  });

  document.querySelector("#complete").addEventListener(
    "click",
    async function () {
      if (gateway && gateway.finalizeAttempt) {
        await gateway.finalizeAttempt({ completionState: "completed" });
      }
      status.textContent = "Attempt finalized";
    },
  );
})();
