export const name = "Ludo Master Tool";
export const description = "A complete, interactive Ludo companion and board game with AI bots, dynamic token clustering, custom rules, and audio synthesis.";

export function init(container) {
  container.style.overflow = "auto";

  const wrapper = document.createElement("div");
  wrapper.style.cssText = "display:flex;flex-direction:column;padding:1.25rem;gap:1.25rem;min-width:0;color:var(--color-text);font-family:system-ui, -apple-system, sans-serif;";
  container.appendChild(wrapper);

  let audioCtx = null;

  function initAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
  }

  function playSynthSound(type) {
    if (!audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      const now = audioCtx.currentTime;

      if (type === "roll") {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.15);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === "move") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === "capture") {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.linearRampToValueAtTime(150, now + 0.3);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (type === "finish") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.1);
        osc.frequency.setValueAtTime(783.99, now + 0.2);
        osc.frequency.setValueAtTime(1046.50, now + 0.3);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
      }
    } catch (e) {
      void e;
    }
  }

  const DB_NAME = "LudoMasterDB";
  const STORE_NAME = "gameState";
  const DB_VERSION = 1;

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  function saveState(state) {
    openDB().then((db) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(state, "current_game");
    }).catch((e) => {
      void e;
    });
  }

  function loadState() {
    return new Promise((resolve) => {
      openDB().then((db) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.get("current_game");
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      }).catch(() => {
        resolve(null);
      });
    });
  }

  function clearState() {
    openDB().then((db) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.delete("current_game");
    }).catch((e) => {
      void e;
    });
  }

  const TRACK = [
    [1,6], [2,6], [3,6], [4,6], [5,6],
    [6,5], [6,4], [6,3], [6,2], [6,1], [6,0],
    [7,0],
    [8,0], [8,1], [8,2], [8,3], [8,4], [8,5],
    [9,6], [10,6], [11,6], [12,6], [13,6], [14,6],
    [14,7],
    [14,8], [13,8], [12,8], [11,8], [10,8], [9,8],
    [8,9], [8,10], [8,11], [8,12], [8,13], [8,14],
    [7,14],
    [6,14], [6,13], [6,12], [6,11], [6,10], [6,9],
    [5,8], [4,8], [3,8], [2,8], [1,8], [0,8],
    [0,7],
    [0,6]
  ];

  const STAR_ZONES = [14, 21, 40, 47];
  const START_ZONES = [0, 13, 26, 39];

  function isSafeCell(x, y) {
    for (let i = 0; i < TRACK.length; i++) {
      if (TRACK[i][0] === x && TRACK[i][1] === y) {
        if (STAR_ZONES.includes(i) || START_ZONES.includes(i)) {
          return true;
        }
      }
    }
    return false;
  }

  let players = [
    { id: 0, name: "Red", color: "#EF4444", lightColor: "#FEE2E2", active: true, type: "human", pieces: [-1, -1, -1, -1] },
    { id: 1, name: "Green", color: "#10B981", lightColor: "#D1FAE5", active: true, type: "bot", pieces: [-1, -1, -1, -1] },
    { id: 2, name: "Yellow", color: "#F59E0B", lightColor: "#FEF3C7", active: true, type: "bot", pieces: [-1, -1, -1, -1] },
    { id: 3, name: "Blue", color: "#3B82F6", lightColor: "#DBEAFE", active: true, type: "bot", pieces: [-1, -1, -1, -1] }
  ];

  let currentPlayerIdx = 0;
  let currentRoll = 0;
  let gamePhase = "waiting_for_roll";
  let consecutiveSixes = 0;
  let botTimer = null;
  let animTimer = null;

  function persistCurrentState() {
    saveState({
      players,
      currentPlayerIdx,
      currentRoll,
      gamePhase,
      consecutiveSixes,
      presetValue: presetSelector.value
    });
  }

  const header = document.createElement("div");
  header.style.cssText = "display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.75rem;border-bottom:1px solid var(--color-border);padding-bottom:1rem;";
  
  const titleGroup = document.createElement("div");
  const mainTitle = document.createElement("h1");
  mainTitle.innerText = "Ludo Master";
  mainTitle.style.cssText = "font-size:1.4rem;font-weight:700;margin:0;color:var(--color-text);";
  const subTitle = document.createElement("p");
  subTitle.innerText = "Simulate matches, play against bots, or challenge friends.";
  subTitle.style.cssText = "font-size:0.78rem;color:var(--color-text-muted);margin:0;margin-top:2px;";
  titleGroup.appendChild(mainTitle);
  titleGroup.appendChild(subTitle);
  header.appendChild(titleGroup);

  const headerControls = document.createElement("div");
  headerControls.style.cssText = "display:flex;gap:0.5rem;align-items:center;";

  const resetBtn = document.createElement("button");
  resetBtn.innerText = "Restart Turn";
  resetBtn.style.cssText = "padding:0.4rem 0.8rem;border:1px solid var(--color-border);border-radius:6px;background:var(--color-surface);color:var(--color-text);font-size:0.78rem;cursor:pointer;font-weight:600;";
  headerControls.appendChild(resetBtn);

  const newGameBtn = document.createElement("button");
  newGameBtn.innerText = "New Game";
  newGameBtn.style.cssText = "padding:0.4rem 0.8rem;border:none;border-radius:6px;background:var(--color-primary);color:#fff;font-size:0.78rem;cursor:pointer;font-weight:600;";
  headerControls.appendChild(newGameBtn);

  header.appendChild(headerControls);
  wrapper.appendChild(header);

  const mainArea = document.createElement("div");

  function handleLayoutResize() {
    if (window.innerWidth >= 850) {
      mainArea.style.cssText = "display:grid;grid-template-columns:1.2fr 1fr;gap:1.5rem;align-items:start;min-width:0;width:100%;";
    } else {
      mainArea.style.cssText = "display:flex;flex-direction:column;gap:1.25rem;align-items:center;min-width:0;width:100%;";
    }
  }
  window.addEventListener("resize", handleLayoutResize);
  handleLayoutResize();

  wrapper.appendChild(mainArea);

  const boardContainer = document.createElement("div");
  boardContainer.style.cssText = "background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius);padding:0.75rem;display:flex;justify-content:center;align-items:center;box-shadow:var(--neu-raised-sm);position:relative;aspect-ratio:1/1;width:100%;max-width:480px;margin:0 auto;";
  mainArea.appendChild(boardContainer);

  const sidebar = document.createElement("div");
  sidebar.style.cssText = "display:flex;flex-direction:column;gap:1rem;min-width:0;width:100%;max-width:480px;";
  mainArea.appendChild(sidebar);

  const turnCard = document.createElement("div");
  turnCard.style.cssText = "border:1px solid var(--color-border);border-radius:var(--radius);background:var(--color-surface);padding:1rem;display:flex;flex-direction:column;gap:0.75rem;box-shadow:var(--neu-raised-sm);";
  sidebar.appendChild(turnCard);

  const turnHeader = document.createElement("div");
  turnHeader.style.cssText = "display:flex;align-items:center;justify-content:space-between;";
  
  const turnIndicatorText = document.createElement("div");
  turnIndicatorText.style.cssText = "font-size:1.1rem;font-weight:700;display:flex;align-items:center;gap:0.5rem;";
  turnHeader.appendChild(turnIndicatorText);

  const turnIndicatorColor = document.createElement("span");
  turnIndicatorColor.style.cssText = "display:inline-block;width:16px;height:16px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,0.2);";
  turnIndicatorText.appendChild(turnIndicatorColor);

  const turnIndicatorLabel = document.createElement("span");
  turnIndicatorText.appendChild(turnIndicatorLabel);

  const rollBadge = document.createElement("span");
  rollBadge.style.cssText = "font-size:0.73rem;padding:0.2rem 0.5rem;border-radius:4px;background:var(--color-bg);color:var(--color-text-muted);border:1px solid var(--color-border);";
  turnHeader.appendChild(rollBadge);
  turnCard.appendChild(turnHeader);

  const diceSection = document.createElement("div");
  diceSection.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:0.5rem 0;";
  turnCard.appendChild(diceSection);

  const diceWidget = document.createElement("div");
  diceWidget.style.cssText = "width:64px;height:64px;background:var(--color-bg);border:2px solid var(--color-border);border-radius:12px;cursor:pointer;display:flex;justify-content:center;align-items:center;font-size:2rem;font-weight:bold;user-select:none;box-shadow:var(--neu-inset-sm);transition:all 0.15s ease-in-out;position:relative;overflow:hidden;";
  diceSection.appendChild(diceWidget);

  const diceInst = document.createElement("div");
  diceInst.style.cssText = "flex:1;display:flex;flex-direction:column;gap:0.25rem;";
  const diceTitle = document.createElement("div");
  diceTitle.innerText = "Dice Value";
  diceTitle.style.cssText = "font-size:0.82rem;font-weight:600;";
  const diceDesc = document.createElement("div");
  diceDesc.innerText = "Click the dice to roll";
  diceDesc.style.cssText = "font-size:0.72rem;color:var(--color-text-muted);";
  diceInst.appendChild(diceTitle);
  diceInst.appendChild(diceDesc);
  diceSection.appendChild(diceInst);

  const rollActionBtn = document.createElement("button");
  rollActionBtn.innerText = "Roll";
  rollActionBtn.style.cssText = "padding:0.5rem 1rem;border:none;border-radius:6px;background:var(--color-primary);color:#fff;font-size:0.82rem;font-weight:600;cursor:pointer;align-self:stretch;";
  diceSection.appendChild(rollActionBtn);

  const settingsCard = document.createElement("div");
  settingsCard.style.cssText = "border:1px solid var(--color-border);border-radius:var(--radius);background:var(--color-surface);padding:1rem;display:flex;flex-direction:column;gap:0.75rem;box-shadow:var(--neu-raised-sm);";
  sidebar.appendChild(settingsCard);

  const settingsHeaderRow = document.createElement("div");
  settingsHeaderRow.style.cssText = "display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;";
  settingsCard.appendChild(settingsHeaderRow);

  const settingsTitle = document.createElement("div");
  settingsTitle.innerText = "Player Setup & Match Rules";
  settingsTitle.style.cssText = "font-size:0.88rem;font-weight:600;color:var(--color-text);";
  settingsHeaderRow.appendChild(settingsTitle);

  const presetSelector = document.createElement("select");
  presetSelector.style.cssText = "padding:0.25rem 0.5rem;border:1px solid var(--color-border);border-radius:6px;background:var(--color-bg);color:var(--color-text);font-size:0.78rem;outline:none;";
  const optPreset4 = document.createElement("option");
  optPreset4.value = "4";
  optPreset4.innerText = "4 Players (All)";
  const optPreset3 = document.createElement("option");
  optPreset3.value = "3";
  optPreset3.innerText = "3 Players (Red, Grn, Yel)";
  const optPreset2Opp = document.createElement("option");
  optPreset2Opp.value = "2-opp";
  optPreset2Opp.innerText = "2 Players (Red vs Yellow)";
  const optPreset2Adj = document.createElement("option");
  optPreset2Adj.value = "2-adj";
  optPreset2Adj.innerText = "2 Players (Red vs Green)";

  presetSelector.appendChild(optPreset4);
  presetSelector.appendChild(optPreset3);
  presetSelector.appendChild(optPreset2Opp);
  presetSelector.appendChild(optPreset2Adj);
  settingsHeaderRow.appendChild(presetSelector);

  const settingsContainer = document.createElement("div");
  settingsContainer.style.cssText = "display:flex;flex-direction:column;gap:0.5rem;";
  settingsCard.appendChild(settingsContainer);

  const logCard = document.createElement("div");
  logCard.style.cssText = "border:1px solid var(--color-border);border-radius:var(--radius);background:var(--color-surface);padding:1rem;display:flex;flex-direction:column;gap:0.5rem;box-shadow:var(--neu-raised-sm);";
  sidebar.appendChild(logCard);

  const logTitle = document.createElement("div");
  logTitle.innerText = "Game Logs";
  logTitle.style.cssText = "font-size:0.88rem;font-weight:600;color:var(--color-text);";
  logCard.appendChild(logTitle);

  const logBox = document.createElement("div");
  logBox.style.cssText = "height:120px;background:var(--color-bg);border:1px solid var(--color-border);border-radius:6px;padding:0.5rem;overflow-y:auto;display:flex;flex-direction:column;gap:0.25rem;font-family:monospace;font-size:0.75rem;";
  logCard.appendChild(logBox);

  function pushLog(text, color = "var(--color-text)") {
    const item = document.createElement("div");
    item.style.cssText = "line-height:1.2;word-break:break-word;";
    item.innerHTML = `<span style="color:${color};">> ${text}</span>`;
    logBox.appendChild(item);
    logBox.scrollTop = logBox.scrollHeight;
  }

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 600 600");
  svg.style.cssText = "width:100%;height:100%;user-select:none;touch-action:none;display:block;";
  boardContainer.appendChild(svg);

  function createSVGElement(tag, attrs) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attrs)) {
      el.setAttribute(key, value);
    }
    return el;
  }

  let tokensGroup = null;

  function drawBoardFrame() {
    svg.innerHTML = "";

    const outerBg = createSVGElement("rect", {
      width: "600",
      height: "600",
      fill: "var(--color-bg)",
      stroke: "var(--color-border)",
      "stroke-width": "2"
    });
    svg.appendChild(outerBg);

    const cellsG = createSVGElement("g", {});
    svg.appendChild(cellsG);

    for (let y = 0; y < 15; y++) {
      for (let x = 0; x < 15; x++) {
        let color = "transparent";

        if (x < 6 && y < 6) continue;
        if (x >= 9 && y < 6) continue;
        if (x >= 9 && y >= 9) continue;
        if (x < 6 && y >= 9) continue;

        if (x >= 6 && x <= 8 && y >= 6 && y <= 8) continue;

        if (x === 1 && y === 6) color = players[0].color;
        else if (x >= 1 && x <= 5 && y === 7) color = players[0].color;
        else if (x === 8 && y === 1) color = players[1].color;
        else if (x === 7 && y >= 1 && y <= 5) color = players[1].color;
        else if (x === 13 && y === 8) color = players[2].color;
        else if (x >= 9 && x <= 13 && y === 7) color = players[2].color;
        else if (x === 6 && y === 13) color = players[3].color;
        else if (x === 7 && y >= 9 && y <= 13) color = players[3].color;

        let isStar = false;
        for (let i = 0; i < TRACK.length; i++) {
          if (TRACK[i][0] === x && TRACK[i][1] === y) {
            if (STAR_ZONES.includes(i)) {
              isStar = true;
            }
          }
        }

        const rect = createSVGElement("rect", {
          x: (x * 40).toString(),
          y: (y * 40).toString(),
          width: "40",
          height: "40",
          fill: color !== "transparent" ? color : "var(--color-surface)",
          stroke: "var(--color-border)",
          "stroke-width": "1"
        });
        cellsG.appendChild(rect);

        if (isStar) {
          const starSym = createSVGElement("polygon", {
            points: `${x * 40 + 20},${y * 40 + 8} ${x * 40 + 24},${y * 40 + 16} ${x * 40 + 33},${y * 40 + 17} ${x * 40 + 26},${y * 40 + 23} ${x * 40 + 28},${y * 40 + 32} ${x * 40 + 20},${y * 40 + 27} ${x * 40 + 12},${y * 40 + 32} ${x * 40 + 14},${y * 40 + 23} ${x * 40 + 7},${y * 40 + 17} ${x * 40 + 16},${y * 40 + 16}`,
            fill: "var(--color-text-muted)",
            opacity: "0.4"
          });
          cellsG.appendChild(starSym);
        }
      }
    }

    const drawHomeYard = (x, y, player) => {
      const g = createSVGElement("g", {});
      
      const base = createSVGElement("rect", {
        x: (x * 40).toString(),
        y: (y * 40).toString(),
        width: "240",
        height: "240",
        fill: player.color,
        rx: "12"
      });
      g.appendChild(base);

      const inner = createSVGElement("rect", {
        x: (x * 40 + 35).toString(),
        y: (y * 40 + 35).toString(),
        width: "170",
        height: "170",
        fill: "var(--color-surface)",
        rx: "8"
      });
      g.appendChild(inner);

      const slots = [
        { cx: x * 40 + 75, cy: y * 40 + 75 },
        { cx: x * 40 + 165, cy: y * 40 + 75 },
        { cx: x * 40 + 75, cy: y * 40 + 165 },
        { cx: x * 40 + 165, cy: y * 40 + 165 }
      ];

      slots.forEach(slot => {
        const slotCircle = createSVGElement("circle", {
          cx: slot.cx.toString(),
          cy: slot.cy.toString(),
          r: "24",
          fill: "var(--color-bg)",
          stroke: player.color,
          "stroke-width": "3"
        });
        g.appendChild(slotCircle);
      });

      svg.appendChild(g);
    };

    drawHomeYard(0, 0, players[0]);
    drawHomeYard(9, 0, players[1]);
    drawHomeYard(9, 9, players[2]);
    drawHomeYard(0, 9, players[3]);

    const centerG = createSVGElement("g", {});
    const pRedTri = createSVGElement("polygon", {
      points: "240,240 240,360 300,300",
      fill: players[0].color
    });
    const pGreenTri = createSVGElement("polygon", {
      points: "240,240 360,240 300,300",
      fill: players[1].color
    });
    const pYellowTri = createSVGElement("polygon", {
      points: "360,240 360,360 300,300",
      fill: players[2].color
    });
    const pBlueTri = createSVGElement("polygon", {
      points: "240,360 360,360 300,300",
      fill: players[3].color
    });

    centerG.appendChild(pRedTri);
    centerG.appendChild(pGreenTri);
    centerG.appendChild(pYellowTri);
    centerG.appendChild(pBlueTri);

    const centerBorder = createSVGElement("polygon", {
      points: "240,240 360,240 360,360 240,360",
      fill: "none",
      stroke: "var(--color-border)",
      "stroke-width": "2"
    });
    centerG.appendChild(centerBorder);

    const cross1 = createSVGElement("line", { x1: "240", y1: "240", x2: "360", y2: "360", stroke: "var(--color-border)", "stroke-width": "1" });
    const cross2 = createSVGElement("line", { x1: "240", y1: "360", x2: "360", y2: "240", stroke: "var(--color-border)", "stroke-width": "1" });
    centerG.appendChild(cross1);
    centerG.appendChild(cross2);

    svg.appendChild(centerG);

    tokensGroup = createSVGElement("g", {});
    svg.appendChild(tokensGroup);
  }

  function getBaseCoordinates(playerIdx, pieceIdx) {
    if (playerIdx === 0) {
      return pieceIdx === 0 ? { x: 75, y: 75 } : pieceIdx === 1 ? { x: 165, y: 75 } : pieceIdx === 2 ? { x: 75, y: 165 } : { x: 165, y: 165 };
    } else if (playerIdx === 1) {
      return pieceIdx === 0 ? { x: 435, y: 75 } : pieceIdx === 1 ? { x: 525, y: 75 } : pieceIdx === 2 ? { x: 435, y: 165 } : { x: 525, y: 165 };
    } else if (playerIdx === 2) {
      return pieceIdx === 0 ? { x: 435, y: 435 } : pieceIdx === 1 ? { x: 525, y: 435 } : pieceIdx === 2 ? { x: 435, y: 525 } : { x: 525, y: 525 };
    } else {
      return pieceIdx === 0 ? { x: 75, y: 435 } : pieceIdx === 1 ? { x: 165, y: 435 } : pieceIdx === 2 ? { x: 75, y: 525 } : { x: 165, y: 525 };
    }
  }

  function getStretchCoordinates(playerIdx, step) {
    const indexInStretch = step - 51;
    if (playerIdx === 0) {
      return { x: (1 + indexInStretch) * 40 + 20, y: 7 * 40 + 20 };
    } else if (playerIdx === 1) {
      return { x: 7 * 40 + 20, y: (1 + indexInStretch) * 40 + 20 };
    } else if (playerIdx === 2) {
      return { x: (13 - indexInStretch) * 40 + 20, y: 7 * 40 + 20 };
    } else {
      return { x: 7 * 40 + 20, y: (13 - indexInStretch) * 40 + 20 };
    }
  }

  function getFinishCoordinates(playerIdx) {
    if (playerIdx === 0) return { x: 265, y: 300 };
    if (playerIdx === 1) return { x: 300, y: 265 };
    if (playerIdx === 2) return { x: 335, y: 300 };
    return { x: 300, y: 335 };
  }

  function getTrackCoordinates(playerIdx, step) {
    if (step === -1) {
      return null;
    }
    if (step >= 56) {
      return getFinishCoordinates(playerIdx);
    }
    if (step >= 51) {
      return getStretchCoordinates(playerIdx, step);
    }
    let globalIndex = 0;
    if (playerIdx === 0) globalIndex = step;
    else if (playerIdx === 1) globalIndex = (step + 13) % 52;
    else if (playerIdx === 2) globalIndex = (step + 26) % 52;
    else if (playerIdx === 3) globalIndex = (step + 39) % 52;

    const coords = TRACK[globalIndex];
    return { x: coords[0] * 40 + 20, y: coords[1] * 40 + 20 };
  }

  function getClusteredCoordinates(playerIdx, pieceIdx, step) {
    if (step === -1) {
      return getBaseCoordinates(playerIdx, pieceIdx);
    }
    const center = getTrackCoordinates(playerIdx, step);
    if (!center) return { x: 0, y: 0 };

    if (step === 56) {
      const offset = [
        { dx: -12, dy: -12 },
        { dx: 12, dy: -12 },
        { dx: -12, dy: 12 },
        { dx: 12, dy: 12 }
      ][pieceIdx];
      return { x: center.x + offset.dx, y: center.y + offset.dy };
    }

    const key = `${Math.round(center.x)},${Math.round(center.y)}`;
    const overlapping = [];

    players.forEach(p => {
      if (!p.active) return;
      p.pieces.forEach((st, pIdx) => {
        if (st === -1) return;
        const otherCenter = getTrackCoordinates(p.id, st);
        if (otherCenter) {
          const otherKey = `${Math.round(otherCenter.x)},${Math.round(otherCenter.y)}`;
          if (otherKey === key) {
            overlapping.push({ pId: p.id, pieceIdx: pIdx });
          }
        }
      });
    });

    if (overlapping.length <= 1) {
      return center;
    }

    const selfIdx = overlapping.findIndex(o => o.pId === playerIdx && o.pieceIdx === pieceIdx);
    const count = overlapping.length;

    let dx = 0;
    let dy = 0;
    const offsetDistance = 8;

    if (count === 2) {
      const angle = selfIdx === 0 ? 0 : Math.PI;
      dx = Math.cos(angle) * offsetDistance;
      dy = Math.sin(angle) * offsetDistance;
    } else if (count === 3) {
      const angle = (selfIdx * 2 * Math.PI) / 3;
      dx = Math.cos(angle) * offsetDistance;
      dy = Math.sin(angle) * offsetDistance;
    } else {
      const angle = (selfIdx * 2 * Math.PI) / count;
      dx = Math.cos(angle) * offsetDistance;
      dy = Math.sin(angle) * offsetDistance;
    }

    return { x: center.x + dx, y: center.y + dy };
  }

  function drawTokens() {
    if (!tokensGroup) return;
    tokensGroup.innerHTML = "";

    const activePlayersCount = players.filter(p => p.active).length;
    if (activePlayersCount === 0) return;

    players.forEach(player => {
      if (!player.active) return;

      player.pieces.forEach((step, pieceIdx) => {
        const coords = getClusteredCoordinates(player.id, pieceIdx, step);
        const tokenG = createSVGElement("g", {
          class: "ludo-token",
          style: "cursor:pointer;transition:transform 0.15s ease-out;"
        });

        const shadow = createSVGElement("circle", {
          cx: (coords.x + 2).toString(),
          cy: (coords.y + 2).toString(),
          r: "12",
          fill: "rgba(0,0,0,0.3)"
        });
        tokenG.appendChild(shadow);

        const outerCircle = createSVGElement("circle", {
          cx: coords.x.toString(),
          cy: coords.y.toString(),
          r: "12",
          fill: player.color,
          stroke: "#FFFFFF",
          "stroke-width": "2"
        });
        tokenG.appendChild(outerCircle);

        const innerCircle = createSVGElement("circle", {
          cx: coords.x.toString(),
          cy: coords.y.toString(),
          r: "6",
          fill: "#FFFFFF"
        });
        tokenG.appendChild(innerCircle);

        const isMovable = getMovablePieces(currentPlayerIdx, currentRoll).includes(pieceIdx) && gamePhase === "waiting_for_move" && currentPlayerIdx === player.id;
        
        if (isMovable) {
          const glow = createSVGElement("circle", {
            cx: coords.x.toString(),
            cy: coords.y.toString(),
            r: "18",
            fill: "none",
            stroke: player.color,
            "stroke-width": "3",
            opacity: "0.8",
            style: "animation: pulseGlow 1.5s infinite;"
          });
          tokenG.appendChild(glow);

          tokenG.addEventListener("mouseenter", () => {
            outerCircle.setAttribute("r", "14");
          });
          tokenG.addEventListener("mouseleave", () => {
            outerCircle.setAttribute("r", "12");
          });
          tokenG.addEventListener("click", () => {
            initAudio();
            movePiece(player.id, pieceIdx, currentRoll);
          });
        }

        tokensGroup.appendChild(tokenG);
      });
    });
  }

  function getMovablePieces(playerIdx, rollVal) {
    if (rollVal === 0) return [];
    const player = players[playerIdx];
    const movable = [];

    player.pieces.forEach((step, pieceIdx) => {
      if (step === -1) {
        if (rollVal === 6) movable.push(pieceIdx);
      } else if (step === 56) {
        void step;
      } else if (step + rollVal <= 56) {
        movable.push(pieceIdx);
      }
    });

    return movable;
  }

  function movePiece(playerIdx, pieceIdx, rollVal) {
    if (animTimer) return;
    const player = players[playerIdx];
    const currentStep = player.pieces[pieceIdx];
    const targetStep = currentStep === -1 ? 0 : currentStep + rollVal;

    gamePhase = "animating";
    updateUI();

    let stepCounter = currentStep;

    function hop() {
      if (stepCounter < targetStep) {
        stepCounter = stepCounter === -1 ? 0 : stepCounter + 1;
        player.pieces[pieceIdx] = stepCounter;
        playSynthSound("move");
        drawTokens();

        animTimer = setTimeout(hop, 150);
      } else {
        animTimer = null;
        onMovementComplete(playerIdx, pieceIdx, targetStep);
      }
    }

    hop();
  }

  function onMovementComplete(playerIdx, pieceIdx, targetStep) {
    const player = players[playerIdx];
    let extraTurn = false;

    if (targetStep === 56) {
      playSynthSound("finish");
      pushLog(`${player.name} finished piece ${pieceIdx + 1}!`, player.color);
      extraTurn = true;
    } else if (targetStep < 56) {
      const targetCoords = getTrackCoordinates(playerIdx, targetStep);
      if (targetCoords && !isSafeCell(targetCoords.x / 40, targetCoords.y / 40)) {
        let captured = false;
        players.forEach(opp => {
          if (opp.id === playerIdx || !opp.active) return;
          opp.pieces.forEach((oppStep, oppPieceIdx) => {
            if (oppStep === -1 || oppStep >= 56) return;
            const oppCoords = getTrackCoordinates(opp.id, oppStep);
            if (oppCoords && Math.abs(oppCoords.x - targetCoords.x) < 2 && Math.abs(oppCoords.y - targetCoords.y) < 2) {
              opp.pieces[oppPieceIdx] = -1;
              captured = true;
              pushLog(`${player.name} captured ${opp.name}'s piece ${oppPieceIdx + 1}!`, player.color);
            }
          });
        });

        if (captured) {
          playSynthSound("capture");
          extraTurn = true;
        }
      }
    }

    if (currentRoll === 6) {
      extraTurn = true;
    }

    if (checkVictory(playerIdx)) {
      gamePhase = "game_over";
      pushLog(`${player.name} has won the match!`, player.color);
      persistCurrentState();
      updateUI();
      return;
    }

    if (extraTurn) {
      gamePhase = "waiting_for_roll";
      currentRoll = 0;
      pushLog(`${player.name} gets an extra turn!`, player.color);
    } else {
      nextTurn();
    }

    persistCurrentState();
    updateUI();
  }

  function checkVictory(playerIdx) {
    return players[playerIdx].pieces.every(step => step === 56);
  }

  function nextTurn() {
    consecutiveSixes = 0;
    currentRoll = 0;
    let nextIdx = (currentPlayerIdx + 1) % 4;
    for (let i = 0; i < 4; i++) {
      if (players[nextIdx].active && !checkVictory(nextIdx)) {
        currentPlayerIdx = nextIdx;
        gamePhase = "waiting_for_roll";
        persistCurrentState();
        return;
      }
      nextIdx = (nextIdx + 1) % 4;
    }
    gamePhase = "game_over";
    persistCurrentState();
  }

  function executeRoll() {
    if (gamePhase !== "waiting_for_roll") return;
    initAudio();

    gamePhase = "rolling";
    updateUI();
    playSynthSound("roll");

    let rolls = 0;
    const interval = setInterval(() => {
      diceWidget.innerText = Math.floor(Math.random() * 6 + 1).toString();
      rolls++;
      if (rolls >= 6) {
        clearInterval(interval);
        currentRoll = Math.floor(Math.random() * 6 + 1);
        diceWidget.innerText = currentRoll.toString();
        onRollComplete(currentRoll);
      }
    }, 80);
  }

  function onRollComplete(rolledVal) {
    const player = players[currentPlayerIdx];
    pushLog(`${player.name} rolled a ${rolledVal}`, player.color);

    if (rolledVal === 6) {
      consecutiveSixes++;
      if (consecutiveSixes === 3) {
        pushLog(`Three 6s in a row! Turn passes to the next player.`, "#EF4444");
        nextTurn();
        updateUI();
        return;
      }
    } else {
      consecutiveSixes = 0;
    }

    const movable = getMovablePieces(currentPlayerIdx, rolledVal);

    if (movable.length === 0) {
      pushLog(`No legal moves for ${player.name}.`, "var(--color-text-muted)");
      setTimeout(() => {
        nextTurn();
        updateUI();
      }, 1000);
    } else {
      gamePhase = "waiting_for_move";
      persistCurrentState();
      updateUI();
    }
  }

  function updateUI() {
    drawTokens();

    const activePlayer = players[currentPlayerIdx];
    turnIndicatorColor.style.backgroundColor = activePlayer.color;
    turnIndicatorLabel.innerText = `${activePlayer.name}'s Turn`;

    if (gamePhase === "waiting_for_roll") {
      rollBadge.innerText = "Roll Required";
      diceDesc.innerText = activePlayer.type === "bot" ? "AI is preparing to roll..." : "Click dice or Roll button";
      rollActionBtn.disabled = activePlayer.type === "bot";
      rollActionBtn.style.opacity = activePlayer.type === "bot" ? "0.5" : "1";
    } else if (gamePhase === "rolling") {
      rollBadge.innerText = "Rolling...";
      diceDesc.innerText = "Simulating dice physics";
      rollActionBtn.disabled = true;
      rollActionBtn.style.opacity = "0.5";
    } else if (gamePhase === "waiting_for_move") {
      rollBadge.innerText = `Rolled a ${currentRoll}`;
      diceDesc.innerText = activePlayer.type === "bot" ? "AI selecting best path..." : "Select highlighted piece";
      rollActionBtn.disabled = true;
      rollActionBtn.style.opacity = "0.5";
    } else if (gamePhase === "animating") {
      rollBadge.innerText = "Moving...";
      diceDesc.innerText = "Animating token step-by-step";
      rollActionBtn.disabled = true;
      rollActionBtn.style.opacity = "0.5";
    } else if (gamePhase === "game_over") {
      rollBadge.innerText = "Game Over";
      diceDesc.innerText = "Press New Game to start fresh";
      rollActionBtn.disabled = true;
      rollActionBtn.style.opacity = "0.5";
    }

    if (botTimer) {
      clearTimeout(botTimer);
      botTimer = null;
    }

    if (activePlayer.type === "bot" && gamePhase === "waiting_for_roll") {
      botTimer = setTimeout(() => {
        executeRoll();
      }, 1000);
    } else if (activePlayer.type === "bot" && gamePhase === "waiting_for_move") {
      botTimer = setTimeout(() => {
        const movable = getMovablePieces(currentPlayerIdx, currentRoll);
        if (movable.length > 0) {
          const bestMove = selectBotMove(currentPlayerIdx, movable, currentRoll);
          movePiece(currentPlayerIdx, bestMove, currentRoll);
        }
      }, 1000);
    }

    renderSetupCards();
  }

  function selectBotMove(playerIdx, movableIndices, rollVal) {
    for (let i = 0; i < movableIndices.length; i++) {
      const pIdx = movableIndices[i];
      const step = players[playerIdx].pieces[pIdx];
      const nextStep = step === -1 ? 0 : step + rollVal;
      const targetCoords = getTrackCoordinates(playerIdx, nextStep);

      if (targetCoords && !isSafeCell(targetCoords.x / 40, targetCoords.y / 40)) {
        let captureFound = false;
        players.forEach(opp => {
          if (opp.id === playerIdx || !opp.active) return;
          opp.pieces.forEach(oppStep => {
            if (oppStep === -1 || oppStep >= 56) return;
            const oppCoords = getTrackCoordinates(opp.id, oppStep);
            if (oppCoords && Math.abs(oppCoords.x - targetCoords.x) < 2 && Math.abs(oppCoords.y - targetCoords.y) < 2) {
              captureFound = true;
            }
          });
        });
        if (captureFound) return pIdx;
      }
    }

    for (let i = 0; i < movableIndices.length; i++) {
      const pIdx = movableIndices[i];
      const step = players[playerIdx].pieces[pIdx];
      if (step + rollVal === 56) return pIdx;
    }

    for (let i = 0; i < movableIndices.length; i++) {
      const pIdx = movableIndices[i];
      const step = players[playerIdx].pieces[pIdx];
      if (step === -1 && rollVal === 6) return pIdx;
    }

    let bestIdx = movableIndices[0];
    let maxProgress = -1;
    movableIndices.forEach(pIdx => {
      const progress = players[playerIdx].pieces[pIdx];
      if (progress > maxProgress) {
        maxProgress = progress;
        bestIdx = pIdx;
      }
    });

    return bestIdx;
  }

  function renderSetupCards() {
    settingsContainer.innerHTML = "";

    players.forEach(player => {
      const card = document.createElement("div");
      card.style.cssText = "border:1px solid var(--color-border);border-radius:6px;padding:0.4rem 0.65rem;display:flex;align-items:center;justify-content:space-between;gap:0.5rem;background:var(--color-bg);";

      const leftG = document.createElement("div");
      leftG.style.cssText = "display:flex;align-items:center;gap:0.5rem;";

      const colorIndicator = document.createElement("span");
      colorIndicator.style.cssText = `display:inline-block;width:12px;height:12px;border-radius:50%;background:${player.color};`;
      leftG.appendChild(colorIndicator);

      const nameLabel = document.createElement("span");
      nameLabel.innerText = player.name;
      nameLabel.style.cssText = "font-size:0.82rem;font-weight:600;color:var(--color-text);";
      leftG.appendChild(nameLabel);

      const activeBadge = document.createElement("span");
      const finishedCount = player.pieces.filter(st => st === 56).length;
      activeBadge.innerText = `${finishedCount}/4 In Goal`;
      activeBadge.style.cssText = "font-size:0.68rem;color:var(--color-text-muted);margin-left:4px;";
      leftG.appendChild(activeBadge);

      card.appendChild(leftG);

      const rightG = document.createElement("div");
      rightG.style.cssText = "display:flex;align-items:center;gap:0.4rem;";

      const typeSelect = document.createElement("select");
      typeSelect.style.cssText = "padding:0.15rem 0.35rem;border:1px solid var(--color-border);border-radius:4px;background:var(--color-surface);color:var(--color-text);font-size:0.75rem;outline:none;";
      
      const optHuman = document.createElement("option");
      optHuman.value = "human";
      optHuman.innerText = "Human";
      const optBot = document.createElement("option");
      optBot.value = "bot";
      optBot.innerText = "AI Bot";
      const optNone = document.createElement("option");
      optNone.value = "inactive";
      optNone.innerText = "Inactive";

      typeSelect.appendChild(optHuman);
      typeSelect.appendChild(optBot);
      typeSelect.appendChild(optNone);

      if (!player.active) {
        typeSelect.value = "inactive";
      } else {
        typeSelect.value = player.type;
      }

      typeSelect.addEventListener("change", (e) => {
        const val = e.target.value;
        if (val === "inactive") {
          player.active = false;
        } else {
          player.active = true;
          player.type = val;
        }

        const activeCount = players.filter(p => p.active).length;
        if (activeCount < 2) {
          player.active = true;
          player.type = "human";
          typeSelect.value = "human";
          pushLog("Must have at least 2 active players!", "#EF4444");
        } else {
          pushLog(`${player.name} updated to ${val}`, player.color);
          if (currentPlayerIdx === player.id && !player.active) {
            nextTurn();
          }
          persistCurrentState();
          updateUI();
        }
      });

      rightG.appendChild(typeSelect);
      card.appendChild(rightG);
      settingsContainer.appendChild(card);
    });
  }

  function applyPreset(mode) {
    if (mode === "4") {
      players[0].active = true; players[0].type = "human";
      players[1].active = true; players[1].type = "bot";
      players[2].active = true; players[2].type = "bot";
      players[3].active = true; players[3].type = "bot";
    } else if (mode === "3") {
      players[0].active = true; players[0].type = "human";
      players[1].active = true; players[1].type = "bot";
      players[2].active = true; players[2].type = "bot";
      players[3].active = false;
    } else if (mode === "2-opp") {
      players[0].active = true; players[0].type = "human";
      players[1].active = false;
      players[2].active = true; players[2].type = "bot";
      players[3].active = false;
    } else if (mode === "2-adj") {
      players[0].active = true; players[0].type = "human";
      players[1].active = true; players[1].type = "bot";
      players[2].active = false;
      players[3].active = false;
    }
    pushLog(`Setup updated: Match configured for ${mode === "4" ? "4" : mode === "3" ? "3" : "2"} players.`, "var(--color-primary)");
    resetGame();
  }

  presetSelector.addEventListener("change", (e) => {
    applyPreset(e.target.value);
  });

  function resetGame() {
    if (botTimer) clearTimeout(botTimer);
    if (animTimer) clearTimeout(animTimer);
    botTimer = null;
    animTimer = null;

    players.forEach(p => {
      p.pieces = [-1, -1, -1, -1];
    });

    currentPlayerIdx = 0;
    while (!players[currentPlayerIdx].active) {
      currentPlayerIdx = (currentPlayerIdx + 1) % 4;
    }

    currentRoll = 0;
    gamePhase = "waiting_for_roll";
    consecutiveSixes = 0;

    logBox.innerHTML = "";
    pushLog("New Ludo Match Started!", "var(--color-primary)");
    
    persistCurrentState();
    updateUI();
  }

  diceWidget.addEventListener("click", () => {
    if (players[currentPlayerIdx].type === "human") {
      executeRoll();
    }
  });

  rollActionBtn.addEventListener("click", () => {
    if (players[currentPlayerIdx].type === "human") {
      executeRoll();
    }
  });

  resetBtn.addEventListener("click", () => {
    resetGame();
  });

  newGameBtn.addEventListener("click", () => {
    clearState();
    presetSelector.value = "4";
    players = [
      { id: 0, name: "Red", color: "#EF4444", lightColor: "#FEE2E2", active: true, type: "human", pieces: [-1, -1, -1, -1] },
      { id: 1, name: "Green", color: "#10B981", lightColor: "#D1FAE5", active: true, type: "bot", pieces: [-1, -1, -1, -1] },
      { id: 2, name: "Yellow", color: "#F59E0B", lightColor: "#FEF3C7", active: true, type: "bot", pieces: [-1, -1, -1, -1] },
      { id: 3, name: "Blue", color: "#3B82F6", lightColor: "#DBEAFE", active: true, type: "bot", pieces: [-1, -1, -1, -1] }
    ];
    resetGame();
  });

  const pulseStyle = document.createElement("style");
  pulseStyle.innerHTML = `
    @keyframes pulseGlow {
      0% { transform: scale(1); opacity: 0.8; }
      50% { transform: scale(1.15); opacity: 0.3; }
      100% { transform: scale(1); opacity: 0.8; }
    }
  `;
  document.head.appendChild(pulseStyle);

  drawBoardFrame();

  loadState().then((saved) => {
    if (saved) {
      players = saved.players;
      currentPlayerIdx = saved.currentPlayerIdx;
      currentRoll = saved.currentRoll;
      consecutiveSixes = saved.consecutiveSixes;
      
      let phase = saved.gamePhase;
      if (phase === "rolling") {
        phase = "waiting_for_roll";
      } else if (phase === "animating") {
        phase = "waiting_for_move";
      }
      gamePhase = phase;

      if (saved.presetValue) {
        presetSelector.value = saved.presetValue;
      }
      pushLog("Restored previous session successfully!", "var(--color-primary)");
      updateUI();
    } else {
      resetGame();
    }
  }).catch(() => {
    resetGame();
  });

  return () => {
    window.removeEventListener("resize", handleLayoutResize);
    if (botTimer) clearTimeout(botTimer);
    if (animTimer) clearTimeout(animTimer);
    pulseStyle.remove();
    wrapper.remove();
  };
}

export function destroy(container) {
  container.innerHTML = "";
}