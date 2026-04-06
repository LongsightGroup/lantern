(async function () {
  const fallbackContent = {
    title: "Quick Study",
    subject: "Cell Biology Warm-Up",
    deck_label: "Desk Deck 01",
    instructions:
      "Flip each card, check the answer, and work until every card has cleared the tray at least once.",
    cards: [
      {
        id: "card-1",
        front: "What structure controls what enters and leaves a cell?",
        back: "The cell membrane acts as the selectively permeable boundary.",
        hint: "Think transport, not storage.",
        tags: ["cells", "structure"],
      },
      {
        id: "card-2",
        front: "What organelle is often called the cell's energy factory?",
        back: "Mitochondria release usable energy from food molecules.",
        hint: "It is the powerhouse answer.",
        tags: ["cells", "energy"],
      },
      {
        id: "card-3",
        front: "What molecule stores genetic instructions?",
        back: "DNA stores the hereditary information used by the cell.",
        hint: "It is not RNA for this one.",
        tags: ["genetics"],
      },
      {
        id: "card-4",
        front: "What structure assembles proteins?",
        back: "Ribosomes read RNA instructions and assemble proteins.",
        hint: "They can float freely or attach to rough ER.",
        tags: ["proteins", "organelles"],
      },
      {
        id: "card-5",
        front:
          "What process moves water across a selectively permeable membrane?",
        back: "Osmosis is the diffusion of water across the membrane.",
        hint: "It is a water-specific transport word.",
        tags: ["transport"],
      },
      {
        id: "card-6",
        front: "What organelle packages and ships proteins?",
        back: "The Golgi apparatus modifies, packages, and ships proteins.",
        hint: "It works like the cell's mailroom.",
        tags: ["organelles", "transport"],
      },
    ],
  };
  const fallbackLaunch = {
    userRole: "learner",
    courseId: "course_demo",
    assignmentId: "assignment_demo",
    activityId: "quick-study",
  };
  const gateway = globalThis.GatewayApp ?? null;
  const rawBootstrap = globalThis.GatewayBootstrap ?? null;
  const [rawContent, launchContext, savedLocalState] = await Promise.all([
    loadActivityContent(gateway, fallbackContent),
    loadLaunchContext(gateway, rawBootstrap, fallbackLaunch),
    loadLocalState(gateway),
  ]);
  const content = normalizeContent(rawContent);
  const cardsById = new Map(
    content.cards.map(function (card) {
      return [card.id, card];
    }),
  );
  const persisted = normalizeLocalState(savedLocalState, content.cards);
  const root = {
    title: document.querySelector("[data-test='app-title']"),
    instructions: document.querySelector("#instructions"),
    launchChip: document.querySelector("#launch-chip"),
    deckLabel: document.querySelector("#deck-label"),
    cardCounter: document.querySelector("#card-counter"),
    statusPill: document.querySelector("#status-pill"),
    cardShell: document.querySelector("#card-shell"),
    cardFront: document.querySelector("#card-front"),
    cardBack: document.querySelector("#card-back"),
    cardHint: document.querySelector("#card-hint"),
    answerNote: document.querySelector("#answer-note"),
    cardTags: document.querySelector("#card-tags"),
    revealButton: document.querySelector("#reveal-button"),
    againButton: document.querySelector("#again-button"),
    almostButton: document.querySelector("#almost-button"),
    gotItButton: document.querySelector("#got-it-button"),
    footerNote: document.querySelector("#footer-note"),
    streakValue: document.querySelector("#streak-value"),
    masteredValue: document.querySelector("#mastered-value"),
    remainingValue: document.querySelector("#remaining-value"),
    progressFill: document.querySelector("#progress-fill"),
    progressCopy: document.querySelector("#progress-copy"),
    sessionsValue: document.querySelector("#sessions-value"),
    reviewsValue: document.querySelector("#reviews-value"),
    bestStreakValue: document.querySelector("#best-streak-value"),
    ledgerNote: document.querySelector("#ledger-note"),
    againCount: document.querySelector("#again-count"),
    almostCount: document.querySelector("#almost-count"),
    gotItCount: document.querySelector("#got-it-count"),
    completeButton: document.querySelector("#complete-button"),
  };
  const state = {
    queue: content.cards.map(function (card) {
      return card.id;
    }),
    revealed: false,
    processing: false,
    finalizing: false,
    finalized: false,
    streak: 0,
    bestStreak: persisted.bestStreak,
    sessionsCompleted: persisted.sessionsCompleted,
    totalReviews: persisted.totalReviews,
    lastCompletedAt: persisted.lastCompletedAt,
    recap: {
      again: 0,
      almost: 0,
      got_it: 0,
    },
    cardStats: persisted.cardStats,
    sentProgress: new Set(),
  };

  if (
    !root.cardShell || !root.cardFront || !root.cardBack ||
    !root.revealButton ||
    !root.againButton || !root.almostButton || !root.gotItButton ||
    !root.completeButton
  ) {
    throw new Error("Quick Study could not find its required app elements.");
  }

  root.title.textContent = content.title;
  root.instructions.textContent = content.instructions;
  root.deckLabel.textContent = content.deckLabel;
  root.launchChip.textContent = buildLaunchChip(launchContext, content.subject);

  bindControls();
  if (gateway) {
    setStatus("Lantern session ready", "neutral");
    root.footerNote.textContent = "Flip the card, then choose how it felt.";
  } else {
    setStatus("Standalone demo mode", "warning");
    root.footerNote.textContent =
      "Lantern APIs are unavailable in this browser view, but the deck is still playable.";
  }
  render();

  function normalizeContent(value) {
    const raw = value && typeof value === "object" ? value : {};
    const rawCards = Array.isArray(raw.cards) ? raw.cards : [];
    const cards = rawCards.map(function (card, index) {
      const item = card && typeof card === "object" ? card : {};
      const tags = Array.isArray(item.tags)
        ? item.tags.filter(function (tag) {
          return typeof tag === "string" && tag.trim() !== "";
        }).map(function (tag) {
          return tag.trim();
        })
        : [];

      return {
        id: typeof item.id === "string" && item.id.trim() !== ""
          ? item.id.trim()
          : "card-" + String(index + 1),
        front: typeof item.front === "string" && item.front.trim() !== ""
          ? item.front.trim()
          : "Review this prompt.",
        back: typeof item.back === "string" && item.back.trim() !== ""
          ? item.back.trim()
          : "Answer unavailable.",
        hint: typeof item.hint === "string" && item.hint.trim() !== ""
          ? item.hint.trim()
          : "",
        tags: tags.slice(0, 4),
      };
    }).filter(function (card) {
      return card.front !== "" && card.back !== "";
    });

    return {
      title: typeof raw.title === "string" && raw.title.trim() !== ""
        ? raw.title.trim()
        : fallbackContent.title,
      subject: typeof raw.subject === "string" && raw.subject.trim() !== ""
        ? raw.subject.trim()
        : fallbackContent.subject,
      deckLabel:
        typeof raw.deck_label === "string" && raw.deck_label.trim() !== ""
          ? raw.deck_label.trim()
          : fallbackContent.deck_label,
      instructions:
        typeof raw.instructions === "string" && raw.instructions.trim() !== ""
          ? raw.instructions.trim()
          : fallbackContent.instructions,
      cards: cards.length > 0 ? cards : fallbackContent.cards,
    };
  }

  function normalizeLocalState(value, cards) {
    const source = value && typeof value === "object" ? value : {};
    const rawCardStats =
      source.cardStats && typeof source.cardStats === "object"
        ? source.cardStats
        : {};
    const cardStats = {};

    cards.forEach(function (card) {
      const rawStat =
        rawCardStats[card.id] && typeof rawCardStats[card.id] === "object"
          ? rawCardStats[card.id]
          : {};
      cardStats[card.id] = {
        seen: toWholeNumber(rawStat.seen),
        gotIt: toWholeNumber(rawStat.gotIt),
        almost: toWholeNumber(rawStat.almost),
        again: toWholeNumber(rawStat.again),
      };
    });

    return {
      version: 1,
      sessionsCompleted: toWholeNumber(source.sessionsCompleted),
      totalReviews: toWholeNumber(source.totalReviews),
      bestStreak: toWholeNumber(source.bestStreak),
      lastCompletedAt: typeof source.lastCompletedAt === "string" &&
          source.lastCompletedAt.trim() !== ""
        ? source.lastCompletedAt.trim()
        : null,
      cardStats: cardStats,
    };
  }

  function toWholeNumber(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0
      ? Math.floor(value)
      : 0;
  }

  function currentCard() {
    return state.queue.length === 0
      ? null
      : cardsById.get(state.queue[0]) ?? null;
  }

  function masteredCount() {
    return content.cards.length - state.queue.length;
  }

  function isComplete() {
    return state.queue.length === 0;
  }

  function bindControls() {
    root.cardShell.addEventListener("click", function () {
      if (!state.revealed && !isComplete()) {
        revealCard();
      }
    });
    root.revealButton.addEventListener("click", revealCard);
    root.againButton.addEventListener("click", function () {
      handleRating("again");
    });
    root.almostButton.addEventListener("click", function () {
      handleRating("almost");
    });
    root.gotItButton.addEventListener("click", function () {
      handleRating("got_it");
    });
    root.completeButton.addEventListener("click", finalizeSession);
    globalThis.addEventListener("keydown", function (event) {
      if (state.finalizing) {
        return;
      }

      if (event.key === " " && !state.revealed && !isComplete()) {
        event.preventDefault();
        revealCard();
        return;
      }

      if (!state.revealed || isComplete()) {
        if ((event.key === "Enter" || event.key === "Return") && isComplete()) {
          event.preventDefault();
          finalizeSession();
        }
        return;
      }

      if (event.key === "1") {
        event.preventDefault();
        handleRating("again");
      } else if (event.key === "2") {
        event.preventDefault();
        handleRating("almost");
      } else if (event.key === "3") {
        event.preventDefault();
        handleRating("got_it");
      }
    });
  }

  function revealCard() {
    if (state.revealed || state.processing || isComplete()) {
      return;
    }

    state.revealed = true;
    root.footerNote.textContent =
      "Use Again, Almost, or Got it. Keyboard shortcuts: 1, 2, and 3.";
    setStatus("Answer revealed", "neutral");
    render();
  }

  async function handleRating(answer) {
    const card = currentCard();

    if (!card || !state.revealed || state.processing || state.finalizing) {
      return;
    }

    state.processing = true;
    render();

    const timestamp = new Date().toISOString();
    await sendAttemptEvent({
      type: "answer",
      questionId: card.id,
      answer: answer,
      timestamp: timestamp,
    });

    const stats = state.cardStats[card.id];
    stats.seen += 1;
    state.totalReviews += 1;
    state.recap[answer] += 1;

    if (answer === "got_it") {
      stats.gotIt += 1;
      state.queue.shift();
      state.streak += 1;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
      root.footerNote.textContent =
        "Nice. That card cleared the tray for this round.";
    } else if (answer === "almost") {
      stats.almost += 1;
      rotateCurrentCard();
      state.streak = 0;
      root.footerNote.textContent =
        "Marked Almost. That card will come back once more.";
    } else {
      stats.again += 1;
      rotateCurrentCard();
      state.streak = 0;
      root.footerNote.textContent =
        "Marked Again. The card moved to the back of the tray.";
    }

    state.revealed = false;
    await persistDeckState();
    await emitProgressIfNeeded();

    if (isComplete()) {
      setStatus("Deck cleared", "success");
      root.footerNote.textContent =
        "Every card cleared the tray. Log the completed session when you are ready.";
    } else {
      setStatus("Next card ready", "neutral");
    }

    state.processing = false;
    render();
  }

  function rotateCurrentCard() {
    if (state.queue.length <= 1) {
      return;
    }

    const current = state.queue.shift();

    if (current) {
      state.queue.push(current);
    }
  }

  async function emitProgressIfNeeded() {
    const ratio = content.cards.length === 0
      ? 1
      : masteredCount() / content.cards.length;
    const checkpoints = [
      { name: "quarter-deck", threshold: 0.25 },
      { name: "half-deck", threshold: 0.5 },
      { name: "three-quarter-deck", threshold: 0.75 },
      { name: "full-deck", threshold: 1 },
    ];

    for (const checkpoint of checkpoints) {
      if (
        ratio < checkpoint.threshold || state.sentProgress.has(checkpoint.name)
      ) {
        continue;
      }

      state.sentProgress.add(checkpoint.name);
      await sendAttemptEvent({
        type: "progress",
        checkpoint: checkpoint.name,
        value: ratio,
        timestamp: new Date().toISOString(),
      });
    }
  }

  async function finalizeSession() {
    if (!isComplete() || state.finalizing || state.finalized) {
      return;
    }

    state.finalizing = true;
    setStatus("Logging session", "neutral");
    root.completeButton.textContent = "Logging session...";
    root.footerNote.textContent =
      "Lantern is finalizing the completed study session.";
    render();

    try {
      await sendAttemptEvent({
        type: "complete",
        timestamp: new Date().toISOString(),
      });

      if (gateway && gateway.finalizeAttempt) {
        await gateway.finalizeAttempt({
          completionState: "completed",
        });
      }

      state.finalized = true;
      state.sessionsCompleted += 1;
      state.lastCompletedAt = new Date().toISOString();
      await persistDeckState();
      root.completeButton.textContent = gateway
        ? "Session logged"
        : "Local review complete";
      root.footerNote.textContent = gateway
        ? "Study session finalized. Lantern now owns the score publication path."
        : "Local review complete. Lantern finalize is unavailable outside the governed runtime.";
      setStatus("Session finalized", "success");
    } catch (error) {
      state.finalizing = false;
      root.completeButton.textContent = "Retry log session";
      root.footerNote.textContent = "Finalize blocked: " + formatError(error);
      setStatus("Finalize blocked", "warning");
      render();
      return;
    }

    state.finalizing = false;
    render();
  }

  async function persistDeckState() {
    if (!gateway || !gateway.writeLocalState) {
      return;
    }

    await gateway.writeLocalState({
      version: 1,
      sessionsCompleted: state.sessionsCompleted,
      totalReviews: state.totalReviews,
      bestStreak: state.bestStreak,
      lastCompletedAt: state.lastCompletedAt,
      cardStats: state.cardStats,
    }).catch(function (error) {
      setStatus("Local memory warning", "warning");
      root.footerNote.textContent = "Local state warning: " +
        formatError(error);
    });
  }

  function render() {
    const card = currentCard();
    const complete = isComplete();
    const mastered = masteredCount();
    const remaining = state.queue.length;
    const progressPercent = content.cards.length === 0
      ? 100
      : (mastered / content.cards.length) * 100;
    const ratingDisabled = !state.revealed || state.processing ||
      state.finalizing ||
      complete;

    root.cardShell.dataset.revealed = complete || state.revealed
      ? "true"
      : "false";
    root.cardShell.disabled = complete;
    root.revealButton.disabled = complete || state.revealed ||
      state.processing ||
      state.finalizing;
    root.againButton.disabled = ratingDisabled;
    root.almostButton.disabled = ratingDisabled;
    root.gotItButton.disabled = ratingDisabled;
    root.completeButton.disabled = !complete || state.finalizing ||
      state.finalized;
    root.completeButton.textContent = state.finalized
      ? (gateway ? "Session logged" : "Local review complete")
      : (state.finalizing ? "Logging session..." : "Log study session");

    if (complete) {
      root.cardCounter.textContent = "Deck cleared";
      root.cardFront.textContent = "Round complete";
      root.cardBack.textContent =
        "Every card has been marked Got it at least once. Log the session when you are ready.";
      root.cardHint.textContent =
        "The recap stays visible while you hand the completion back to Lantern.";
      root.answerNote.textContent =
        "Completion grading for this demo is tied to finishing the full tray.";
      renderTags(["complete", "study"]);
    } else if (card) {
      root.cardCounter.textContent = String(remaining) + " cards in the tray";
      root.cardFront.textContent = card.front;
      root.cardBack.textContent = card.back;
      root.cardHint.textContent = card.hint
        ? "Hint: " + card.hint
        : "Reveal when you are ready.";
      root.answerNote.textContent =
        "Choose Again, Almost, or Got it to move through the deck.";
      renderTags(card.tags);
    }

    root.streakValue.textContent = String(state.streak);
    root.masteredValue.textContent = String(mastered);
    root.remainingValue.textContent = String(remaining);
    root.progressFill.style.width = progressPercent.toFixed(2) + "%";
    root.progressCopy.textContent = String(mastered) + " of " +
      String(content.cards.length) + " cards cleared this round";
    root.sessionsValue.textContent = String(state.sessionsCompleted);
    root.reviewsValue.textContent = String(state.totalReviews);
    root.bestStreakValue.textContent = String(state.bestStreak);
    root.againCount.textContent = String(state.recap.again);
    root.almostCount.textContent = String(state.recap.almost);
    root.gotItCount.textContent = String(state.recap.got_it);
    root.ledgerNote.textContent = buildLedgerNote();
  }

  function renderTags(tags) {
    root.cardTags.replaceChildren();
    tags.forEach(function (tag) {
      const chip = document.createElement("span");
      chip.textContent = tag;
      root.cardTags.appendChild(chip);
    });
  }

  function buildLedgerNote() {
    const mostRepeated = findMostRepeatedCard();

    if (mostRepeated) {
      return "Most replayed so far: " + mostRepeated + ".";
    }

    if (state.lastCompletedAt) {
      return "Last completed session: " + formatDate(state.lastCompletedAt) +
        ".";
    }

    return "Lantern can keep local deck memory between launches.";
  }

  function findMostRepeatedCard() {
    let selected = null;

    content.cards.forEach(function (card) {
      const stats = state.cardStats[card.id];

      if (!stats || stats.again === 0) {
        return;
      }

      if (!selected || stats.again > selected.count) {
        selected = {
          count: stats.again,
          label: shorten(card.front, 46),
        };
      }
    });

    return selected ? selected.label : null;
  }

  function shorten(value, maxLength) {
    return value.length <= maxLength
      ? value
      : value.slice(0, maxLength - 3).trimEnd() + "...";
  }

  function buildLaunchChip(launch, subject) {
    const roleLabel = launch.userRole === "instructor"
      ? "Instructor preview"
      : "Learner study session";
    return roleLabel + " - " + subject;
  }

  function setStatus(label, tone) {
    root.statusPill.textContent = label;
    root.statusPill.dataset.tone = tone;
  }

  async function sendAttemptEvent(event) {
    if (!gateway || !gateway.emitAttemptEvent) {
      return;
    }

    await gateway.emitAttemptEvent(event).catch(function (error) {
      setStatus("Event warning", "warning");
      root.footerNote.textContent = "Lantern event warning: " +
        formatError(error);
    });
  }

  function formatError(error) {
    if (error instanceof Error && error.message.trim() !== "") {
      return error.message;
    }

    return "Unknown error";
  }

  function formatDate(value) {
    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return parsed.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  async function loadActivityContent(gateway, fallback) {
    if (!gateway || !gateway.getActivityContent) {
      return fallback;
    }

    return await gateway.getActivityContent().catch(function () {
      return fallback;
    });
  }

  async function loadLaunchContext(gateway, bootstrap, fallback) {
    if (gateway && gateway.getLaunchContext) {
      return await gateway.getLaunchContext().catch(function () {
        return fallback;
      });
    }

    if (bootstrap && bootstrap.launch && typeof bootstrap.launch === "object") {
      return {
        userRole: bootstrap.launch.user_role === "instructor"
          ? "instructor"
          : "learner",
        courseId: typeof bootstrap.launch.course_id === "string" &&
            bootstrap.launch.course_id.trim() !== ""
          ? bootstrap.launch.course_id.trim()
          : fallback.courseId,
        assignmentId: typeof bootstrap.launch.assignment_id === "string" &&
            bootstrap.launch.assignment_id.trim() !== ""
          ? bootstrap.launch.assignment_id.trim()
          : fallback.assignmentId,
        activityId: typeof bootstrap.launch.activity_id === "string" &&
            bootstrap.launch.activity_id.trim() !== ""
          ? bootstrap.launch.activity_id.trim()
          : fallback.activityId,
      };
    }

    return fallback;
  }

  async function loadLocalState(gateway) {
    if (!gateway || !gateway.readLocalState) {
      return null;
    }

    return await gateway.readLocalState().catch(function () {
      return null;
    });
  }
})();
