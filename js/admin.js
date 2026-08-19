/* ============================================================
   CYBER GRID :: ADMIN LOGIC
   ============================================================ */

(function () {
  // ---------------- PIN GATE ----------------
  const pinGate = document.getElementById("pin-gate");
  const adminApp = document.getElementById("admin-app");
  const pinInput = document.getElementById("pin-input");
  const pinError = document.getElementById("pin-error");

  function tryUnlock() {
    if (pinInput.value === ADMIN_PIN) {
      pinGate.style.display = "none";
      adminApp.style.display = "flex";
      bootAdmin();
    } else {
      pinError.textContent = "Incorrect PIN.";
      pinInput.value = "";
      pinInput.focus();
    }
  }
  document.getElementById("pin-submit").addEventListener("click", tryUnlock);
  pinInput.addEventListener("keydown", e => { if (e.key === "Enter") tryUnlock(); });
  document.getElementById("lock-btn").addEventListener("click", () => {
    adminApp.style.display = "none";
    pinGate.style.display = "flex";
    pinInput.value = "";
    pinInput.focus();
  });

  // ---------------- ADMIN APP STATE (local + mirrored from Firebase) ----------------
  const VOTE_DURATION_MS = 40000;  // 40-second countdown for each vote phase

  let state = null;             // last known shared game state
  let setupSide = "blue";       // which bank is showing during setup
  let setupSelectedPieceId = null;
  let cardFilterSide = "blue";
  let selectedCardId = null;
  let selectedCell = null;      // currently selected piece's cell during play
  let pendingMove = null;       // { fromCell, toCell, type: 'move'|'clash' }
  let bootStarted = false;
  let countdownInterval = null; // setInterval handle for local countdown tick

  fetch("assets/icons/sprite.svg")
    .then(r => r.text())
    .then(svg => { document.getElementById("sprite-mount").innerHTML = svg; })
    .catch(err => console.error("sprite load failed", err));

  // ---------------- BOARD SQUARE-FIT ----------------
  // CSS alone (flex + aspect-ratio) can't reliably size a square that fits
  // BOTH the available width and the available height at once when the two
  // budgets differ (e.g. a wide-but-short window, or a narrow side-panel
  // column) — some browsers stretch one axis via flex-grow and only clamp
  // the other, leaving a non-square, possibly overflowing board. This pins
  // the board to whichever budget is smaller so it always fits on screen.
  function fitSquareBoard(boardEl) {
    if (!boardEl) return;
    const wrap = boardEl.parentElement; // .section-body
    if (!wrap) return;
    // Clear any previous clamp so the width/height we measure below reflect
    // the wrapper's true available space, not a stale prior square.
    boardEl.style.width = "";
    boardEl.style.height = "";
    let siblingsHeight = 0;
    Array.from(wrap.children).forEach(child => {
      if (child !== boardEl) siblingsHeight += child.getBoundingClientRect().height;
    });
    const wrapCs = getComputedStyle(wrap);
    const gap = parseFloat(wrapCs.rowGap) || 0;
    const gapCount = Math.max(0, wrap.children.length - 1);
    // clientWidth/clientHeight include the wrapper's own padding, but a
    // child's box is laid out inside that padding (the content box) —
    // subtract it so the square isn't over-measured.
    const padX = (parseFloat(wrapCs.paddingLeft) || 0) + (parseFloat(wrapCs.paddingRight) || 0);
    const padY = (parseFloat(wrapCs.paddingTop) || 0) + (parseFloat(wrapCs.paddingBottom) || 0);
    const availableHeight = (wrap.clientHeight - padY) - siblingsHeight - gap * gapCount;
    const availableWidth = wrap.clientWidth - padX;
    const size = Math.max(0, Math.floor(Math.min(availableWidth, availableHeight)));
    if (size > 0) {
      boardEl.style.width = size + "px";
      boardEl.style.height = size + "px";
    }
  }
  let boardFitResizeQueued = false;
  function scheduleBoardFit() {
    if (boardFitResizeQueued) return;
    boardFitResizeQueued = true;
    requestAnimationFrame(() => {
      boardFitResizeQueued = false;
      fitSquareBoard(document.getElementById("admin-board"));
    });
  }
  window.addEventListener("resize", scheduleBoardFit);
  // Re-fit once more after every resource (fonts, icon sprite) has
  // finished loading — a late swap can shift sibling heights slightly
  // after the very first fit runs.
  window.addEventListener("load", scheduleBoardFit);

  function bootAdmin() {
    if (bootStarted) return;
    bootStarted = true;
    buildAdminBoardSkeleton();
    scheduleBoardFit();
    setupSideToggle("blue");
    cardFilterToggle("blue");
    wireToolbar();
    wireDetectionControls();
    wireOTControls();
    wireReportButton();
    wireResolvePanel();

    FireState.subscribe((s, err) => {
      if (err) {
        setConn(false);
        console.error(err);
        return;
      }
      setConn(true);
      if (!s) {
        state = buildEmptyState();
        FireState.set(state);
        return;
      }
      state = s;
      if (!state.board) state.board = {};
      // Keep the active game pack in sync with this game's mode (Stage 2)
      if (state.mode) setActivePack(state.mode);
      renderEverything();
      checkQuorum();   // check on every state update
    });

    wireVotingPanel();
  }

  function wireVotingPanel() {
    document.getElementById("vote-config-save-btn").addEventListener("click", () => {
      const blueExp = parseInt(document.getElementById("vote-blue-expected").value, 10) || 5;
      const redExp  = parseInt(document.getElementById("vote-red-expected").value, 10) || 5;
      FireState.update({ votingConfig: { blueExpected: blueExp, redExpected: redExp, enabled: true } });
      logEvent("system", `Voter counts updated — Blue: ${blueExp}, Red: ${redExp}. Quorum = 50%+1 each side.`);
    });

    document.getElementById("vote-apply-btn").addEventListener("click", () => {
      const votePhase = state && state.votePhase || "move";
      if (votePhase === "card") {
        applyWinningVote(true);  // Round 2: apply winning card
      } else {
        const moveTally = buildMoveTally(state.turn);
        const sorted = Object.entries(moveTally).sort((a, b) => b[1] - a[1]);
        if (sorted.length) applyWinningMove(sorted[0][0]);  // Round 1: apply winning move
      }
    });

    document.getElementById("open-voting-btn").addEventListener("click", () => {
      if (!state || state.phase !== "playing") return;
      openVoting();
    });

    document.getElementById("timer-reset-btn").addEventListener("click", () => {
      startVoteCountdown();
    });

    document.getElementById("vote-reset-btn").addEventListener("click", () => {
      if (!state) return;
      const currentTurnKey = state.turnKey || ("t" + (state.turnNumber||1) + "-" + (state.turn||"blue"));
      FireState.update({ votes: {} });
      logEvent("system", "Votes manually reset by admin.");
    });
  }

  function setConn(online) {
    const dot = document.getElementById("conn-dot");
    const text = document.getElementById("conn-text");
    dot.className = "conn-dot " + (online ? "online" : "offline");
    text.textContent = online ? "live" : "disconnected / not configured";
  }

  // ---------------- TOOLBAR ----------------
  function wireToolbar() {
    document.getElementById("new-game-btn").addEventListener("click", () => {
      openModeChooser((mode) => {
        confirmAction(
          "Start a brand new game?",
          `This starts a new ${mode.toUpperCase()} game, clears the board, and randomly re-deploys all pieces. Click Start Game when ready.`,
          () => {
            setActivePack(mode);
            state = buildEmptyState(mode);
            selectedCell = null; setupSelectedPieceId = null;
            // randomSetup writes to Firebase — call after resetting local state
            randomSetup();
          }
        );
      });
    });

    document.getElementById("reset-game-btn").addEventListener("click", () => {
      confirmAction(
        "Reset the board?",
        "This clears all placed pieces but keeps you in setup phase.",
        () => {
          state.board = {};
          state.phase = "setup";
          state.winner = null; state.winReason = null;
          state.detectionMeter = 0;
          FireState.set(state);
        }
      );
    });

    document.getElementById("start-game-btn").addEventListener("click", () => {
      state.phase = "playing";
      state.turn = "blue";
      state.turnNumber = 1;
      state.turnKey = "t1-blue";
      state.votes = {};
      logEvent("system", "Setup complete. The simulation begins — Blue moves first.");
      FireState.update({ phase: "playing", turn: "blue", turnNumber: 1, turnKey: "t1-blue", votes: {}, votePhase: "move", voteDeadline: null, pendingClashMove: null });
    });

    document.getElementById("random-setup-btn").addEventListener("click", () => {
      if (state && state.phase !== "setup") {
        flashHint("Random setup is only available during the Setup phase. Click New Game first.");
        return;
      }
      randomSetup();
    });

    document.getElementById("end-turn-btn").addEventListener("click", () => {
      const next = state.turn === "blue" ? "red" : "blue";
      const nextTurnNumber = next === "blue" ? (state.turnNumber || 1) + 1 : state.turnNumber || 1;
      const nextTurnKey = "t" + nextTurnNumber + "-" + next;
      selectedCell = null; selectedCardId = null;
      const boardCopy = { ...state.board };
      const recovered = tickStandDowns(boardCopy, next);
      state.board = boardCopy;
      recovered.forEach(u => logEvent(next, `${pieceLabel(u)} is back on duty.`));
      FireState.update({ board: boardCopy, turn: next, turnNumber: nextTurnNumber, turnKey: nextTurnKey, activeScenario: null, votes: {}, votePhase: "move", voteDeadline: null, pendingClashMove: null });
      if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
      const wrap = document.getElementById("admin-timer-wrap");
      if (wrap) wrap.style.display = "none";
    });
  }

  /**
   * Randomly place all Blue and Red pieces in their respective deployment zones.
   * Blue gets BLUE_SETUP_ROWS, Red gets RED_SETUP_ROWS (a single NEUTRAL_ROWS
   * row — the DMZ — separates them). Cell counts are sized to each side's
   * roster, with any leftover cells in a zone left empty at random.
   * Pieces are shuffled before placement so every run produces a unique layout.
   * After placement, each side's front row (the row nearest the DMZ) has its
   * movable pieces revealed on the public board — everything else stays locked.
   */
  function randomSetup() {
    function shuffle(arr) {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    const board = {};

    // --- Build Blue instances and shuffle ---
    const blueInstances = [];
    BLUE_PIECES.forEach(p => {
      for (let i = 0; i < p.count; i++) {
        blueInstances.push({ side: "blue", pieceId: p.id, instanceId: `blue-${p.id}-${i+1}`, revealed: false, eliminated: false, standDownTurnsLeft: 0 });
      }
    });
    const shuffledBlue = shuffle(blueInstances);

    // Blue cells: all cells in BLUE_SETUP_ROWS, also shuffled so pieces land in random positions
    const blueCells = shuffle(
      BLUE_SETUP_ROWS.flatMap(row => Array.from({ length: BOARD_SIZE }, (_, col) => cellKey(row, col)))
    );
    shuffledBlue.forEach((piece, i) => { board[blueCells[i]] = piece; });

    // --- Build Red instances and shuffle ---
    const redInstances = [];
    RED_PIECES.forEach(p => {
      for (let i = 0; i < p.count; i++) {
        redInstances.push({ side: "red", pieceId: p.id, instanceId: `red-${p.id}-${i+1}`, revealed: false, eliminated: false, standDownTurnsLeft: 0 });
      }
    });
    const shuffledRed = shuffle(redInstances);

    // Red cells: pick as many random cells from RED_SETUP_ROWS as Red has pieces
    const redCells = shuffle(
      RED_SETUP_ROWS.flatMap(row => Array.from({ length: BOARD_SIZE }, (_, col) => cellKey(row, col)))
    ).slice(0, shuffledRed.length); // take only as many cells as there are pieces
    shuffledRed.forEach((piece, i) => { board[redCells[i]] = piece; });

    // Reveal each side's front row (the setup row nearest the DMZ) so the
    // Participants view shows real movable-piece icons there instead of
    // locked ones. Non-movable pieces (e.g. the objective) stay hidden even
    // if they land on the front row. Everything behind the front row stays
    // locked until the existing reveal-on-clash rules uncover it.
    const blueFrontRow = Math.min(...BLUE_SETUP_ROWS);
    const redFrontRow = Math.max(...RED_SETUP_ROWS);
    Object.entries(board).forEach(([key, unit]) => {
      const { row } = parseCellKey(key);
      const def = GameEngine.findPieceDef(unit.pieceId);
      const isFrontRow = (unit.side === "blue" && row === blueFrontRow) ||
                          (unit.side === "red" && row === redFrontRow);
      if (isFrontRow && def && def.movable !== false) {
        unit.revealed = true;
      }
    });

    // Write fresh state with the populated board, preserving the chosen mode
    const currentMode = (state && state.mode) || ACTIVE_MODE || DEFAULT_MODE;
    const newState = buildEmptyState(currentMode);
    newState.board = board;
    state = newState;
    FireState.set(newState);
    logEvent("system", "Pieces randomly deployed. Front-row units revealed. Review positions then click Start Game.");
  }

  function confirmAction(title, body, onConfirm) {
    const modal = document.getElementById("confirm-modal");
    document.getElementById("confirm-title").textContent = title;
    document.getElementById("confirm-body").textContent = body;
    modal.style.display = "flex";
    const okBtn = document.getElementById("confirm-ok");
    const cancelBtn = document.getElementById("confirm-cancel");
    function cleanup() { modal.style.display = "none"; okBtn.removeEventListener("click", onOk); cancelBtn.removeEventListener("click", onCancel); }
    function onOk() { cleanup(); onConfirm(); }
    function onCancel() { cleanup(); }
    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
  }

  /** Open the exercise-mode chooser; calls onChoose(mode) when a mode is picked. */
  function openModeChooser(onChoose) {
    const modal = document.getElementById("mode-modal");
    if (!modal) { onChoose(DEFAULT_MODE); return; }  // graceful fallback
    modal.style.display = "flex";
    const btns = Array.from(modal.querySelectorAll(".mode-choice-btn"));
    const cancelBtn = document.getElementById("mode-cancel");
    function cleanup() {
      modal.style.display = "none";
      btns.forEach(b => b.removeEventListener("click", onPick));
      cancelBtn.removeEventListener("click", onCancel);
    }
    function onPick(e) {
      const mode = e.currentTarget.getAttribute("data-mode");
      if (!mode || e.currentTarget.disabled) return;
      cleanup();
      onChoose(mode);
    }
    function onCancel() { cleanup(); }
    btns.forEach(b => b.addEventListener("click", onPick));
    cancelBtn.addEventListener("click", onCancel);
  }

  // ---------------- SETUP: PIECE BANK ----------------
  function setupSideToggle(side) {
    setupSide = side;
    setupSelectedPieceId = null;
    document.getElementById("setup-side-blue").classList.toggle("btn-ghost", side !== "blue");
    document.getElementById("setup-side-red").classList.toggle("btn-ghost", side !== "red");
    renderSetupBank();
  }
  document.getElementById("setup-side-blue").addEventListener("click", () => setupSideToggle("blue"));
  document.getElementById("setup-side-red").addEventListener("click", () => setupSideToggle("red"));
  document.getElementById("setup-clear-selection").addEventListener("click", () => {
    setupSelectedPieceId = null;
    renderSetupBank();
  });

  function placedCountFor(side, pieceId) {
    if (!state || !state.board) return 0;
    return Object.values(state.board).filter(u => u && u.side === side && u.pieceId === pieceId && !u.eliminated).length;
  }

  function renderSetupBank() {
    const roster = setupSide === "blue" ? BLUE_PIECES : RED_PIECES;
    const bank = document.getElementById("setup-bank");
    bank.innerHTML = "";
    roster.forEach(p => {
      const used = placedCountFor(setupSide, p.id);
      const left = p.count - used;
      const btn = document.createElement("div");
      btn.className = "setup-piece-btn" + (setupSelectedPieceId === p.id ? " selected" : "");
      btn.style.opacity = left <= 0 ? 0.35 : 1;
      btn.innerHTML = `<svg><use href="#icon-${p.icon}"></use></svg><span>${p.short}</span><span class="left">${left}/${p.count}</span>`;
      btn.addEventListener("click", () => {
        if (left <= 0) return;
        // Keep the piece selected on repeat clicks so the facilitator can place
        // several of the same type in a row without re-selecting each time.
        setupSelectedPieceId = p.id;
        renderSetupBank();
      });
      bank.appendChild(btn);
    });
  }

  // ---------------- ADMIN BOARD ----------------
  function buildAdminBoardSkeleton() {
    const boardEl = document.getElementById("admin-board");
    boardEl.innerHTML = "";
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const cell = document.createElement("div");
        cell.className = "admin-cell";
        cell.dataset.row = row; cell.dataset.col = col;
        cell.id = `admin-cell-${row}-${col}`;
        const coord = document.createElement("div");
        coord.className = "cell-coord-admin";
        coord.textContent = cellKey(row, col);
        cell.appendChild(coord);
        cell.addEventListener("click", () => onCellClick(row, col));
        boardEl.appendChild(cell);
      }
    }
  }

  function onCellClick(row, col) {
    if (!state) return;
    const key = cellKey(row, col);

    // ----- SETUP PHASE: place pieces -----
    if (state.phase === "setup") {
      if (!setupSelectedPieceId) return;
      const zone = zoneForRow(row);
      if (zone !== setupSide) {
        flashHint(`${setupSide === "blue" ? "Blue" : "Red"} can only deploy in their own rows.`);
        return;
      }
      if (state.board[key]) {
        flashHint("That cell is already occupied.");
        return;
      }
      const usedCount = placedCountFor(setupSide, setupSelectedPieceId);
      const instanceId = `${setupSide}-${setupSelectedPieceId}-${usedCount + 1}`;
      state.board[key] = {
        side: setupSide,
        pieceId: setupSelectedPieceId,
        instanceId,
        revealed: false,
        eliminated: false,
        standDownTurnsLeft: 0
      };
      FireState.update({ board: state.board });
      renderSetupBank();
      checkSetupComplete();
      return;
    }

    // ----- PLAYING PHASE: select / move / clash -----
    if (state.phase === "playing") {
      const unit = state.board[key];

      if (!selectedCell) {
        // selecting a piece to move — must belong to current turn's side
        if (!unit) return;
        if (unit.side !== state.turn) {
          flashHint(`It's ${state.turn.toUpperCase()}'s turn.`);
          return;
        }
        const def = GameEngine.findPieceDef(unit.pieceId);
        if (def && def.movable === false) {
          flashHint("This piece cannot move.");
          return;
        }
        if (unit.standDownTurnsLeft > 0) {
          flashHint(`Stood down — back on duty in ${unit.standDownTurnsLeft} more of ${unit.side === "blue" ? "Blue" : "Red"}'s turn(s).`);
          return;
        }
        if (!hasLegalAdjacentMove(key)) {
          flashHint("Boxed in — every adjacent cell is occupied by a friendly piece. Pick a different piece.");
          return;
        }
        selectedCell = key;
        renderAdminBoard();
        return;
      }

      // a piece is already selected
      if (key === selectedCell) {
        selectedCell = null;
        renderAdminBoard();
        return;
      }

      const fromUnit = state.board[selectedCell];
      const targetUnit = state.board[key];

      if (!isAdjacent(selectedCell, key)) {
        flashHint("Pieces move one square (orthogonal) per turn.");
        return;
      }

      // treat eliminated pieces as empty — the cell is open to move into
      if (!targetUnit || targetUnit.eliminated) {
        // simple move
        pendingMove = { fromCell: selectedCell, toCell: key, type: "move" };
        completeSimpleMove();
        return;
      }

      if (targetUnit.side === fromUnit.side) {
        flashHint("Can't move onto your own piece.");
        return;
      }

      // Validate the engagement makes sense (technical attackers can't clash with humans)
      const attackerId = fromUnit.side === state.turn ? fromUnit.pieceId : targetUnit.pieceId;
      const defenderId = fromUnit.side === state.turn ? targetUnit.pieceId : fromUnit.pieceId;
      const engagement = GameEngine.canEngage(attackerId, defenderId);
      if (!engagement.allowed) {
        flashHint("⚠ Invalid target: " + engagement.reason);
        logEvent("system", "Blocked engagement — " + engagement.reason);
        return;
      }

      // clash setup — open the resolve panel
      pendingMove = { fromCell: selectedCell, toCell: key, type: "clash" };
      openResolvePanel();
    }
  }

  function isAdjacent(keyA, keyB) {
    const a = parseCellKey(keyA), b = parseCellKey(keyB);
    const dr = Math.abs(a.row - b.row), dc = Math.abs(a.col - b.col);
    return (dr + dc) === 1;
  }

  /** Returns true if the piece at `key` has at least one adjacent cell that's
   *  empty or holds an enemy piece (i.e. a legal move or clash exists). */
  function hasLegalAdjacentMove(key) {
    const { row, col } = parseCellKey(key);
    const unit = state.board[key];
    if (!unit) return false;
    const neighbors = [[row-1,col],[row+1,col],[row,col-1],[row,col+1]];
    return neighbors.some(([r, c]) => {
      if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return false;
      const occupant = state.board[cellKey(r, c)];
      // treat eliminated pieces as empty — they no longer occupy the cell
      if (!occupant || occupant.eliminated) return true;
      return occupant.side !== unit.side;
    });
  }

  function completeSimpleMove() {
    const { fromCell, toCell } = pendingMove;
    const unit = state.board[fromCell];
    const boardCopy = { ...state.board };
    boardCopy[toCell] = unit;
    delete boardCopy[fromCell];
    state.board = boardCopy;
    logEvent(unit.side, `${pieceLabel(unit)} advances to ${toCell}.`);
    FireState.update({ board: boardCopy });
    selectedCell = null;
    pendingMove = null;
    renderAdminBoard();
    autoEndTurn();
  }

  /** End the current turn automatically after a move or clash completes.
   *  Skips if the game has already ended (win condition triggered this action). */
  function autoEndTurn() {
    if (!state || state.phase !== "playing") return;
    const next = state.turn === "blue" ? "red" : "blue";
    const nextTurnNumber = next === "blue" ? (state.turnNumber || 1) + 1 : state.turnNumber || 1;
    const nextTurnKey = "t" + nextTurnNumber + "-" + next;
    selectedCell = null;
    selectedCardId = null;
    setTimeout(() => {
      if (!state || state.phase !== "playing") return;
      const boardCopy = { ...state.board };
      const recovered = tickStandDowns(boardCopy, next);
      state.board = boardCopy;
      FireState.update({ board: boardCopy, turn: next, turnNumber: nextTurnNumber, turnKey: nextTurnKey, activeScenario: null, votes: {}, votePhase: "move", voteDeadline: null, pendingClashMove: null });
      recovered.forEach(u => logEvent(next, `${pieceLabel(u)} is back on duty.`));
      logEvent("system", `Turn ended — now ${next.toUpperCase()}'s turn (#${nextTurnNumber}). Click "Open Voting" when ready.`);
      setStat("turnsPlayed", (state.stats && state.stats.turnsPlayed || 0) + 1);
      // Clear any running countdown
      if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
      const wrap = document.getElementById("admin-timer-wrap");
      if (wrap) wrap.style.display = "none";
    }, 1200);
  }

  function pieceLabel(unit) {
    const def = GameEngine.findPieceDef(unit.pieceId);
    return unit.revealed ? (def?.name || unit.pieceId) : `Unidentified ${unit.side === "blue" ? "defender" : "threat actor"} unit`;
  }

  function checkSetupComplete() {
    const blueMissing = BLUE_PIECES.filter(p => placedCountFor("blue", p.id) !== p.count);
    const redMissing = RED_PIECES.filter(p => placedCountFor("red", p.id) !== p.count);
    const blueDone = blueMissing.length === 0;
    const redDone = redMissing.length === 0;
    document.getElementById("start-game-btn").disabled = !(blueDone && redDone);

    const totalNeeded = BLUE_PIECES.reduce((s, p) => s + p.count, 0) + RED_PIECES.reduce((s, p) => s + p.count, 0);
    const totalPlaced = BLUE_PIECES.reduce((s, p) => s + placedCountFor("blue", p.id), 0)
                       + RED_PIECES.reduce((s, p) => s + placedCountFor("red", p.id), 0);

    const pill = document.getElementById("setup-progress-pill");
    const text = document.getElementById("setup-progress-text");
    if (state.phase === "setup") {
      pill.style.display = "inline-flex";
      pill.className = "pill" + (blueDone && redDone ? " pill-green" : " pill-amber");
      if (blueDone && redDone) {
        text.textContent = `${totalPlaced}/${totalNeeded} placed — ready to start`;
      } else {
        const missingParts = [];
        if (!blueDone) missingParts.push("Blue: " + blueMissing.map(p => p.short + " " + placedCountFor("blue", p.id) + "/" + p.count).join(", "));
        if (!redDone) missingParts.push("Red: " + redMissing.map(p => p.short + " " + placedCountFor("red", p.id) + "/" + p.count).join(", "));
        text.textContent = `${totalPlaced}/${totalNeeded} placed — missing ${missingParts.join(" | ")}`;
      }
    } else {
      pill.style.display = "none";
    }
  }

  function flashHint(msg) {
    const hint = document.getElementById("board-hint");
    const old = hint.textContent;
    hint.textContent = msg;
    hint.style.color = "var(--amber)";
    setTimeout(() => { hint.textContent = old; hint.style.color = ""; }, 2200);
  }

  // ---------------- RENDERING ----------------
  function renderEverything() {
    renderAdminBoard();
    renderRosterAdmin();
    renderDetection();
    renderOTControls();
    renderReportButton();
    renderCardList();
    renderAdminLog();
    renderPhaseUI();
    renderTurnInstruction();
    renderVoteTally();
    syncVotingConfigUI();
  }

  function renderAdminBoard() {
    document.querySelectorAll(".admin-cell").forEach(c => {
      c.classList.remove("selected", "target-valid", "target-clash");
      const existing = c.querySelector(".admin-piece");
      if (existing) existing.remove();
    });

    const board = (state && state.board) || {};
    Object.entries(board).forEach(([key, unit]) => {
      if (!unit || unit.eliminated) return;
      const { row, col } = parseCellKey(key);
      const cellEl = document.getElementById(`admin-cell-${row}-${col}`);
      if (!cellEl) return;
      const def = GameEngine.findPieceDef(unit.pieceId);
      const piece = document.createElement("div");
      const stoodDown = unit.standDownTurnsLeft > 0;
      piece.className = `admin-piece ${unit.side}${stoodDown ? " stood-down" : ""}`;

      const isCurrentTurnSide = state.phase === "playing" && unit.side === state.turn;
      const isImmovableType = def && def.movable === false;
      if (isCurrentTurnSide && !isImmovableType && !stoodDown && !hasLegalAdjacentMove(key)) {
        piece.className += " boxed-in";
        piece.title = "Boxed in — no legal move this turn";
      } else if (stoodDown) {
        piece.title = `Stood down — back on duty in ${unit.standDownTurnsLeft} more of ${unit.side === "blue" ? "Blue" : "Red"}'s turn(s)`;
      }

      piece.innerHTML = `<svg><use href="#icon-${def?.icon || "shield"}"></use></svg><span class="rank-badge">${def?.short || "?"}</span>`;
      if (stoodDown) {
        const badge = document.createElement("span");
        badge.className = "stand-down-turns-badge";
        badge.textContent = unit.standDownTurnsLeft;
        piece.appendChild(badge);
      }
      cellEl.appendChild(piece);
    });

    if (selectedCell && state.board[selectedCell]) {
      const { row, col } = parseCellKey(selectedCell);
      document.getElementById(`admin-cell-${row}-${col}`)?.classList.add("selected");
      // highlight adjacent cells — treat eliminated pieces as empty (they're gone from the board)
      [[row-1,col],[row+1,col],[row,col-1],[row,col+1]].forEach(([r,c]) => {
        if (r<0||r>=BOARD_SIZE||c<0||c>=BOARD_SIZE) return;
        const k = cellKey(r,c);
        const targetCellEl = document.getElementById(`admin-cell-${r}-${c}`);
        if (!targetCellEl) return;
        const occ = board[k];
        const isEffectivelyEmpty = !occ || occ.eliminated;
        if (isEffectivelyEmpty) targetCellEl.classList.add("target-valid");
        else if (occ.side !== state.board[selectedCell].side) targetCellEl.classList.add("target-clash");
      });
    }

    renderTurnInstruction();
  }

  function renderRosterAdmin() {
    ["blue", "red"].forEach(side => {
      const roster = side === "blue" ? BLUE_PIECES : RED_PIECES;
      const container = document.getElementById(`${side}-roster-admin`);
      container.innerHTML = roster.map(p => {
        const elimCount = eliminatedCountFor(side, p.id);
        const left = p.count - elimCount;

        let style = "display:flex;justify-content:space-between;padding:2px 0;";
        let color = "";
        if (left === 0) {
          // all of this type gone — grey strikethrough
          style += "opacity:.3;text-decoration:line-through;";
          color = "color:var(--text-low);";
        } else if (elimCount > 0) {
          // some gone but not all — amber warning
          color = "color:var(--amber);";
        }

        return `<div style="${style}${color}"><span>${p.short} &middot; ${p.name}</span><span>${left}/${p.count}</span></div>`;
      }).join("");
    });
  }

  function eliminatedCountFor(side, pieceId) {
    if (!state) return 0;
    if (state.phase === "setup") return 0;
    return (state.eliminated && state.eliminated[side] && state.eliminated[side][pieceId]) || 0;
  }

  function bumpEliminated(side, pieceId) {
    state.eliminated = state.eliminated || { blue: {}, red: {} };
    state.eliminated[side] = state.eliminated[side] || {};
    state.eliminated[side][pieceId] = (state.eliminated[side][pieceId] || 0) + 1;
  }

  /** True if `side` has at least one human-nature piece on the board that
   *  is neither eliminated nor currently stood down — i.e. someone is
   *  actually available to operate/monitor that side's systems. */
  function sideHasActiveHuman(side, board) {
    return Object.values(board || (state && state.board) || {}).some(u => {
      if (!u || u.side !== side || u.eliminated || u.standDownTurnsLeft > 0) return false;
      const def = GameEngine.findPieceDef(u.pieceId);
      return def && def.nature === "human";
    });
  }

  /** Decrement standDownTurnsLeft for every one of `side`'s units on
   *  `board` (mutated in place) as that side's turn comes up. Returns the
   *  units that just reached 0 (recovered) so callers can log it. */
  function tickStandDowns(board, side) {
    const recovered = [];
    Object.values(board).forEach(u => {
      if (u && u.side === side && u.standDownTurnsLeft > 0) {
        u.standDownTurnsLeft -= 1;
        if (u.standDownTurnsLeft === 0) recovered.push(u);
      }
    });
    return recovered;
  }

  function renderDetection() {
    const pct = Math.max(0, Math.min(100, (state && state.detectionMeter) || 0));
    document.getElementById("detection-fill").style.width = pct + "%";
    document.getElementById("detection-pct").textContent = pct + "%";
  }

  function renderPhaseUI() {
    document.getElementById("phase-text").textContent = (state.phase || "setup").toUpperCase();
    document.getElementById("end-turn-btn").disabled = state.phase !== "playing";
    document.getElementById("open-voting-btn").disabled = state.phase !== "playing";
    document.getElementById("start-game-btn").style.display = state.phase === "setup" ? "inline-block" : "none";
    document.getElementById("setup-panel").style.opacity = state.phase === "setup" ? 1 : 0.4;
    document.getElementById("setup-panel").style.pointerEvents = state.phase === "setup" ? "auto" : "none";
    if (state.phase === "setup") checkSetupComplete();
  }

  function renderTurnInstruction() {
    const el = document.getElementById("turn-instruction");
    if (!el || !state) return;
    // Instruction text length/wrapping affects how much vertical room is
    // left for the board — re-fit after this render pass completes.
    scheduleBoardFit();

    if (state.phase === "setup") {
      el.className = "turn-instruction";
      el.innerHTML = `<span class="step-num">i</span> Place every piece for both sides (see Setup panel), then click Start Game.`;
      return;
    }
    if (state.phase === "ended") {
      el.className = "turn-instruction step-ended";
      el.innerHTML = `<span class="step-num">&#10003;</span> Game over — click New Game to play again.`;
      return;
    }

    const turnSide = state.turn || "blue";
    const turnLabel = turnSide.toUpperCase();

    if (selectedCell && state.board[selectedCell]) {
      // Step 2 in progress: a piece is selected, waiting for a destination click.
      el.className = "turn-instruction step-move";
      el.innerHTML = `<span class="step-num">2</span> Piece selected — click a highlighted adjacent cell to move or engage.`;
      return;
    }

    if (selectedCardId && cardFilterSide === turnSide) {
      // Step 1 done: a card matching the current turn's side is armed.
      const card = SCENARIO_CARDS.find(c => c.id === selectedCardId);
      el.className = "turn-instruction step-move";
      el.innerHTML = `<span class="step-num">2</span> "${card ? card.name : "Card"}" selected for ${turnLabel} — now click that side's piece on the board, then a destination cell.`;
      return;
    }

    // Step 1: nothing armed yet for the side whose turn it is.
    el.className = "turn-instruction step-card";
    el.innerHTML = `<span class="step-num">1</span> ${turnLabel}'s turn — pick a ${turnLabel} scenario card on the right (or skip straight to the board for a plain move), then click a piece.`;
  }

  function renderAdminLog() {
    const log = (state && state.log) || {};
    const container = document.getElementById("admin-log");
    const entries = Object.values(log).sort((a, b) => (a.ts||0) - (b.ts||0)).slice(-80);
    container.innerHTML = entries.map(e => {
      const time = new Date(e.ts || Date.now()).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit", second:"2-digit" });
      return `<div class="entry">${time} &middot; ${escapeHtml(e.text || "")}</div>`;
    }).join("");
  }

  function escapeHtml(str) {
    const d = document.createElement("div"); d.textContent = str; return d.innerHTML;
  }

  function logEvent(side, text) {
    FireState.pushLog({ side, text, type: "event" });
  }

  // ---------------- SCENARIO CARDS ----------------
  function cardFilterToggle(side) {
    cardFilterSide = side;
    selectedCardId = null;
    document.getElementById("card-filter-blue").classList.toggle("btn-ghost", side !== "blue");
    document.getElementById("card-filter-red").classList.toggle("btn-ghost", side !== "red");
    renderCardList();
    renderTurnInstruction();
  }
  document.getElementById("card-filter-blue").addEventListener("click", () => cardFilterToggle("blue"));
  document.getElementById("card-filter-red").addEventListener("click", () => cardFilterToggle("red"));

  function renderCardList() {
    const list = document.getElementById("card-list");
    const cards = SCENARIO_CARDS.filter(c => c.side === cardFilterSide);
    list.innerHTML = "";
    cards.forEach(card => {
      const el = document.createElement("div");
      el.className = "scenario-card" + (selectedCardId === card.id ? " selected" : "");
      const dots = Array.from({length:5}, (_,i) => `<span class="${i < card.difficulty ? "on" : ""}"></span>`).join("");
      el.innerHTML = `
        <div class="name"><span>${card.name}</span><span class="difficulty-dots">${dots}</span></div>
        <div class="meta">${card.type.toUpperCase()} &middot; modifier ${card.modifier >= 0 ? "+" : ""}${card.modifier} &middot; detection +${card.detectionRisk}</div>
        <div class="desc">${card.description}</div>
        <div class="admin-note">${card.adminNotes}</div>
      `;
      el.addEventListener("click", () => {
        // OT restricted patching (Stage 4): the maintenance-window patch needs a token
        if (card.id === "ot_b_maintenance_patch" && state.mode === "ot" && selectedCardId !== card.id) {
          const tokens = (typeof state.maintenanceTokens === "number") ? state.maintenanceTokens : 2;
          if (tokens <= 0) {
            flashHint("⚠ No maintenance windows left — you can't freely patch production OT. Choose another play.");
            logEvent("system", "Maintenance-Window Patch blocked — no maintenance windows remaining.");
            return;
          }
        }
        selectedCardId = (selectedCardId === card.id) ? null : card.id;
        renderCardList();
        if (selectedCardId && card.type === "special") {
          handleSpecialCard(card);
        }
        if (pendingMove && pendingMove.type === "clash") updateResolvePanel();
        renderTurnInstruction();
      });
      list.appendChild(el);
    });
  }

  function handleSpecialCard(card) {
    // Non-combat cards: apply their effect immediately and log it.
    const res = GameEngine.resolveSpecial(card.id);
    if (!res) return;

    const prevDetection = state.detectionMeter || 0;
    // Clamp BOTH ends — stealth cards carry negative detectionGain.
    const newDetection = Math.max(0, Math.min(DETECTION_MAX, prevDetection + res.detectionGain));
    const delta = newDetection - prevDetection;

    // Deferred-effect stealth flags this card SETS for the next action
    const update = {
      detectionMeter: newDetection,
      activeScenario: { side: cardFilterSide, cardId: card.id }
    };
    if (res.setsSuppressNextDetection) update.suppressNextDetection = cardFilterSide;
    if (res.setsHalveNextDetection)   update.halveNextDetection = cardFilterSide;

    // OT: the "Prepare Safe-State Trip" card actually invokes the trip (Stage 4)
    if (card.id === "ot_b_safe_state" && state.mode === "ot" && !state.safeStateTripped) {
      update.safeStateTripped = true;
      logEvent("blue", "⚠ SAFE-STATE TRIP (voted) — process halted to a guaranteed-safe state. Availability sacrificed; physical-damage loss prevented.");
      state.stats = state.stats || {};
      state.stats.safeStateTripTurn = state.turnNumber || 1;
      update.stats = state.stats;
    }

    // Log — stealth plays (detection dropping, or a deferred flag) read differently
    if (card.id === "ot_b_safe_state" && update.safeStateTripped) {
      // already logged above
    } else if (delta < 0) {
      logEvent(cardFilterSide, `🕶 ${cardFilterSide.toUpperCase()} plays "${card.name}" — detection ${delta} (now ${newDetection}%). ${card.description}`);
    } else if (res.setsSuppressNextDetection) {
      logEvent(cardFilterSide, `🕶 ${cardFilterSide.toUpperCase()} plays "${card.name}" — next action will be silent (no detection).`);
    } else if (res.setsHalveNextDetection) {
      logEvent(cardFilterSide, `🕶 ${cardFilterSide.toUpperCase()} plays "${card.name}" — next action draws half the usual attention.`);
    } else {
      logEvent(cardFilterSide, `${cardFilterSide.toUpperCase()} plays "${card.name}" — ${card.description}`);
    }

    FireState.update(update);
    // Assessment tracking (Stage 5)
    if (cardFilterSide === "red" && (delta < 0 || res.setsSuppressNextDetection || res.setsHalveNextDetection)) {
      bumpStat("redStealthCards", 1);
    }
    if (cardFilterSide === "blue" && delta > 0) {
      bumpStat("blueDetectionGains", delta);
    }
    checkAndApplyWin(newDetection, state.board, false);
    selectedCardId = null;
  }

  // ---------------- CLASH RESOLUTION ----------------
  function openResolvePanel() {
    document.getElementById("roll-input").value = "";
    document.getElementById("resolve-panel").style.display = "flex";
    updateResolvePanel();
  }
  function closeResolvePanel() {
    document.getElementById("resolve-panel").style.display = "none";
    pendingMove = null;
    selectedCell = null;
    renderAdminBoard();
  }

  function wireResolvePanel() {
    document.getElementById("cancel-clash-btn").addEventListener("click", closeResolvePanel);
    document.getElementById("roll-random-btn").addEventListener("click", () => {
      document.getElementById("roll-input").value = Math.floor(Math.random()*100)+1;
      updateOddsPreview();
    });
    document.getElementById("roll-input").addEventListener("input", updateOddsPreview);
    document.getElementById("resolve-btn").addEventListener("click", applyResolution);
  }

  function currentClashCards() {
    const fromUnit = state.board[pendingMove.fromCell];
    const toUnit = state.board[pendingMove.toCell];
    const attackerCard = (selectedCardId && cardFilterSide === fromUnit.side) ? selectedCardId : null;
    return { fromUnit, toUnit, attackerCard };
  }

  function updateResolvePanel() {
    if (!pendingMove || pendingMove.type !== "clash") return;
    const { fromUnit, toUnit } = currentClashCards();
    const atkDef = GameEngine.findPieceDef(fromUnit.pieceId);
    const defDef = GameEngine.findPieceDef(toUnit.pieceId);
    const atkNature = atkDef?.nature || "human";
    const defNature = defDef?.nature || "human";
    const natureIcon = n => n === "human" ? "👤" : (n === "system" ? "🖥" : "⚙");
    document.getElementById("clash-summary").innerHTML = `
      <span style="color:var(--${fromUnit.side==='blue'?'blue':'red'}-core)">${natureIcon(atkNature)} ${atkDef?.name}</span>
      <span>vs</span>
      <span style="color:var(--${toUnit.side==='blue'?'blue':'red'}-core)">${natureIcon(defNature)} ${defDef?.name}</span>
    `;
    if (!document.getElementById("roll-input").value) {
      document.getElementById("roll-input").value = Math.floor(Math.random()*100)+1;
    }
    updateOddsPreview();
  }

  function updateOddsPreview() {
    const { fromUnit, toUnit } = currentClashCards();
    const roll = parseInt(document.getElementById("roll-input").value, 10) || 50;
    const result = GameEngine.resolveClash(
      { pieceId: fromUnit.pieceId, side: fromUnit.side, rank: GameEngine.findPieceDef(fromUnit.pieceId).rank, scenarioCardId: (selectedCardId && cardFilterSide===fromUnit.side) ? selectedCardId : null },
      { pieceId: toUnit.pieceId, side: toUnit.side, rank: GameEngine.findPieceDef(toUnit.pieceId).rank, scenarioCardId: (selectedCardId && cardFilterSide===toUnit.side) ? selectedCardId : null },
      {
        roll,
        attackerSideUnmanned: !sideHasActiveHuman(fromUnit.side),
        defenderSideUnmanned: !sideHasActiveHuman(toUnit.side)
      }
    );
    document.getElementById("odds-num").textContent = result.attackerOdds + "%";
    document.getElementById("odds-num").style.color = result.attackerOdds >= 50 ? "var(--red-core)" : "var(--blue-core)";
  }

  function applyResolution(autoRoll) {
    const { fromUnit, toUnit } = currentClashCards();
    const attackerCardId = (selectedCardId && cardFilterSide === fromUnit.side) ? selectedCardId : null;
    const defenderCardId = (selectedCardId && cardFilterSide === toUnit.side) ? selectedCardId : null;
    const roll = (typeof autoRoll === "number")
      ? autoRoll
      : (parseInt(document.getElementById("roll-input").value, 10) || Math.floor(Math.random()*100)+1);

    const atkDef = GameEngine.findPieceDef(fromUnit.pieceId);
    const defDef = GameEngine.findPieceDef(toUnit.pieceId);

    // Read any deferred stealth flags set by an earlier Red card. A flag only
    // applies if it belongs to the ATTACKER's side (stealth is an attacker tool).
    const attackerSide = fromUnit.side;
    const flags = {
      suppressNextDetection: state.suppressNextDetection === attackerSide,
      halveNextDetection: state.halveNextDetection === attackerSide
    };

    const result = GameEngine.resolveClash(
      { pieceId: fromUnit.pieceId, side: fromUnit.side, rank: atkDef.rank, scenarioCardId: attackerCardId },
      { pieceId: toUnit.pieceId, side: toUnit.side, rank: defDef.rank, scenarioCardId: defenderCardId },
      {
        roll, flags,
        attackerSideUnmanned: !sideHasActiveHuman(fromUnit.side),
        defenderSideUnmanned: !sideHasActiveHuman(toUnit.side)
      }
    );

    // Reveal both pieces publicly
    fromUnit.revealed = true;
    toUnit.revealed = true;

    let serverBreached = false;
    const fromKey = pendingMove.fromCell, toKey = pendingMove.toCell;

    // Work on local copies so an interleaved Firebase subscription update
    // (triggered synchronously by pushLog's notify, in the local-mock case)
    // can't clobber this in-progress transaction before we persist it.
    const boardCopy = { ...state.board };
    const eliminatedCopy = {
      blue: { ...((state.eliminated && state.eliminated.blue) || {}) },
      red: { ...((state.eliminated && state.eliminated.red) || {}) }
    };

    function bumpLocal(side, pieceId) {
      eliminatedCopy[side][pieceId] = (eliminatedCopy[side][pieceId] || 0) + 1;
    }

    // Who lost, and what are they?
    const attackerWon = result.outcome === "attacker";
    const loserUnit = attackerWon ? toUnit : fromUnit;
    const loserDef = attackerWon ? defDef : atkDef;
    const loserKey = attackerWon ? toKey : fromKey;
    const loserIsHuman = loserDef.nature === "human";

    if (loserIsHuman) {
      // A person isn't erased from the game by losing a clash — they stand
      // down (can't move or fight) for a few of their own side's upcoming
      // turns, then automatically return to duty. No territory changes
      // hands: they're incapacitated in place, not removed from the cell.
      loserUnit.standDownTurnsLeft = STAND_DOWN_TURNS;
      const { row: sdRow, col: sdCol } = parseCellKey(loserKey);
      triggerStandDownAnimation(sdRow, sdCol);
      boardCopy[fromKey] = fromUnit;
      boardCopy[toKey] = toUnit;
    } else if (attackerWon) {
      if (defDef.isObjective) {
        serverBreached = true;
      }
      toUnit.eliminated = true;
      bumpLocal(toUnit.side, toUnit.pieceId);
      // Animate the defender being eliminated at toKey before overwriting
      const { row: elimRow, col: elimCol } = parseCellKey(toKey);
      triggerEliminationAnimation(elimRow, elimCol);
      boardCopy[toKey] = fromUnit;     // attacker occupies the cell
      delete boardCopy[fromKey];
    } else {
      fromUnit.eliminated = true;
      bumpLocal(fromUnit.side, fromUnit.pieceId);
      // Animate the attacker being eliminated at fromKey
      const { row: elimRow, col: elimCol } = parseCellKey(fromKey);
      triggerEliminationAnimation(elimRow, elimCol);
      delete boardCopy[fromKey];        // attacker is eliminated, defender holds
      boardCopy[toKey] = toUnit;
    }

    // Clamp BOTH ends — deferred stealth flags can drive the gain to 0.
    const newDetection = Math.max(0, Math.min(DETECTION_MAX, (state.detectionMeter || 0) + result.detectionGain));

    // OT process-safety rise (Stage 4). Driven by BOTH the attacker card's
    // processRisk AND proximity — a Red attack adjacent to the PLC objective
    // nudges the process toward unsafe. Only Red attacks raise it, and only in OT.
    let newProcessSafety = state.processSafety || 0;
    let processRise = 0;
    if ((state.mode === "ot") && fromUnit.side === "red") {
      const atkCardDef = attackerCardId ? SCENARIO_CARDS.find(c => c.id === attackerCardId) : null;
      if (atkCardDef && typeof atkCardDef.processRisk === "number") processRise += atkCardDef.processRisk;
      // Proximity: attacking a cell adjacent to (or onto) the PLC objective adds pressure
      if (isAdjacentToObjective(toKey, boardCopy) && !state.safeStateTripped) processRise += 8;
      if (processRise > 0 && state.safeStateTripped) processRise = 0; // tripped process can't be pushed further
      newProcessSafety = Math.max(0, Math.min(PROCESS_MAX, newProcessSafety + processRise));
    }

    // Keep our local working copy in sync immediately so subsequent reads
    // in this same tick (e.g. checkAndApplyWin below) see the new data,
    // even if a subscribe callback hasn't round-tripped yet.
    state.board = boardCopy;
    state.eliminated = eliminatedCopy;
    state.processSafety = newProcessSafety;

    logEvent("system",
      `${atkDef.name} (${fromUnit.side.toUpperCase()}) engaged ${defDef.name} (${toUnit.side.toUpperCase()}) at ${toKey}: ${result.summary}`);
    if (processRise > 0) {
      logEvent("red", `⚠ Process safety rose +${processRise} (now ${newProcessSafety}%).`);
    }
    if (flags.suppressNextDetection) {
      logEvent(attackerSide, `🕶 "Living off the Land" consumed — this attack generated no detection.`);
    } else if (flags.halveNextDetection) {
      logEvent(attackerSide, `🕶 "Timestomp / Blend" consumed — this attack drew half the usual attention.`);
    }

    const update = {
      board: boardCopy,
      eliminated: eliminatedCopy,
      detectionMeter: newDetection,
      processSafety: newProcessSafety,
      activeScenario: attackerCardId ? { side: fromUnit.side, cardId: attackerCardId } : (defenderCardId ? { side: toUnit.side, cardId: defenderCardId } : null)
    };
    // Consume the deferred stealth flags (they apply to one action only)
    if (flags.suppressNextDetection) update.suppressNextDetection = null;
    if (flags.halveNextDetection)   update.halveNextDetection = null;

    // OT restricted patching (Stage 4): using the maintenance-window patch spends a token
    if (state.mode === "ot" && (attackerCardId === "ot_b_maintenance_patch" || defenderCardId === "ot_b_maintenance_patch")) {
      const tokens = (typeof state.maintenanceTokens === "number") ? state.maintenanceTokens : 2;
      const left = Math.max(0, tokens - 1);
      update.maintenanceTokens = left;
      logEvent("blue", `🔧 Maintenance window used — ${left} remaining.`);
      bumpStat("maintenanceUsed", 1);
    }

    FireState.update(update);

    // Assessment tracking (Stage 5)
    bumpStat("clashesInitiated." + fromUnit.side, 1);
    if (fromUnit.side === "red" && result.detectionGain >= 15) bumpStat("redNoisyActions", 1);
    if (toUnit.side === "blue" && result.detectionGain > 0) bumpStat("blueDetectionGains", result.detectionGain);
    if (state.mode === "ot" && newProcessSafety > (state.stats && state.stats.peakProcessSafety || 0)) {
      setStat("peakProcessSafety", newProcessSafety);
    }

    checkAndApplyWin(newDetection, boardCopy, serverBreached);

    selectedCardId = null;
    closeResolvePanel();
    autoEndTurn();
  }

  function checkAndApplyWin(detectionMeter, board, serverBreachedFlag) {
    if (!state || state.phase !== "playing") return; // never evaluate win conditions outside an active game
    const blueMovableRemaining = BLUE_PIECES
      .filter(p => p.movable !== false)
      .reduce((sum, p) => sum + countAlive("blue", p.id, board), 0);
    const redRemaining = RED_PIECES.reduce((sum, p) => sum + countAlive("red", p.id, board), 0);

    const win = GameEngine.checkWinConditions({
      mode: state.mode || "it",
      detectionMeter,
      processSafety: state.processSafety || 0,
      safeStateTripped: !!state.safeStateTripped,
      serverBreached: !!serverBreachedFlag,
      blueMovableRemaining,
      redRemaining
    });

    if (win) {
      const sev = win.severity === "critical" ? " ⚠ CRITICAL" : "";
      logEvent("system", `GAME OVER${sev} — ${win.winner.toUpperCase()} WINS: ${win.reason}`);
      FireState.update({ phase: "ended", winner: win.winner, winReason: win.reason, winSeverity: win.severity || null });
    }
  }

  // "Alive" for the attrition win check means currently ACTIVE — not
  // permanently eliminated (a destroyed system) and not stood down (an
  // incapacitated human who'll be back). A side loses this way only when
  // every one of its pieces is down at the same moment.
  function countAlive(side, pieceId, board) {
    return Object.values(board).filter(u => u && u.side === side && u.pieceId === pieceId && !u.eliminated && !(u.standDownTurnsLeft > 0)).length;
  }

  /** Accumulate an assessment stat on the game state (Stage 5). */
  function bumpStat(path, amount) {
    if (!state) return;
    const stats = state.stats || (state.stats = {});
    const parts = path.split(".");
    let obj = stats;
    for (let i = 0; i < parts.length - 1; i++) {
      obj[parts[i]] = obj[parts[i]] || {};
      obj = obj[parts[i]];
    }
    const key = parts[parts.length - 1];
    obj[key] = (obj[key] || 0) + (typeof amount === "number" ? amount : 1);
    FireState.update({ stats });
  }
  function setStat(path, value) {
    if (!state) return;
    const stats = state.stats || (state.stats = {});
    const parts = path.split(".");
    let obj = stats;
    for (let i = 0; i < parts.length - 1; i++) {
      obj[parts[i]] = obj[parts[i]] || {};
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;
    FireState.update({ stats });
  }

  /** True if the given cell is on, or orthogonally adjacent to, the Blue objective piece. */
  function isAdjacentToObjective(cellKeyStr, board) {
    // Find the objective piece's cell
    const objIds = BLUE_PIECES.filter(p => p.isObjective).map(p => p.id);
    let objKey = null;
    for (const [k, u] of Object.entries(board)) {
      if (u && u.side === "blue" && objIds.includes(u.pieceId) && !u.eliminated) { objKey = k; break; }
    }
    if (!objKey) return false;
    if (objKey === cellKeyStr) return true;
    const a = parseCellKey(cellKeyStr), b = parseCellKey(objKey);
    const dr = Math.abs(a.row - b.row), dc = Math.abs(a.col - b.col);
    return (dr + dc) === 1;  // orthogonally adjacent
  }

  // ---------------- DETECTION MANUAL CONTROLS ----------------
  function wireDetectionControls() {
    document.getElementById("detection-add-btn").addEventListener("click", () => {
      const amt = parseInt(document.getElementById("detection-adjust").value, 10) || 0;
      const newVal = Math.min(DETECTION_MAX, (state.detectionMeter || 0) + amt);
      logEvent("system", `Admin manually raised detection meter by ${amt}.`);
      FireState.update({ detectionMeter: newVal });
      checkAndApplyWin(newVal, state.board, false);
    });
    document.getElementById("detection-sub-btn").addEventListener("click", () => {
      const amt = parseInt(document.getElementById("detection-adjust").value, 10) || 0;
      const newVal = Math.max(0, (state.detectionMeter || 0) - amt);
      logEvent("system", `Admin manually lowered detection meter by ${amt}.`);
      FireState.update({ detectionMeter: newVal });
    });
  }

  // ---------------- OT CONTROLS (Stage 4) ----------------
  function wireOTControls() {
    const addBtn = document.getElementById("process-add-btn");
    const subBtn = document.getElementById("process-sub-btn");
    const tripBtn = document.getElementById("safe-state-btn");
    if (addBtn) addBtn.addEventListener("click", () => {
      const amt = parseInt(document.getElementById("process-adjust").value, 10) || 0;
      const newVal = Math.max(0, Math.min(PROCESS_MAX, (state.processSafety || 0) + amt));
      logEvent("system", `Admin manually raised process-safety meter by ${amt} (now ${newVal}%).`);
      FireState.update({ processSafety: newVal });
      checkAndApplyWin(state.detectionMeter || 0, state.board, false);
    });
    if (subBtn) subBtn.addEventListener("click", () => {
      const amt = parseInt(document.getElementById("process-adjust").value, 10) || 0;
      const newVal = Math.max(0, (state.processSafety || 0) - amt);
      logEvent("system", `Admin manually lowered process-safety meter by ${amt}.`);
      FireState.update({ processSafety: newVal });
    });
    if (tripBtn) tripBtn.addEventListener("click", () => {
      if (state.safeStateTripped) { flashHint("Safe-state already tripped for this game."); return; }
      confirmAction(
        "Invoke Safe-State Trip?",
        "This halts the process to a guaranteed-safe state. It PREVENTS a physical-damage loss for the rest of the game, but records an availability penalty. This cannot be undone.",
        () => invokeSafeStateTrip()
      );
    });
  }

  /** Blue invokes the Safety Instrumented System to halt the process. */
  function invokeSafeStateTrip() {
    if (!state || state.safeStateTripped) return;
    logEvent("blue", "⚠ SAFE-STATE TRIP invoked — process halted to a guaranteed-safe state. Availability penalty recorded; physical-damage loss is now prevented.");
    FireState.update({ safeStateTripped: true });
    setStat("safeStateTripTurn", state.turnNumber || 1);
    flashHint("Safe-state trip active — the process is safe but availability is sacrificed.");
  }

  /** Show/hide the Download Report button based on game state, and wire the click. */
  function wireReportButton() {
    const btn = document.getElementById("download-report-btn");
    if (!btn) return;
    btn.addEventListener("click", () => {
      if (!state || typeof Assessment === "undefined") return;
      let html;
      try { html = Assessment.buildReportHTML(state); }
      catch (e) { flashHint("Could not generate the report."); return; }
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      a.href = url;
      a.download = `exercise-report-${state.mode || "it"}-${stamp}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      logEvent("system", "Assessment report downloaded.");
    });
  }

  function renderReportButton() {
    const btn = document.getElementById("download-report-btn");
    if (!btn) return;
    btn.style.display = (state && state.phase === "ended" && state.winner) ? "" : "none";
  }

  /** Show/hide OT controls and refresh their values based on the current mode/state. */
  function renderOTControls() {
    const panel = document.getElementById("ot-controls");
    if (!panel) return;
    const isOT = state && state.mode === "ot";
    panel.style.display = isOT ? "" : "none";
    if (!isOT) return;
    const pct = Math.max(0, Math.min(100, state.processSafety || 0));
    const fill = document.getElementById("process-fill-admin");
    const lbl = document.getElementById("process-pct-admin");
    const status = document.getElementById("process-status-admin");
    const tokens = document.getElementById("maint-tokens");
    const tripBtn = document.getElementById("safe-state-btn");
    if (fill) fill.style.width = pct + "%";
    if (lbl) lbl.textContent = pct + "%";
    if (status) status.textContent = state.safeStateTripped ? "SAFE-STATE TRIPPED (availability lost)" : "Max 100 = physical damage";
    if (tokens) tokens.textContent = (typeof state.maintenanceTokens === "number") ? state.maintenanceTokens : 2;
    if (tripBtn) {
      tripBtn.disabled = !!state.safeStateTripped;
      tripBtn.style.opacity = state.safeStateTripped ? "0.5" : "1";
      tripBtn.textContent = state.safeStateTripped ? "✓ Safe-State Tripped" : "⚠ Invoke Safe-State Trip";
    }
  }

  // ---------------- VOTING ----------------

  /** Sync the voter count input fields to match whatever's stored in state */
  function syncVotingConfigUI() {
    if (!state || !state.votingConfig) return;
    const cfg = state.votingConfig;
    const blueInput = document.getElementById("vote-blue-expected");
    const redInput  = document.getElementById("vote-red-expected");
    if (blueInput && document.activeElement !== blueInput) blueInput.value = cfg.blueExpected || 5;
    if (redInput  && document.activeElement !== redInput)  redInput.value  = cfg.redExpected  || 5;
  }

  /** Build a tally map {cardId: count} for the current turn and side */
  function buildTally(side) {
    if (!state) return {};
    const currentTurnKey = state.turnKey || ("t" + (state.turnNumber||1) + "-" + (state.turn||"blue"));
    const allVotes = (state.votes && state.votes[currentTurnKey]) || {};
    const tally = {};
    Object.values(allVotes).forEach(v => {
      if (v.side === side) tally[v.cardId] = (tally[v.cardId] || 0) + 1;
    });
    return tally;
  }

  function quorumFor(side) {
    const cfg = (state && state.votingConfig) || {};
    const expected = side === "blue" ? (cfg.blueExpected || 5) : (cfg.redExpected || 5);
    return Math.ceil(expected / 2);
  }

  function totalVotesFor(side) {
    if (!state) return 0;
    const currentTurnKey = state.turnKey || ("t" + (state.turnNumber||1) + "-" + (state.turn||"blue"));
    const allVotes = (state.votes && state.votes[currentTurnKey]) || {};
    return Object.values(allVotes).filter(v => v.side === side).length;
  }

  /** Render the live vote tally panel in the admin UI */
  function renderVoteTally() {
    const container = document.getElementById("vote-tally-container");
    const applyBtn  = document.getElementById("vote-apply-btn");
    if (!container) return;

    if (!state || state.phase !== "playing") {
      container.innerHTML = `<div class="helper-text" style="padding:0;color:var(--text-low);">Start the game to enable voting.</div>`;
      if (applyBtn) applyBtn.disabled = true;
      return;
    }

    const side = state.turn;
    const votePhase = state.votePhase || "move";
    const quorum = quorumFor(side);
    const cfg = state.votingConfig || {};
    const expected = side === "blue" ? (cfg.blueExpected || 5) : (cfg.redExpected || 5);
    container.innerHTML = "";

    // Phase label
    const phaseLabel = document.createElement("div");
    phaseLabel.style.cssText = "font-family:var(--font-mono);font-size:11px;color:var(--text-mid);margin-bottom:4px;";

    if (votePhase === "card") {      const tally = buildTally(side);
      const totalVotes = totalVotesFor(side);
      const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
      const winner = sorted.find(([, count]) => count >= quorum);
      phaseLabel.textContent = `Round 2 — Card vote: ${side.toUpperCase()} ${totalVotes}/${expected} (quorum: ${quorum})`;
      container.appendChild(phaseLabel);

      if (sorted.length === 0) {
        const empty = document.createElement("div"); empty.className = "helper-text"; empty.style.padding = "0";
        empty.textContent = "No card votes yet."; container.appendChild(empty);
      } else {
        sorted.forEach(([cardId, count]) => {
          const card = SCENARIO_CARDS.find(c => c.id === cardId);
          const pct = Math.min(100, Math.round((count / expected) * 100));
          const isWin = count >= quorum;
          const colorVar = isWin ? "var(--green)" : (side === "blue" ? "var(--blue-core)" : "var(--red-core)");
          const row = document.createElement("div"); row.style.cssText = "display:flex;flex-direction:column;gap:2px;";
          row.innerHTML = `<div style="display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:10px;color:var(--text-mid);"><span>${isWin ? "✓ " : ""}${card ? card.name : cardId}</span><span>${count}/${quorum}</span></div><div style="height:6px;border-radius:99px;background:var(--bg-raised);overflow:hidden;"><div style="height:100%;border-radius:99px;width:${pct}%;background:${colorVar};transition:width 0.4s ease;"></div></div>`;
          container.appendChild(row);
        });
      }
      if (applyBtn) applyBtn.disabled = !winner && sorted.length === 0;

    } else {
      // Move vote phase (either "move" after card quorum, or "move-only" when no clash)
      const moveTally = buildMoveTally(side);
      const moveSorted = Object.entries(moveTally).sort((a, b) => b[1] - a[1]);
      const moveWinner = moveSorted.find(([, count]) => count >= quorum);
      const totalMoveVotes = Object.values(moveTally).reduce((s, c) => s + c, 0);
      const moveLabel = votePhase === "card" ? "Round 2 — Card vote" : "Round 1 — Move vote";
      phaseLabel.textContent = `${moveLabel}: ${side.toUpperCase()} ${totalMoveVotes}/${expected} (quorum: ${quorum})`;
      container.appendChild(phaseLabel);

      if (moveSorted.length === 0) {
        const empty = document.createElement("div"); empty.className = "helper-text"; empty.style.padding = "0";
        empty.textContent = "Waiting for move votes on phones…"; container.appendChild(empty);
      } else {
        moveSorted.slice(0, 5).forEach(([moveKey, count]) => {
          const [from, to] = moveKey.split("|");
          const unit = state.board && state.board[from];
          const def = unit ? GameEngine.findPieceDef(unit.pieceId) : null;
          const label = def ? `${def.short} ${from}→${to}` : `${from}→${to}`;
          const pct = Math.min(100, Math.round((count / expected) * 100));
          const isWin = count >= quorum;
          const colorVar = isWin ? "var(--green)" : (side === "blue" ? "var(--blue-core)" : "var(--red-core)");
          const row = document.createElement("div"); row.style.cssText = "display:flex;flex-direction:column;gap:2px;";
          row.innerHTML = `<div style="display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:10px;color:var(--text-mid);"><span>${isWin ? "✓ " : ""}${label}</span><span>${count}/${quorum}</span></div><div style="height:6px;border-radius:99px;background:var(--bg-raised);overflow:hidden;"><div style="height:100%;border-radius:99px;width:${pct}%;background:${colorVar};transition:width 0.4s ease;"></div></div>`;
          container.appendChild(row);
        });
      }
      if (applyBtn) applyBtn.disabled = !moveWinner;
    }
  }

  /** Detect if any piece on the current side has at least one enemy piece adjacent */
  function currentSideHasClashPossible() {
    if (!state || !state.board) return false;
    const side = state.turn;
    const board = state.board;
    return Object.entries(board).some(([key, unit]) => {
      if (!unit || unit.eliminated || unit.side !== side) return false;
      const { row, col } = parseCellKey(key);
      return [[row-1,col],[row+1,col],[row,col-1],[row,col+1]].some(([r,c]) => {
        if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return false;
        const occ = board[cellKey(r, c)];
        return occ && !occ.eliminated && occ.side !== side;
      });
    });
  }

  /** Admin manually opens voting — always starts with move vote (Round 1).
   *  If the winning move is a clash, card voting opens automatically as Round 2. */
  function openVoting() {
    const deadline = Date.now() + VOTE_DURATION_MS;
    FireState.update({ votePhase: "move", votes: {}, voteDeadline: deadline });
    startCountdownFrom(deadline, "move");
    logEvent("system", `Move voting open — participants choose a piece and destination (${VOTE_DURATION_MS/1000}s).`);
    flashHint("Move vote open on phones. Participants pick a piece and destination.");
    renderVoteTally();
  }
  let lastAutoAppliedTurnKey = null;
  let lastAutoAppliedMoveKey = null;

  function checkQuorum() {
    if (!state || state.phase !== "playing") return;
    const votePhase = state.votePhase || "move";

    if (votePhase === "move") {
      // Round 1: move vote
      checkMoveQuorum();
    } else if (votePhase === "card") {
      // Round 2: card vote (only reached when a clash was voted)
      const side = state.turn;
      const tally = buildTally(side);
      const quorum = quorumFor(side);
      const currentTurnKey = state.turnKey || ("t" + (state.turnNumber||1) + "-" + (state.turn||"blue"));
      const winner = Object.entries(tally).find(([, count]) => count >= quorum);
      if (winner && currentTurnKey !== lastAutoAppliedTurnKey) {
        lastAutoAppliedTurnKey = currentTurnKey;
        applyWinningCard(false, winner[0]);
      }
    }
  }

  /** Round 2: card quorum reached — arm the card and open clash resolve panel */
  function applyWinningCard(manualOverride, overrideCardId) {
    if (!state || state.phase !== "playing") return;
    const side = state.turn;

    let cardId = overrideCardId;
    if (!cardId) {
      const tally = buildTally(side);
      const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
      if (!sorted.length) return;
      cardId = sorted[0][0];
    }

    const card = SCENARIO_CARDS.find(c => c.id === cardId);
    if (!card) return;

    const source = manualOverride ? "Admin applied" : "Quorum reached — auto-applied";
    logEvent(side, `${source}: "${card.name}" selected for ${side.toUpperCase()}.`);
    FireState.update({ activeScenario: { side, cardId } });

    if (card.type === "special") {
      // Special cards apply immediately, no board move needed
      handleSpecialCard(card);
      selectedCardId = null;
      renderCardList();
      renderTurnInstruction();
      renderVoteTally();
      autoEndTurn();
    } else {
      // Engage/move card — arm it and open the clash resolve panel
      cardFilterToggle(side);
      selectedCardId = cardId;
      renderCardList();
      renderTurnInstruction();
      renderVoteTally();

      // If we have a pending clash move from the move vote, auto-resolve it now
      const clash = state.pendingClashMove;
      if (clash && state.board[clash.fromCell] && state.board[clash.toCell]) {
        selectedCell = clash.fromCell;
        pendingMove = { fromCell: clash.fromCell, toCell: clash.toCell, type: "clash" };
        // Show the matchup on the projector
        openResolvePanel();
        const roll = Math.floor(Math.random() * 100) + 1;
        const rollInput = document.getElementById("roll-input");
        if (rollInput) rollInput.value = roll;
        updateOddsPreview();
        flashHint(`"${card.name}" armed — resolving clash at ${clash.fromCell} vs ${clash.toCell}…`);
        // Resolve immediately with the generated roll. We capture the roll and
        // pending cells here so an intervening subscribe callback can't disrupt it.
        applyResolution(roll);
      } else {
        flashHint(`"${card.name}" armed — click a piece on the board to complete the move.`);
      }
    }
  }

  /** Kept for backwards-compat: manual Apply Winning Card button */
  function applyWinningVote(manualOverride, overrideCardId) {
    applyWinningCard(manualOverride, overrideCardId);
  }

  /** Phase 2 quorum: move selected — execute it on the board */
  function checkMoveQuorum() {
    if (!state || state.phase !== "playing") return;
    // Don't auto-apply if admin already has a piece selected or move in progress
    if (selectedCell || pendingMove) return;
    const side = state.turn;
    const currentTurnKey = state.turnKey || ("t" + (state.turnNumber||1) + "-" + (state.turn||"blue"));
    const moveTally = buildMoveTally(side);
    const quorum = quorumFor(side);
    const moveKey = currentTurnKey + "-move";

    const winner = Object.entries(moveTally).find(([, count]) => count >= quorum);
    if (winner && moveKey !== lastAutoAppliedMoveKey) {
      lastAutoAppliedMoveKey = moveKey;
      applyWinningMove(winner[0]);
    }
  }

  /** Build tally for move votes: key is "fromCell|toCell" */
  function buildMoveTally(side) {
    if (!state) return {};
    const currentTurnKey = state.turnKey || ("t" + (state.turnNumber||1) + "-" + (state.turn||"blue"));
    const allVotes = (state.votes && state.votes[currentTurnKey]) || {};
    const tally = {};
    Object.values(allVotes).forEach(v => {
      if (v.side === side && v.fromCell && v.toCell) {
        const k = v.fromCell + "|" + v.toCell;
        tally[k] = (tally[k] || 0) + 1;
      }
    });
    return tally;
  }

  /** Execute the winning move from the move-vote phase.
   *  Simple move → execute immediately.
   *  Clash → open card voting (Round 2) before the admin resolves. */
  function applyWinningMove(moveKey) {
    const [fromCell, toCell] = moveKey.split("|");
    if (!fromCell || !toCell) return;
    if (!state.board[fromCell]) return;

    const fromUnit = state.board[fromCell];
    const toUnit = state.board[toCell];

    logEvent(fromUnit.side, `Move vote quorum: ${pieceLabel(fromUnit)} moves ${fromCell} → ${toCell}.`);

    if (!toUnit || toUnit.eliminated) {
      // Simple move — no clash, no card needed, execute now
      pendingMove = { fromCell, toCell, type: "move" };
      completeSimpleMove();
    } else if (toUnit.side !== fromUnit.side) {
      // Validate the engagement — technical attackers cannot clash with humans
      const attackerId = fromUnit.side === state.turn ? fromUnit.pieceId : toUnit.pieceId;
      const defenderId = fromUnit.side === state.turn ? toUnit.pieceId : fromUnit.pieceId;
      const engagement = GameEngine.canEngage(attackerId, defenderId);
      if (!engagement.allowed) {
        // Invalid clash — reject and reopen the move vote
        logEvent("system", "Voted move blocked — " + engagement.reason);
        flashHint("⚠ Voted move invalid: " + engagement.reason + " Re-opening move vote.");
        const deadline = Date.now() + VOTE_DURATION_MS;
        FireState.update({ votePhase: "move", votes: {}, voteDeadline: deadline, pendingClashMove: null });
        startCountdownFrom(deadline, "move");
        renderVoteTally();
        return;
      }

      // Clash detected — open Round 2 card voting before resolving
      selectedCell = fromCell;
      pendingMove = { fromCell, toCell, type: "clash" };

      // Store the pending clash cells so card vote knows what move is coming
      const deadline = Date.now() + VOTE_DURATION_MS;
      FireState.update({
        votePhase: "card",
        votes: {},
        voteDeadline: deadline,
        pendingClashMove: { fromCell, toCell }
      });
      startCountdownFrom(deadline, "card");
      logEvent(fromUnit.side, `Clash detected — now vote for a scenario card to play with this move.`);
      flashHint(`Clash! ${pieceLabel(fromUnit)} vs ${pieceLabel(toUnit)} — card vote now open on phones.`);
      renderVoteTally();
    } else {
      logEvent("system", `Voted move ${fromCell}→${toCell} invalid (friendly piece there). Admin to resolve.`);
    }
  }
  // ---------------- COUNTDOWN TIMER ----------------

  function startVoteCountdown() {
    // Restart the countdown from now + 20s and write to Firebase
    const deadline = Date.now() + VOTE_DURATION_MS;
    const votePhase = state && state.votePhase || "card";
    FireState.update({ voteDeadline: deadline });
    startCountdownFrom(deadline, votePhase);
  }

  function startCountdownFrom(deadline, phase) {
    // Clear any existing interval
    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }

    const wrap = document.getElementById("admin-timer-wrap");
    const numEl = document.getElementById("admin-timer-num");
    const fillEl = document.getElementById("admin-ring-fill");
    const phaseEl = document.getElementById("admin-timer-phase");
    if (!wrap || !numEl) return;

    wrap.style.display = "flex";
    phaseEl.textContent = phase === "card" ? "Card vote" : "Move vote";

    const TOTAL = VOTE_DURATION_MS / 1000;
    const CIRCUMFERENCE = 97; // 2π × 15.5 (admin ring radius)

    function tick() {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      numEl.textContent = remaining;

      const pct = remaining / TOTAL;
      fillEl.style.strokeDashoffset = CIRCUMFERENCE * (1 - pct);

      // Colour coding
      if (remaining <= 5) { fillEl.className = "ring-fill urgent"; }
      else if (remaining <= 10) { fillEl.className = "ring-fill warning"; }
      else { fillEl.className = "ring-fill"; }

      if (remaining <= 0) {
        clearInterval(countdownInterval); countdownInterval = null;
        wrap.style.display = "none";
        onCountdownExpired(phase);
      }
    }

    tick();
    countdownInterval = setInterval(tick, 500);
  }

  function onCountdownExpired(phase) {
    if (!state || state.phase !== "playing") return;
    // Assessment: a genuinely undecided expiry (no votes) counts against the active team
    const activeTeam = state.turn;

    if (phase === "move") {
      if (selectedCell || pendingMove) {
        logEvent("system", "Move vote timer expired — admin has control, continuing.");
        return;
      }
      const moveTally = buildMoveTally(state.turn);
      const sorted = Object.entries(moveTally).sort((a,b) => b[1]-a[1]);
      if (sorted.length) {
        logEvent("system", "Move vote timer expired — auto-applying majority move vote.");
        applyWinningMove(sorted[0][0]);
      } else {
        logEvent("system", "Move vote timer expired with no votes — admin please move a piece manually.");
        bumpStat("timerExpiries." + activeTeam, 1);
      }
    } else if (phase === "card") {
      // Note: during a clash card vote, pendingMove is ALWAYS set (it holds the
      // clash move). So we must NOT treat pendingMove as "admin is busy" here —
      // only a manually-armed card should block the timer auto-apply.
      if (selectedCardId) {
        logEvent("system", "Card vote timer expired — admin has a card armed, continuing.");
        return;
      }
      const tally = buildTally(state.turn);
      const sorted = Object.entries(tally).sort((a,b) => b[1]-a[1]);
      if (sorted.length) {
        logEvent("system", "Card vote timer expired — auto-applying majority card vote.");
        applyWinningCard(true, sorted[0][0]);
      } else {
        // No card votes — resolve the clash with no card played, using a random roll
        logEvent("system", "Card vote timer expired with no votes — resolving clash without a card.");
        resolveClashWithoutCard();
      }
    }
  }

  /** Resolve the pending clash with no scenario card (timer expired, no votes) */
  function resolveClashWithoutCard() {
    const clash = state.pendingClashMove;
    if (!clash || !state.board[clash.fromCell] || !state.board[clash.toCell]) {
      // No valid pending clash — just move on
      autoEndTurn();
      return;
    }
    selectedCell = clash.fromCell;
    selectedCardId = null;              // no card in play
    pendingMove = { fromCell: clash.fromCell, toCell: clash.toCell, type: "clash" };
    openResolvePanel();
    const roll = Math.floor(Math.random() * 100) + 1;
    const rollInput = document.getElementById("roll-input");
    if (rollInput) rollInput.value = roll;
    updateOddsPreview();
    applyResolution(roll);
  }

  // ---------------- ELIMINATION ANIMATION ----------------

  /** Trigger the zap-out animation on a board cell, then re-render after it finishes */
  function triggerEliminationAnimation(row, col) {
    const cellId = `admin-cell-${row}-${col}`;
    const cellEl = document.getElementById(cellId);
    if (!cellEl) return;
    cellEl.classList.add("zap-out");
    setTimeout(() => {
      cellEl.classList.remove("zap-out");
      renderAdminBoard();
    }, 700);
  }

  /** Trigger the (lighter, non-destructive) stand-down flash on a board
   *  cell — the piece stays put, so this shouldn't read as "gone". */
  function triggerStandDownAnimation(row, col) {
    const cellId = `admin-cell-${row}-${col}`;
    const cellEl = document.getElementById(cellId);
    if (!cellEl) return;
    cellEl.classList.add("stand-down-flash");
    setTimeout(() => {
      cellEl.classList.remove("stand-down-flash");
      renderAdminBoard();
    }, 700);
  }

})();
