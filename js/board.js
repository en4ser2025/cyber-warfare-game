/* ============================================================
   CYBER GRID :: BOARD (public display) LOGIC
   ============================================================ */

(function () {
  let spriteLoaded = false;
  let lastLogIds = new Set();
  let boardCountdownInterval = null;
  const VOTE_DURATION_S = 40;
  const BOARD_RING_CIRCUMFERENCE = 113; // 2π × 18

  // ---- Load the SVG sprite sheet once ----
  fetch("assets/icons/sprite.svg")
    .then(r => r.text())
    .then(svg => {
      document.getElementById("sprite-mount").innerHTML = svg;
      spriteLoaded = true;
    })
    .catch(err => console.error("Failed to load icon sprite:", err));

  // ---- Build the 36-cell grid skeleton once ----
  const boardEl = document.getElementById("board");
  function buildBoardSkeleton() {
    boardEl.innerHTML = "";
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const cell = document.createElement("div");
        const zone = zoneForRow(row);
        cell.className = `cell zone-${zone}`;
        cell.dataset.row = row;
        cell.dataset.col = col;
        cell.id = `cell-${row}-${col}`;
        const coord = document.createElement("div");
        coord.className = "cell-coord";
        coord.textContent = cellKey(row, col);
        cell.appendChild(coord);
        boardEl.appendChild(cell);
      }
    }
  }
  buildBoardSkeleton();

  // ---- Square-fit: pin the board to the largest square that fits BOTH
  // the available width and height, so it never overflows the viewport
  // and never renders as a stretched non-square rectangle. CSS alone
  // (flex + aspect-ratio) can clamp one axis but not reconcile both when
  // the width and height budgets differ, so this is done in JS. ----
  function fitSquareBoard() {
    const wrap = boardEl.parentElement; // .board-wrap
    if (!wrap) return;
    boardEl.style.width = "";
    boardEl.style.height = "";
    // clientWidth/clientHeight include the wrapper's own padding, but a
    // child's width/height is resolved against the wrapper's CONTENT box
    // (inside the padding) — subtract it so the square isn't over-measured.
    const cs = getComputedStyle(wrap);
    const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const availableWidth = wrap.clientWidth - padX;
    const availableHeight = wrap.clientHeight - padY;
    const size = Math.max(0, Math.floor(Math.min(availableWidth, availableHeight)));
    if (size > 0) {
      boardEl.style.width = size + "px";
      boardEl.style.height = size + "px";
    }
  }
  let boardFitQueued = false;
  function scheduleBoardFit() {
    if (boardFitQueued) return;
    boardFitQueued = true;
    requestAnimationFrame(() => { boardFitQueued = false; fitSquareBoard(); });
  }
  window.addEventListener("resize", scheduleBoardFit);
  // Re-fit once more after every resource (fonts, images) has finished
  // loading — late web-font swaps or a slow-loading QR canvas can shift
  // sibling heights slightly after the very first fit runs.
  window.addEventListener("load", scheduleBoardFit);
  scheduleBoardFit();

  function pieceIcon(pieceId) {
    const def = GameEngine.findPieceDef(pieceId);
    return def ? def.icon : "shield";
  }
  function pieceDef(pieceId) { return GameEngine.findPieceDef(pieceId); }

  // ---- Render board pieces from state ----
  function renderBoard(state) {
    // clear existing pieces
    document.querySelectorAll(".cell .piece").forEach(p => p.remove());

    const board = state.board || {};
    Object.entries(board).forEach(([key, unit]) => {
      if (!unit || unit.eliminated) return;
      const { row, col } = parseCellKey(key);
      const cellEl = document.getElementById(`cell-${row}-${col}`);
      if (!cellEl) return;

      const def = pieceDef(unit.pieceId);
      const piece = document.createElement("div");
      const isObjective = def?.isObjective;

      if (unit.revealed) {
        const stoodDown = unit.standDownTurnsLeft > 0;
        piece.className = `piece ${unit.side}${isObjective ? " objective" : ""}${stoodDown ? " stood-down" : ""}`;
        piece.innerHTML = `<svg><use href="#icon-${def?.icon || "shield"}"></use></svg>`;
        const tag = document.createElement("div");
        tag.className = "piece-rank-tag";
        tag.textContent = def?.short || "?";
        piece.appendChild(tag);
        if (stoodDown) {
          const badge = document.createElement("div");
          badge.className = "stand-down-turns-badge";
          badge.title = "Stood down — recovering";
          badge.textContent = unit.standDownTurnsLeft;
          piece.appendChild(badge);
        }
      } else {
        piece.className = `piece hidden ${unit.side}-side`;
        piece.innerHTML = `<svg><use href="#icon-locked"></use></svg>`;
      }
      cellEl.appendChild(piece);
    });
  }

  // ---- Render rosters (remaining counts per piece type) ----
  function renderRoster(state, side, containerId) {
    const roster = side === "blue" ? BLUE_PIECES : RED_PIECES;
    const eliminated = (state.eliminated && state.eliminated[side]) || {};

    const container = document.getElementById(containerId);
    container.innerHTML = "";
    roster.forEach(p => {
      const elimCount = eliminated[p.id] || 0;
      const left = p.count - elimCount;

      // Status: depleted = all gone, partial = some gone, normal = none gone
      const status = left === 0 ? "depleted" : elimCount > 0 ? "partial" : "";

      const row = document.createElement("div");
      row.className = "roster-row" + (status ? " " + status : "");
      row.innerHTML = `
        <svg><use href="#icon-${p.icon}"></use></svg>
        <span>${p.name}</span>
        <span class="count">${left}/${p.count}</span>
      `;
      container.appendChild(row);
    });
  }

  // ---- Render scenario cards on the public board ----
  function renderScenarioCards(state) {
    const activeCardId = state.activeScenario ? state.activeScenario.cardId : null;

    ["blue", "red"].forEach(side => {
      const containerId = "public-" + side + "-cards";
      const container = document.getElementById(containerId);
      if (!container) return;

      const cards = SCENARIO_CARDS.filter(c => c.side === side);
      container.innerHTML = "";
      cards.forEach(card => {
        const isActive = card.id === activeCardId;
        const div = document.createElement("div");
        div.className = "pub-card " + side + "-card" + (isActive ? " active-card" : "");

        const pips = Array.from({ length: 5 }, (_, i) =>
          `<span class="${i < card.difficulty ? "on" : ""}"></span>`
        ).join("");

        const modStr = card.modifier >= 0 ? "+" + card.modifier : "" + card.modifier;
        const typeLabel = card.type.toUpperCase();

        div.innerHTML = `
          <div class="pub-card-name">${card.name}</div>
          <div class="pub-card-meta">
            <span>${typeLabel}</span>
            <span>mod ${modStr}</span>
            <span>detect +${card.detectionRisk}</span>
            <span class="pub-card-pips">${pips}</span>
          </div>
          <div class="pub-card-desc">${card.description}</div>
        `;
        container.appendChild(div);
      });
    });
  }

  // ---- Detection meter ----
  let _lastDetectionPct = null;
  let _lastProcessPct = null;
  function renderDetection(state) {
    const pct = Math.max(0, Math.min(100, state.detectionMeter || 0));
    const fill = document.getElementById("detection-fill");
    const label = document.getElementById("detection-pct");
    fill.style.width = pct + "%";
    label.textContent = pct + "%";

    // Mode-specific detection label
    const isOT = (state.mode === "ot");
    const eyebrow = document.getElementById("detection-eyebrow");
    if (eyebrow) eyebrow.textContent = isOT ? "OT Detection" : "SOC Detection";

    // If detection DROPPED (a Red stealth play), flash the meter to signal it.
    if (_lastDetectionPct !== null && pct < _lastDetectionPct) {
      fill.classList.remove("detection-drop");
      void fill.offsetWidth;
      fill.classList.add("detection-drop");
      showStealthBadge(_lastDetectionPct - pct);
    }
    _lastDetectionPct = pct;

    // OT second meter — process safety (Stage 4)
    const pm = document.getElementById("process-meter");
    if (pm) {
      if (isOT) {
        pm.style.display = "";
        const ppct = Math.max(0, Math.min(100, state.processSafety || 0));
        const pfill = document.getElementById("process-fill");
        const plabel = document.getElementById("process-pct");
        const pstatus = document.getElementById("process-status");
        if (pfill) pfill.style.width = ppct + "%";
        if (plabel) plabel.textContent = ppct + "%";
        if (pstatus) {
          if (state.safeStateTripped) pstatus.textContent = "SAFE-STATE TRIPPED";
          else if (ppct >= 100) pstatus.textContent = "PHYSICAL DAMAGE";
          else pstatus.textContent = "100% = physical damage";
        }
        // Pulse the process meter red when it rises into danger
        if (pfill && _lastProcessPct !== null && ppct > _lastProcessPct && ppct >= 60) {
          pfill.classList.remove("process-danger");
          void pfill.offsetWidth;
          pfill.classList.add("process-danger");
        }
        _lastProcessPct = ppct;
      } else {
        pm.style.display = "none";
      }
    }
  }

  // Brief on-board banner announcing a stealth play
  function showStealthBadge(amount) {
    let badge = document.getElementById("stealth-badge");
    if (!badge) {
      badge = document.createElement("div");
      badge.id = "stealth-badge";
      badge.className = "stealth-badge";
      const meter = document.getElementById("detection-fill")?.closest(".detection-meter, .meter, section, div") || document.body;
      meter.appendChild(badge);
    }
    badge.textContent = `🕶 STEALTH \u2212${amount}% DETECTION`;
    badge.classList.remove("show");
    void badge.offsetWidth;
    badge.classList.add("show");
  }

  // ---- Phase / turn pills ----
  function renderStatus(state) {
    const phaseText = document.getElementById("phase-text");
    const turnPill = document.getElementById("turn-pill");
    const turnText = document.getElementById("turn-text");

    // Mode badge (Stage 2) — reads state.mode, styled per mode
    const modePill = document.getElementById("mode-pill");
    const modeText = document.getElementById("mode-text");
    if (modePill && modeText) {
      const mode = state.mode || "it";
      if (mode === "ot") {
        modeText.textContent = "OT MODE";
        modePill.style.background = "linear-gradient(90deg,#5e3a1c,#8c6a2e)";
        modePill.style.borderColor = "#c89b3d";
      } else {
        modeText.textContent = "IT MODE";
        modePill.style.background = "linear-gradient(90deg,#1c3a5e,#2e5a8c)";
        modePill.style.borderColor = "#3d78c8";
      }
    }

    // Mode-specific copy (Stage 3) — roster titles + subtitle from the active pack
    if (typeof getPack === "function") {
      const pack = getPack(state.mode || "it");
      const subtitle = document.getElementById("board-subtitle");
      const blueTitle = document.getElementById("blue-roster-title");
      const redTitle = document.getElementById("red-roster-title");
      if (subtitle) subtitle.innerHTML = pack.tagline + " &mdash; Live Board";
      if (blueTitle) blueTitle.textContent = pack.blueName.replace(/—/g, "\u2014");
      if (redTitle) redTitle.textContent = pack.redName.replace(/—/g, "\u2014");
    }

    phaseText.textContent = (state.phase || "setup").toUpperCase();

    if (state.phase === "playing") {
      turnPill.className = `pill pill-${state.turn}`;
      turnText.textContent = `${(state.turn || "blue").toUpperCase()} TURN \u00b7 #${state.turnNumber || 1}`;
    } else if (state.phase === "ended") {
      turnPill.className = "pill";
      turnText.textContent = "GAME OVER";
    } else {
      turnPill.className = "pill";
      turnText.textContent = "AWAITING SETUP";
    }
  }

  // ---- Active scenario banner ----
  function renderActiveScenario(state) {
    const banner = document.getElementById("now-playing-banner");
    const s = state.activeScenario;
    if (!s) { banner.style.display = "none"; return; }
    const card = SCENARIO_CARDS.find(c => c.id === s.cardId);
    if (!card) { banner.style.display = "none"; return; }
    banner.style.display = "flex";
    const sideEl = document.getElementById("now-playing-side");
    sideEl.className = `pill pill-${s.side}`;
    sideEl.innerHTML = `<span class="pill-dot"></span>${s.side.toUpperCase()}`;
    document.getElementById("now-playing-name").textContent = card.name;
    document.getElementById("now-playing-desc").textContent = card.description;
  }

  // ---- Log feed ----
  function renderLog(state) {
    const log = state.log || {};
    const feed = document.getElementById("log-feed");
    const entries = Object.entries(log).sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0));

    entries.forEach(([id, entry]) => {
      if (lastLogIds.has(id)) return;
      lastLogIds.add(id);
      const div = document.createElement("div");
      div.className = `log-entry ${entry.side || ""}`;
      const time = new Date(entry.ts || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      div.innerHTML = `<span class="ts">${time}</span>${escapeHtml(entry.text || "")}`;
      feed.prepend(div);
    });

    // cap displayed entries for performance
    while (feed.children.length > 60) feed.removeChild(feed.lastChild);
  }

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  // ---- Win overlay ----
  function renderWin(state) {
    const overlay = document.getElementById("win-overlay");
    if (!state.winner) { overlay.style.display = "none"; return; }
    overlay.style.display = "flex";
    const card = document.getElementById("win-card");
    card.className = `panel win-card ${state.winner}-win`;
    document.getElementById("win-title").textContent =
      state.winner === "blue" ? "DEFENDERS WIN" : "ATTACKERS WIN";
    document.getElementById("win-reason").textContent = state.winReason || "";
    renderDebrief(state);
  }

  function bandColor(b) {
    return b === "Strong" ? "#37e39b" : b === "Proficient" ? "#7ad0ff"
         : b === "Developing" ? "#e0a53a" : "#e05a4a";
  }

  function renderDebrief(state) {
    const el = document.getElementById("debrief");
    if (!el || typeof Assessment === "undefined") return;
    let result;
    try { result = Assessment.scoreGame(state); } catch (e) { el.innerHTML = ""; return; }

    function teamBlock(teamKey, label, data) {
      const catRows = data.categories.map(c => `
        <div class="debrief-cat">
          <span class="debrief-cat-label">${c.label}</span>
          <span class="debrief-cat-score" style="color:${bandColor(c.band)}">${c.score}</span>
        </div>`).join("");
      return `
        <div class="debrief-team debrief-${teamKey}">
          <div class="debrief-team-head">
            <span class="debrief-team-name">${label}</span>
            <span class="debrief-band" style="color:${bandColor(data.band)}">${data.band} · ${data.overall}</span>
          </div>
          ${catRows}
        </div>`;
    }

    el.innerHTML = `
      <div class="debrief-title">Team Assessment${result.mode === "ot" ? " · OT Exercise" : " · IT Exercise"}</div>
      <div class="debrief-teams">
        ${teamBlock("blue", "Defenders (Blue)", result.blue)}
        ${teamBlock("red", "Attackers (Red)", result.red)}
      </div>
      <div class="debrief-foot">Full rationale and a downloadable report are available from the admin console.</div>`;
  }

  // ---- Connection indicator ----
  function setConnStatus(online) {
    const dot = document.getElementById("conn-dot");
    const text = document.getElementById("conn-text");
    dot.className = "conn-dot " + (online ? "online" : "offline");
    text.textContent = online ? "live" : "disconnected";
  }

  // ---- QR Code ----
  // Uses qrcodejs from CDN. QR div is in the header — always visible.
  let qrGenerated = false;

  function renderQR() {
    if (qrGenerated) return;
    if (typeof QRCode === "undefined") return;  // called again from script onload

    const container = document.getElementById("qr-code");
    if (!container) return;

    const href = window.location.href;
    const voteUrl = href
      .replace(/\/index\.html(\?.*)?$/, "")
      .replace(/\/index\.TEST\.html(\?.*)?$/, "")
      .replace(/\/$/, "") + "/vote.html";

    // Render into an off-screen but sized element so canvas gets real dimensions
    const tmp = document.createElement("div");
    tmp.style.cssText = "position:fixed;left:-9999px;top:0;width:80px;height:80px;visibility:hidden;";
    document.body.appendChild(tmp);

    try {
      new QRCode(tmp, {
        text: voteUrl,
        width: 80, height: 80,
        colorDark: "#000000", colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M
      });
      // qrcodejs sets canvas display:none then switches to display:block asynchronously
      // Wait a tick then grab whichever element it has made visible
      setTimeout(() => {
        const canvas = tmp.querySelector("canvas");
        const img    = tmp.querySelector("img");
        const generated = (canvas && canvas.style.display !== "none") ? canvas : (img || canvas);
        if (generated) {
          generated.style.display = "block";
          generated.style.width   = "64px";
          generated.style.height  = "64px";
          generated.style.borderRadius = "4px";
          container.innerHTML = "";
          container.appendChild(generated);
          qrGenerated = true;
        }
        if (document.body.contains(tmp)) document.body.removeChild(tmp);
      }, 100);
    } catch(e) {
      console.warn("QR generation failed:", e);
      if (document.body.contains(tmp)) document.body.removeChild(tmp);
    }
  }


  // ---- Vote strip (QR + tally on projector) ----
  function renderVoteStrip(state) {
    const strip = document.getElementById("vote-strip");
    if (!strip) return;
    if (state.phase !== "playing") { strip.style.display = "none"; return; }
    strip.style.display = "flex";

    const side = state.turn;
    const currentTurnKey = state.turnKey || ("t" + (state.turnNumber||1) + "-" + side);
    const allVotes = (state.votes && state.votes[currentTurnKey]) || {};
    const cfg = state.votingConfig || {};
    const expected = side === "blue" ? (cfg.blueExpected||5) : (cfg.redExpected||5);
    const quorum = Math.ceil(expected / 2);
    const votePhase = state.votePhase || "card";
    const fillClass = side === "blue" ? "blue-fill" : "red-fill";

    // Build tally for current phase
    const tally = {};
    let totalVotes = 0;
    if (votePhase === "card") {
      Object.values(allVotes).forEach(v => {
        if (v.side === side && v.cardId) { tally[v.cardId] = (tally[v.cardId]||0)+1; totalVotes++; }
      });
    } else {
      // "move" or "move-only"
      Object.values(allVotes).forEach(v => {
        if (v.side === side && v.fromCell && v.toCell) {
          const k = v.fromCell + "|" + v.toCell; tally[k] = (tally[k]||0)+1; totalVotes++;
        }
      });
    }
    const sorted = Object.entries(tally).sort((a,b)=>b[1]-a[1]);
    const winnerEntry = sorted.find(([,c])=>c>=quorum);

    const tallyEl = document.getElementById("vote-strip-tally");
    tallyEl.innerHTML = "";
    const phaseLabel = votePhase === "card" ? "Round 2 — Card vote (clash)" :
                       votePhase === "move-only" ? "Move vote (no combat)" :
                       "Round 1 — Move vote";
    const hdr = document.createElement("div");
    hdr.style.cssText = "font-family:var(--font-mono);font-size:10px;color:var(--text-low);margin-bottom:3px;";
    hdr.textContent = `${side.toUpperCase()} · ${phaseLabel} · ${totalVotes}/${expected} (need ${quorum})`;
    tallyEl.appendChild(hdr);

    if (sorted.length === 0) {
      const empty = document.createElement("div"); empty.className = "vote-no-votes";
      empty.textContent = "Waiting for votes…"; tallyEl.appendChild(empty);
    } else {
      sorted.slice(0,4).forEach(([key, count]) => {
        let label = key;
        if (votePhase === "card") {
          const card = SCENARIO_CARDS.find(c=>c.id===key);
          label = card ? card.name : key;
        } else {
          const [from,to] = key.split("|");
          label = from + " → " + to;
        }
        const pct = Math.min(100, Math.round((count/expected)*100));
        const isWin = count >= quorum;
        const row = document.createElement("div"); row.className = "vote-tally-row";
        row.innerHTML = `<div class="vote-tally-label"><span>${isWin?"✓ ":""}${label}</span><span>${count}/${quorum}</span></div><div class="vote-tally-track"><div class="vote-tally-fill ${isWin?"won":fillClass}" style="width:${pct}%"></div></div>`;
        tallyEl.appendChild(row);
      });
    }

    const quorumEl = document.getElementById("vote-strip-quorum");
    if (winnerEntry) {
      let winLabel = winnerEntry[0];
      if (votePhase === "card") { const wc = SCENARIO_CARDS.find(c=>c.id===winnerEntry[0]); winLabel = wc?wc.name:winLabel; }
      else { const [f,t] = winnerEntry[0].split("|"); winLabel = f+" → "+t; }
      quorumEl.style.display = "block";
      quorumEl.textContent = `✓ QUORUM — "${winLabel}" selected!`;
    } else { quorumEl.style.display = "none"; }
  }

  // ---- Main render dispatch ----
  function renderAll(state) {
    if (!state) return;
    renderBoard(state);
    renderRoster(state, "blue", "blue-roster");
    renderRoster(state, "red", "red-roster");
    renderDetection(state);
    renderStatus(state);
    renderActiveScenario(state);
    renderScenarioCards(state);
    renderVoteStrip(state);
    updateBoardCountdown(state);
    renderLog(state);
    renderWin(state);
    // Vote strip / now-playing banners toggle visibility on state changes,
    // which shifts how much vertical room the board has — re-fit it.
    scheduleBoardFit();
  }

  // ---- Board-side countdown timer ----
  function updateBoardCountdown(state) {
    const wrap = document.getElementById("vote-timer-wrap");
    const numEl = document.getElementById("board-timer-num");
    const fillEl = document.getElementById("board-ring-fill");
    const phaseEl = document.getElementById("board-timer-phase");
    if (!wrap || !numEl) return;

    if (state.phase !== "playing" || !state.voteDeadline) {
      wrap.style.display = "none";
      if (boardCountdownInterval) { clearInterval(boardCountdownInterval); boardCountdownInterval = null; }
      return;
    }
    wrap.style.display = "flex";
    phaseEl.textContent = (state.votePhase || "card") === "card" ? "Card vote" : "Move vote";

    if (boardCountdownInterval) { clearInterval(boardCountdownInterval); boardCountdownInterval = null; }

    const deadline = state.voteDeadline;
    function tick() {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      numEl.textContent = remaining;
      const pct = remaining / VOTE_DURATION_S;
      fillEl.style.strokeDashoffset = BOARD_RING_CIRCUMFERENCE * (1 - pct);
      if (remaining <= 5) fillEl.className = "ring-fill urgent";
      else if (remaining <= 10) fillEl.className = "ring-fill warning";
      else fillEl.className = "ring-fill";
      if (remaining <= 0) { clearInterval(boardCountdownInterval); boardCountdownInterval = null; }
    }
    tick();
    boardCountdownInterval = setInterval(tick, 500);
  }

  // ---- Elimination animation on the public board ----
  function triggerBoardElimination(row, col) {
    const cellEl = document.getElementById(`cell-${row}-${col}`);
    if (!cellEl) return;
    cellEl.classList.add("zap-out");
    setTimeout(() => cellEl.classList.remove("zap-out"), 700);
  }

  // ---- Boot ----
  let prevBoard = {};

  function detectAndAnimateEliminations(newBoard) {
    // Compare with previous board: find cells that had a living piece and now don't
    Object.entries(prevBoard).forEach(([key, prevUnit]) => {
      if (!prevUnit || prevUnit.eliminated) return;
      const newUnit = newBoard[key];
      // Cell is now empty or has a different unit → previous unit was eliminated
      if (!newUnit || newUnit.eliminated || newUnit.instanceId !== prevUnit.instanceId) {
        const { row, col } = parseCellKey(key);
        triggerBoardElimination(row, col);
      }
    });
    prevBoard = newBoard ? JSON.parse(JSON.stringify(newBoard)) : {};
  }

  function boot() {
    setConnStatus(false);
    FireState.subscribe((state, err) => {
      if (err) {
        setConnStatus(false);
        document.getElementById("conn-text").textContent = "config error \u2014 see console";
        console.error(err);
        return;
      }
      setConnStatus(true);
      if (!state) return; // empty room, waiting for admin to initialize
      // Keep the active game pack in sync with this game's mode (Stage 3)
      if (state.mode && typeof setActivePack === "function") setActivePack(state.mode);
      if (state.board) detectAndAnimateEliminations(state.board);
      renderAll(state);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    renderQR();   // will retry if CDN library not loaded yet
    boot();
  });
})();
