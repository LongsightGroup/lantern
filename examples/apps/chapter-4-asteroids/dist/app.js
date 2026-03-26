(async function () {
  const fallbackContent = {
    title: "Chapter 4 Asteroids",
    instructions:
      "Pilot the interceptor, blast the asteroid whose label matches each physics term, and clear both waves to finish the mission.",
    questions: [
      {
        id: "q1",
        prompt: "Wave 1: Which asteroid defines inertia?",
        correct: "resistance to a change in motion",
        choices: [
          "stored heat in an object",
          "resistance to a change in motion",
          "the speed of a falling object",
        ],
      },
      {
        id: "q2",
        prompt: "Wave 2: Which asteroid defines velocity?",
        correct: "speed with direction",
        choices: [
          "force over area",
          "speed with direction",
          "a measure of mass",
        ],
      },
    ],
  };

  const gateway = globalThis.GatewayApp;
  const content = normalizeContent(
    gateway && gateway.getActivityContent
      ? await gateway.getActivityContent().catch(function () {
        return fallbackContent;
      })
      : fallbackContent,
  );

  const root = {
    title: document.querySelector("[data-test='app-title']"),
    instructions: document.querySelector("#instructions"),
    prompt: document.querySelector("#prompt"),
    missionDetail: document.querySelector("#mission-detail"),
    waveLabel: document.querySelector("#wave-label"),
    waveProgress: document.querySelector("#wave-progress"),
    status: document.querySelector("#mission-status"),
    canvasCaption: document.querySelector("#canvas-caption"),
    footerNote: document.querySelector("#footer-note"),
    arcadeScore: document.querySelector("#arcade-score"),
    hullValue: document.querySelector("#hull-value"),
    accuracyValue: document.querySelector("#accuracy-value"),
    clearedValue: document.querySelector("#cleared-value"),
    completeButton: document.querySelector("#complete"),
    touchButtons: Array.from(document.querySelectorAll("[data-control]")),
  };
  const canvas = document.querySelector("#game-canvas");

  if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error("Chapter 4 Asteroids requires a canvas element.");
  }

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Chapter 4 Asteroids could not start the 2D canvas.");
  }

  const reducedMotion = globalThis.matchMedia &&
    globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const palette = ["#ff8e4a", "#ffd66c", "#5bd2c8", "#68b4ff"];
  const state = {
    questionIndex: 0,
    phase: "playing",
    arcadeScore: 0,
    clearedQuestions: 0,
    hull: 100,
    shotsFired: 0,
    resolvedShots: 0,
    missionComplete: false,
    finalizing: false,
    finalized: false,
    pendingAdvanceAt: 0,
    pendingAdvanceMode: null,
    fireCooldownUntil: 0,
    shake: 0,
    flash: 0,
    bannerTitle: "Asteroid screen online",
    bannerDetail: "Track the label that matches the live concept prompt.",
    bannerExpiresAt: performance.now() + 2800,
    sentProgress: new Set(),
  };
  const ship = {
    x: 0,
    y: 0,
    width: 56,
    height: 28,
  };
  const input = {
    left: false,
    right: false,
    fire: false,
  };
  let stars = [];
  let bullets = [];
  let particles = [];
  let targets = [];
  let lastFrame = performance.now();

  root.title.textContent = content.title;
  root.instructions.textContent = content.instructions;
  resizeCanvas();
  resetShip();
  launchWave("Warm up the railgun. The first concept drift is inbound.");
  updateHud();
  render(lastFrame);
  bindControls();
  requestAnimationFrame(loop);

  function normalizeContent(value) {
    const raw = value && typeof value === "object" ? value : {};
    const rawQuestions = Array.isArray(raw.questions) ? raw.questions : [];
    const questions = rawQuestions.map(function (question, index) {
      const item = question && typeof question === "object" ? question : {};
      const choices = Array.isArray(item.choices)
        ? item.choices.filter(function (choice) {
          return typeof choice === "string" && choice.trim() !== "";
        }).map(function (choice) {
          return choice.trim();
        })
        : [];

      return {
        id: typeof item.id === "string" && item.id.trim() !== ""
          ? item.id.trim()
          : "q" + String(index + 1),
        prompt: typeof item.prompt === "string" && item.prompt.trim() !== ""
          ? item.prompt.trim()
          : "Clear the correct concept asteroid.",
        correct: typeof item.correct === "string" && item.correct.trim() !== ""
          ? item.correct.trim()
          : choices[0] || "",
        choices: choices.length > 0 ? choices : ["No answer loaded"],
      };
    }).filter(function (question) {
      return question.correct !== "";
    });

    return {
      title: typeof raw.title === "string" && raw.title.trim() !== ""
        ? raw.title.trim()
        : fallbackContent.title,
      instructions:
        typeof raw.instructions === "string" && raw.instructions.trim() !== ""
          ? raw.instructions.trim()
          : fallbackContent.instructions,
      questions: questions.length > 0 ? questions : fallbackContent.questions,
    };
  }

  function currentQuestion() {
    return content.questions[state.questionIndex] || null;
  }

  function bindControls() {
    globalThis.addEventListener("resize", function () {
      resizeCanvas();
      if (!state.missionComplete) {
        launchWave("Flight path recalibrated for the new viewport.");
      }
    });

    globalThis.addEventListener("keydown", function (event) {
      if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") {
        input.left = true;
        event.preventDefault();
      }

      if (
        event.key === "ArrowRight" ||
        event.key === "d" ||
        event.key === "D"
      ) {
        input.right = true;
        event.preventDefault();
      }

      if (
        event.key === " " ||
        event.key === "Spacebar" ||
        event.key === "ArrowUp"
      ) {
        input.fire = true;
        event.preventDefault();
      }

      if (event.key === "Enter" && state.missionComplete) {
        finishMission();
      }
    });

    globalThis.addEventListener("keyup", function (event) {
      if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") {
        input.left = false;
      }

      if (
        event.key === "ArrowRight" ||
        event.key === "d" ||
        event.key === "D"
      ) {
        input.right = false;
      }

      if (
        event.key === " " ||
        event.key === "Spacebar" ||
        event.key === "ArrowUp"
      ) {
        input.fire = false;
      }
    });

    root.completeButton.addEventListener("click", function () {
      finishMission();
    });

    root.touchButtons.forEach(function (button) {
      const control = button.dataset.control;

      if (!control) {
        return;
      }

      button.addEventListener("pointerdown", function (event) {
        event.preventDefault();

        if (control === "left") {
          input.left = true;
        }

        if (control === "right") {
          input.right = true;
        }

        if (control === "fire") {
          input.fire = true;
          attemptFire(performance.now());
        }
      });

      ["pointerup", "pointercancel", "pointerleave"].forEach(function (type) {
        button.addEventListener(type, function () {
          if (control === "left") {
            input.left = false;
          }

          if (control === "right") {
            input.right = false;
          }

          if (control === "fire") {
            input.fire = false;
          }
        });
      });
    });
  }

  function resizeCanvas() {
    const bounds = canvas.getBoundingClientRect();
    const ratio = Math.max(1, Math.min(globalThis.devicePixelRatio || 1, 2));
    const width = Math.max(320, Math.round(bounds.width * ratio));
    const height = Math.max(220, Math.round(bounds.height * ratio));

    canvas.width = width;
    canvas.height = height;
    stars = createStars(width, height, reducedMotion ? 42 : 74);
  }

  function resetShip() {
    ship.width = canvas.width * 0.07;
    ship.height = canvas.height * 0.045;
    ship.x = canvas.width * 0.5;
    ship.y = canvas.height * 0.86;
  }

  function launchWave(detail) {
    const question = currentQuestion();

    if (!question) {
      return;
    }

    resetShip();
    bullets = [];
    particles = [];
    targets = createTargets(question);
    state.phase = "playing";
    state.pendingAdvanceAt = 0;
    state.pendingAdvanceMode = null;
    state.fireCooldownUntil = performance.now() + 320;
    state.flash = 0;
    root.waveLabel.textContent = "Wave " + String(state.questionIndex + 1);
    root.waveProgress.textContent = "Wave " + String(state.questionIndex + 1) +
      " / " +
      String(content.questions.length);
    root.prompt.textContent = question.prompt;
    root.missionDetail.textContent = detail ||
      "Blast the asteroid whose label matches this concept. Wrong hits reform the wave.";
    root.canvasCaption.textContent =
      "Three labeled asteroids are drifting inside the live concept corridor.";
    setStatus("Interceptor online for " + question.id + ".", "neutral");
    updateHud();
    showBanner(root.waveLabel.textContent, detail || question.prompt, 2200);
    emitProgressOnce("wave-" + question.id + "-armed", progressRatio());
  }

  function createTargets(question) {
    const laneWidth = canvas.width / (question.choices.length + 1);

    return shuffle(question.choices.slice()).map(function (choice, index) {
      const color = palette[index % palette.length];
      const seed = seedFromString(question.id + choice + String(index));
      const random = mulberry32(seed);
      const radius = canvas.width * (0.072 + random() * 0.014);
      const baseX = laneWidth * (index + 1);
      const x = clamp(
        baseX + (random() - 0.5) * laneWidth * 0.26,
        radius * 1.35,
        canvas.width - radius * 1.35,
      );
      const y = canvas.height * (0.22 + random() * 0.18);

      return {
        choice: choice,
        correct: choice === question.correct,
        color: color,
        x: x,
        y: y,
        radius: radius,
        velocityX: (random() - 0.5) * canvas.width * 0.1,
        velocityY: canvas.height * (0.008 + random() * 0.012),
        drift: random() * Math.PI * 2,
        rotation: random() * Math.PI * 2,
        rotationSpeed: (random() - 0.5) * 0.9,
        labelLines: wrapChoice(choice),
        shape: createRockShape(seed, radius),
      };
    });
  }

  function createStars(width, height, count) {
    const random = mulberry32(42);

    return Array.from({ length: count }, function () {
      return {
        x: random() * width,
        y: random() * height,
        radius: random() * 1.8 + 0.4,
        speed: random() * 26 + 12,
        alpha: random() * 0.55 + 0.2,
      };
    });
  }

  function createRockShape(seed, radius) {
    const random = mulberry32(seed);
    const points = [];
    const total = 11;

    for (let index = 0; index < total; index += 1) {
      const angle = (Math.PI * 2 * index) / total;
      const variance = radius * (0.72 + random() * 0.42);

      points.push({
        x: Math.cos(angle) * variance,
        y: Math.sin(angle) * variance,
      });
    }

    return points;
  }

  function wrapChoice(choice) {
    const words = choice.split(/\s+/);
    const lines = [];
    let current = "";

    words.forEach(function (word) {
      const candidate = current === "" ? word : current + " " + word;

      if (candidate.length <= 18 || current === "") {
        current = candidate;
        return;
      }

      lines.push(current);
      current = word;
    });

    if (current !== "") {
      lines.push(current);
    }

    return lines.slice(0, 3);
  }

  function loop(frameTime) {
    const delta = Math.min((frameTime - lastFrame) / 1000, 0.033);
    lastFrame = frameTime;
    update(frameTime, delta);
    render(frameTime);
    requestAnimationFrame(loop);
  }

  function update(frameTime, delta) {
    stars.forEach(function (star) {
      star.y += star.speed * delta;

      if (star.y > canvas.height) {
        star.y = -2;
        star.x = Math.random() * canvas.width;
      }
    });

    if (state.flash > 0) {
      state.flash = Math.max(0, state.flash - delta * 2.4);
    }

    if (state.shake > 0) {
      state.shake = Math.max(0, state.shake - delta * 6);
    }

    if (input.fire) {
      attemptFire(frameTime);
    }

    if (
      state.pendingAdvanceAt !== 0 &&
      frameTime >= state.pendingAdvanceAt &&
      !state.finalizing
    ) {
      const mode = state.pendingAdvanceMode;

      state.pendingAdvanceAt = 0;
      state.pendingAdvanceMode = null;

      if (mode === "retry") {
        launchWave(
          "The debris field reset. Track the correct label and fire again.",
        );
      }

      if (mode === "next") {
        state.questionIndex += 1;
        launchWave("Fresh wave inbound. Keep the interceptor steady.");
      }
    }

    updateShip(delta);
    updateBullets(delta);
    updateTargets(delta, frameTime);
    updateParticles(delta);
    detectHits(frameTime);
  }

  function updateShip(delta) {
    const speed = canvas.width * 0.52 * delta;

    if (input.left && !input.right) {
      ship.x -= speed;
    }

    if (input.right && !input.left) {
      ship.x += speed;
    }

    ship.x = clamp(ship.x, ship.width * 0.68, canvas.width - ship.width * 0.68);
  }

  function attemptFire(frameTime) {
    if (
      state.phase !== "playing" ||
      state.missionComplete ||
      frameTime < state.fireCooldownUntil
    ) {
      return;
    }

    state.fireCooldownUntil = frameTime + 180;
    state.shotsFired += 1;
    bullets.push({
      x: ship.x,
      y: ship.y - ship.height * 0.8,
      radius: Math.max(3, canvas.width * 0.006),
      velocityY: canvas.height * 0.82,
    });
    spawnBurst(ship.x, ship.y, "#ffd66c", reducedMotion ? 4 : 7, 1);
    updateHud();
  }

  function updateBullets(delta) {
    bullets = bullets.filter(function (bullet) {
      bullet.y -= bullet.velocityY * delta;
      return bullet.y + bullet.radius > 0;
    });
  }

  function updateTargets(delta, frameTime) {
    targets.forEach(function (target, index) {
      const orbit = Math.sin(frameTime / 460 + index) * canvas.height * 0.015;

      target.x += target.velocityX * delta;
      target.y += target.velocityY * delta + orbit * delta;
      target.rotation += target.rotationSpeed * delta;
      target.drift += delta;

      if (
        target.x < target.radius * 1.1 ||
        target.x > canvas.width - target.radius * 1.1
      ) {
        target.velocityX *= -1;
      }

      if (
        target.y < target.radius * 1.05 ||
        target.y > canvas.height * 0.62
      ) {
        target.velocityY *= -1;
      }
    });
  }

  function updateParticles(delta) {
    particles = particles.filter(function (particle) {
      particle.x += particle.velocityX * delta;
      particle.y += particle.velocityY * delta;
      particle.velocityX *= 0.985;
      particle.velocityY *= 0.985;
      particle.life -= delta;
      return particle.life > 0;
    });
  }

  function detectHits(frameTime) {
    if (state.phase !== "playing") {
      return;
    }

    for (let bulletIndex = 0; bulletIndex < bullets.length; bulletIndex += 1) {
      const bullet = bullets[bulletIndex];

      for (
        let targetIndex = 0;
        targetIndex < targets.length;
        targetIndex += 1
      ) {
        const target = targets[targetIndex];
        const dx = bullet.x - target.x;
        const dy = bullet.y - target.y;

        if (Math.hypot(dx, dy) <= target.radius + bullet.radius) {
          bullets.splice(bulletIndex, 1);
          resolveShot(target, frameTime);
          return;
        }
      }
    }
  }

  function resolveShot(target, frameTime) {
    const question = currentQuestion();

    if (!question) {
      return;
    }

    state.phase = "transition";
    state.resolvedShots += 1;
    state.flash = target.correct ? 0.9 : 0.55;
    state.shake = target.correct ? 1.4 : 0.8;
    spawnBurst(
      target.x,
      target.y,
      target.color,
      reducedMotion ? 18 : 34,
      target.correct ? 1.8 : 1.1,
    );
    sendAttemptEvent({
      type: "answer",
      questionId: question.id,
      answer: target.choice,
      timestamp: new Date().toISOString(),
    });

    if (target.correct) {
      state.arcadeScore += 240;
      state.hull = clamp(state.hull + 6, 0, 100);
      state.clearedQuestions += 1;
      setStatus("Direct hit on " + question.id + ".", "success");
      root.canvasCaption.textContent =
        "Correct concept asteroid vaporized. Mission corridor is stabilizing.";

      if (state.questionIndex === content.questions.length - 1) {
        state.missionComplete = true;
        root.completeButton.disabled = false;
        root.completeButton.textContent = "Finish mission";
        root.footerNote.textContent =
          "All reviewed waves are clear. Finish the mission to let Lantern finalize the attempt.";
        root.missionDetail.textContent =
          "Mission clear. Finalize the run to record the durable score.";
        root.canvasCaption.textContent =
          "All concept asteroids cleared. Mission log is ready for finalize.";
        state.phase = "complete";
        emitProgressOnce("mission-ready", 1);
        showBanner(
          "All clear",
          "The concept corridor is clean. Finish the mission when you are ready.",
          4200,
        );
      } else {
        emitProgressOnce(question.id + "-cleared", progressRatio());
        showBanner(
          "Wave cleared",
          "Correct target destroyed. The next concept wave is lining up.",
          2200,
        );
        state.pendingAdvanceAt = frameTime + 1100;
        state.pendingAdvanceMode = "next";
      }
    } else {
      state.arcadeScore = Math.max(0, state.arcadeScore - 70);
      state.hull = clamp(state.hull - 22, 0, 100);
      setStatus("Wrong target intercepted. Wave reforming.", "warning");
      root.canvasCaption.textContent =
        "That label was a distractor. The same concept wave is coming back around.";
      showBanner(
        "Distractor hit",
        "Wrong asteroid. The wave is reforming so you can take the correct shot.",
        1800,
      );
      state.pendingAdvanceAt = frameTime + 950;
      state.pendingAdvanceMode = "retry";
    }

    updateHud();
  }

  function updateHud() {
    root.arcadeScore.textContent = String(Math.max(0, state.arcadeScore))
      .padStart(4, "0");
    root.hullValue.textContent = String(Math.round(state.hull)) + "%";
    root.accuracyValue.textContent = state.shotsFired === 0
      ? "0%"
      : String(Math.round((state.resolvedShots / state.shotsFired) * 100)) +
        "%";
    root.clearedValue.textContent = String(state.clearedQuestions) + " / " +
      String(content.questions.length);
  }

  function showBanner(title, detail, duration) {
    state.bannerTitle = title;
    state.bannerDetail = detail;
    state.bannerExpiresAt = performance.now() + duration;
  }

  function setStatus(message, tone) {
    root.status.textContent = message;
    root.status.dataset.tone = tone;
  }

  async function finishMission() {
    if (!state.missionComplete || state.finalizing || state.finalized) {
      return;
    }

    state.finalizing = true;
    root.completeButton.disabled = true;
    root.completeButton.textContent = "Uploading mission log...";
    setStatus("Mission log in flight.", "neutral");
    showBanner(
      "Mission complete",
      "Lantern is finalizing the durable attempt and score.",
      2400,
    );

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
      root.completeButton.textContent = "Mission logged";
      root.footerNote.textContent =
        "Mission finalized. Lantern now owns the score publication path.";
      setStatus("Attempt finalized.", "success");
      root.canvasCaption.textContent =
        "Mission logged. The interceptor is in cool-down with a recorded score.";
      showBanner(
        "Mission logged",
        "The reviewed score path has been handed back to Lantern.",
        3600,
      );
    } catch (error) {
      root.completeButton.disabled = false;
      root.completeButton.textContent = "Retry finish";
      setStatus("Finalize blocked: " + formatError(error), "warning");
      showBanner(
        "Finalize blocked",
        formatError(error),
        3600,
      );
    } finally {
      state.finalizing = false;
    }
  }

  function sendAttemptEvent(event) {
    if (!gateway || !gateway.emitAttemptEvent) {
      return Promise.resolve();
    }

    return gateway.emitAttemptEvent(event).catch(function (error) {
      setStatus("Telemetry dropped: " + formatError(error), "warning");
      throw error;
    });
  }

  function emitProgressOnce(checkpoint, value) {
    if (state.sentProgress.has(checkpoint)) {
      return;
    }

    state.sentProgress.add(checkpoint);
    sendAttemptEvent({
      type: "progress",
      checkpoint: checkpoint,
      value: value,
      timestamp: new Date().toISOString(),
    }).catch(function () {
    });
  }

  function progressRatio() {
    return content.questions.length === 0
      ? 0
      : state.clearedQuestions / content.questions.length;
  }

  function render(frameTime) {
    const width = canvas.width;
    const height = canvas.height;
    const shakeX = state.shake > 0
      ? (Math.random() - 0.5) * state.shake * 12
      : 0;
    const shakeY = state.shake > 0
      ? (Math.random() - 0.5) * state.shake * 8
      : 0;

    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, width, height);
    drawSpaceBackground(width, height, frameTime);
    context.translate(shakeX, shakeY);
    drawStars();
    drawNebula(width, height);
    drawTargets();
    drawBullets();
    drawShip(frameTime);
    drawParticles();
    drawBanner(frameTime);

    if (state.flash > 0) {
      context.fillStyle = "rgba(255, 243, 206, " + String(state.flash * 0.12) +
        ")";
      context.fillRect(-20, -20, width + 40, height + 40);
    }

    context.restore();
  }

  function drawSpaceBackground(width, height, frameTime) {
    const background = context.createLinearGradient(0, 0, 0, height);
    background.addColorStop(0, "#07131e");
    background.addColorStop(0.56, "#0a2231");
    background.addColorStop(1, "#081018");
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    const horizon = context.createLinearGradient(0, height * 0.64, 0, height);
    horizon.addColorStop(0, "rgba(0, 0, 0, 0)");
    horizon.addColorStop(1, "rgba(255, 138, 53, 0.16)");
    context.fillStyle = horizon;
    context.fillRect(0, height * 0.64, width, height * 0.36);

    context.save();
    context.strokeStyle = "rgba(107, 190, 227, 0.08)";
    context.lineWidth = 1;
    for (let index = 0; index < 7; index += 1) {
      const y = height * 0.68 + index * height * 0.045;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y - Math.sin(frameTime / 800 + index) * 10);
      context.stroke();
    }
    context.restore();
  }

  function drawStars() {
    stars.forEach(function (star) {
      context.fillStyle = "rgba(255, 255, 255, " + String(star.alpha) + ")";
      context.beginPath();
      context.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      context.fill();
    });
  }

  function drawNebula(width, height) {
    const sunGlow = context.createRadialGradient(
      width * 0.24,
      height * 0.12,
      0,
      width * 0.24,
      height * 0.12,
      width * 0.3,
    );
    sunGlow.addColorStop(0, "rgba(255, 195, 96, 0.24)");
    sunGlow.addColorStop(1, "rgba(255, 195, 96, 0)");
    context.fillStyle = sunGlow;
    context.fillRect(0, 0, width, height);

    const aquaGlow = context.createRadialGradient(
      width * 0.76,
      height * 0.18,
      0,
      width * 0.76,
      height * 0.18,
      width * 0.22,
    );
    aquaGlow.addColorStop(0, "rgba(89, 212, 210, 0.18)");
    aquaGlow.addColorStop(1, "rgba(89, 212, 210, 0)");
    context.fillStyle = aquaGlow;
    context.fillRect(0, 0, width, height);
  }

  function drawTargets() {
    targets.forEach(function (target) {
      context.save();
      context.translate(target.x, target.y);
      context.rotate(target.rotation);

      context.shadowBlur = 18;
      context.shadowColor = target.color;
      context.fillStyle = colorAlpha(target.color, 0.18);
      context.beginPath();
      context.arc(0, 0, target.radius * 1.12, 0, Math.PI * 2);
      context.fill();

      context.shadowBlur = 0;
      context.beginPath();
      target.shape.forEach(function (point, index) {
        if (index === 0) {
          context.moveTo(point.x, point.y);
          return;
        }

        context.lineTo(point.x, point.y);
      });
      context.closePath();
      const fill = context.createRadialGradient(
        -target.radius * 0.22,
        -target.radius * 0.34,
        0,
        0,
        0,
        target.radius * 1.2,
      );
      fill.addColorStop(0, "#fff4dd");
      fill.addColorStop(0.18, target.color);
      fill.addColorStop(1, "#101e2c");
      context.fillStyle = fill;
      context.fill();
      context.lineWidth = 2.5;
      context.strokeStyle = colorAlpha("#fff4dd", 0.46);
      context.stroke();
      context.restore();

      drawChoiceLabel(target);
    });
  }

  function drawChoiceLabel(target) {
    const paddingX = 16;
    const paddingY = 10;
    const lineHeight = 18;

    context.save();
    context.font = "700 14px 'Trebuchet MS', sans-serif";
    const textWidth = target.labelLines.reduce(function (largest, line) {
      return Math.max(largest, context.measureText(line).width);
    }, 0);
    const boxWidth = textWidth + paddingX * 2;
    const boxHeight = target.labelLines.length * lineHeight + paddingY * 2;
    const x = target.x - boxWidth * 0.5;
    const y = target.y - target.radius - boxHeight - 10;

    context.fillStyle = "rgba(5, 10, 18, 0.82)";
    roundRect(context, x, y, boxWidth, boxHeight, 16);
    context.fill();
    context.strokeStyle = colorAlpha(target.color, 0.72);
    context.lineWidth = 1.4;
    context.stroke();
    context.fillStyle = "#f7f1de";
    target.labelLines.forEach(function (line, index) {
      context.fillText(
        line,
        x + paddingX,
        y + paddingY + 14 + index * lineHeight,
      );
    });
    context.restore();
  }

  function drawBullets() {
    bullets.forEach(function (bullet) {
      context.save();
      context.fillStyle = "#fff6d8";
      context.shadowBlur = 14;
      context.shadowColor = "#ffd06e";
      context.beginPath();
      context.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
      context.fill();
      context.restore();
    });
  }

  function drawShip(frameTime) {
    const thrusterScale = input.left || input.right || input.fire
      ? 1 + Math.sin(frameTime / 70) * 0.28
      : 0.4;
    context.save();
    context.translate(ship.x, ship.y);
    context.beginPath();
    context.moveTo(0, -ship.height);
    context.lineTo(ship.width * 0.62, ship.height * 0.7);
    context.lineTo(0, ship.height * 0.18);
    context.lineTo(-ship.width * 0.62, ship.height * 0.7);
    context.closePath();
    const body = context.createLinearGradient(
      -ship.width * 0.6,
      0,
      ship.width * 0.6,
      0,
    );
    body.addColorStop(0, "#5ee0da");
    body.addColorStop(0.5, "#f9f0d3");
    body.addColorStop(1, "#ff8a4e");
    context.fillStyle = body;
    context.fill();
    context.lineWidth = 2;
    context.strokeStyle = "rgba(255, 255, 255, 0.6)";
    context.stroke();

    context.fillStyle = "rgba(10, 16, 24, 0.88)";
    context.beginPath();
    context.moveTo(0, -ship.height * 0.42);
    context.lineTo(ship.width * 0.18, ship.height * 0.1);
    context.lineTo(-ship.width * 0.18, ship.height * 0.1);
    context.closePath();
    context.fill();

    context.fillStyle = "rgba(255, 179, 93, 0.88)";
    context.beginPath();
    context.moveTo(-ship.width * 0.16, ship.height * 0.24);
    context.lineTo(0, ship.height * (0.72 + thrusterScale * 0.45));
    context.lineTo(ship.width * 0.16, ship.height * 0.24);
    context.closePath();
    context.fill();
    context.restore();
  }

  function drawParticles() {
    particles.forEach(function (particle) {
      context.save();
      context.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      context.fillStyle = particle.color;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      context.fill();
      context.restore();
    });
  }

  function drawBanner(frameTime) {
    if (frameTime > state.bannerExpiresAt) {
      return;
    }

    const remaining = (state.bannerExpiresAt - frameTime) / 1000;
    const opacity = Math.min(1, remaining * 1.6);

    context.save();
    context.globalAlpha = opacity;
    context.fillStyle = "rgba(5, 10, 18, 0.78)";
    roundRect(
      context,
      canvas.width * 0.18,
      canvas.height * 0.06,
      canvas.width * 0.64,
      canvas.height * 0.12,
      22,
    );
    context.fill();
    context.strokeStyle = "rgba(255, 255, 255, 0.14)";
    context.lineWidth = 1.4;
    context.stroke();

    context.fillStyle = "#ffd66c";
    context.font = "800 22px 'Trebuchet MS', sans-serif";
    context.fillText(
      state.bannerTitle,
      canvas.width * 0.21,
      canvas.height * 0.115,
    );
    context.fillStyle = "#e6edf4";
    context.font = "500 14px 'Avenir Next', sans-serif";
    context.fillText(
      state.bannerDetail,
      canvas.width * 0.21,
      canvas.height * 0.15,
    );
    context.restore();
  }

  function spawnBurst(x, y, color, count, power) {
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + Math.random() * 0.28;
      const speed =
        (canvas.width * 0.08 + Math.random() * canvas.width * 0.14) * power;

      particles.push({
        x: x,
        y: y,
        velocityX: Math.cos(angle) * speed,
        velocityY: Math.sin(angle) * speed,
        radius: Math.random() * 4 + 1.6,
        color: index % 3 === 0 ? "#fff2ca" : color,
        life: reducedMotion ? 0.28 : 0.52 + Math.random() * 0.26,
        maxLife: reducedMotion ? 0.28 : 0.52 + Math.random() * 0.26,
      });
    }
  }

  function roundRect(ctx, x, y, width, height, radius) {
    const size = Math.min(radius, width / 2, height / 2);

    ctx.beginPath();
    ctx.moveTo(x + size, y);
    ctx.arcTo(x + width, y, x + width, y + height, size);
    ctx.arcTo(x + width, y + height, x, y + height, size);
    ctx.arcTo(x, y + height, x, y, size);
    ctx.arcTo(x, y, x + width, y, size);
    ctx.closePath();
  }

  function colorAlpha(color, alpha) {
    const hex = color.replace("#", "");
    const value = hex.length === 3
      ? hex.split("").map(function (part) {
        return part + part;
      }).join("")
      : hex;
    const red = Number.parseInt(value.slice(0, 2), 16);
    const green = Number.parseInt(value.slice(2, 4), 16);
    const blue = Number.parseInt(value.slice(4, 6), 16);

    return "rgba(" +
      String(red) +
      ", " +
      String(green) +
      ", " +
      String(blue) +
      ", " +
      String(alpha) +
      ")";
  }

  function formatError(error) {
    return error instanceof Error ? error.message : String(error);
  }

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
  }

  function shuffle(values) {
    const copy = values.slice();

    for (let index = copy.length - 1; index > 0; index -= 1) {
      const nextIndex = Math.floor(Math.random() * (index + 1));
      const current = copy[index];
      copy[index] = copy[nextIndex];
      copy[nextIndex] = current;
    }

    return copy;
  }

  function seedFromString(text) {
    let value = 0;

    for (let index = 0; index < text.length; index += 1) {
      value = (value * 31 + text.charCodeAt(index)) >>> 0;
    }

    return value || 1;
  }

  function mulberry32(seed) {
    return function () {
      let next = seed += 0x6d2b79f5;
      next = Math.imul(next ^ next >>> 15, next | 1);
      next ^= next + Math.imul(next ^ next >>> 7, next | 61);
      return ((next ^ next >>> 14) >>> 0) / 4294967296;
    };
  }
})();
