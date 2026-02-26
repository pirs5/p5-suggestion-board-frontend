const API_BASE_URL = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) || "";
const STORAGE_KEY = "suggestion_board_manifesto_ack";
const CLIENT_TOKEN_KEY = "suggestion_board_client_token";

const form = document.getElementById("card-form");
const messageInput = document.getElementById("message");
const charCount = document.getElementById("char-count");
const formError = document.getElementById("form-error");
const formSuccess = document.getElementById("form-success");
const toReviewList = document.getElementById("to-review-list");
const doneList = document.getElementById("done-list");
const toReviewTemplate = document.getElementById("to-review-card-template");
const doneTemplate = document.getElementById("done-card-template");

const modalOverlay = document.getElementById("modal-overlay");
const manifestoPanel = document.getElementById("manifesto-panel");
const closePanel = document.getElementById("close-panel");
const manifestoOpen = document.getElementById("manifesto-open");
const manifestoUnderstood = document.getElementById("manifesto-understood");
const closedByInput = document.getElementById("closed-by");
const confirmDone = document.getElementById("confirm-done");
const closeError = document.getElementById("close-error");

let cards = [];
let memoryClientToken = null;
let activeCloseCardId = null;

function safeGetItem(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore blocked storage errors.
  }
}

function getClientToken() {
  const existing = safeGetItem(CLIENT_TOKEN_KEY);
  if (existing) return existing;
  if (memoryClientToken) return memoryClientToken;

  memoryClientToken = crypto.randomUUID();
  safeSetItem(CLIENT_TOKEN_KEY, memoryClientToken);
  return memoryClientToken;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "2-digit"
  });
}

function setStatusMessage({ error = "", success = "" }) {
  formError.textContent = error;
  formSuccess.textContent = success;
}

function openOverlay(panel) {
  modalOverlay.hidden = false;
  document.body.classList.add("modal-open");
  modalOverlay.classList.toggle("overlay-manifesto", panel === "manifesto");
  modalOverlay.classList.toggle("overlay-close", panel === "close");
  manifestoPanel.hidden = panel !== "manifesto";
  closePanel.hidden = panel !== "close";
}

function closeOverlay() {
  modalOverlay.hidden = true;
  manifestoPanel.hidden = true;
  closePanel.hidden = true;
  document.body.classList.remove("modal-open");
  modalOverlay.classList.remove("overlay-manifesto", "overlay-close");
  activeCloseCardId = null;
  closedByInput.value = "";
  closeError.textContent = "";
}

function openManifesto() {
  openOverlay("manifesto");
}

function openDoneModal(cardId) {
  activeCloseCardId = cardId;
  openOverlay("close");
  closeError.textContent = "";
  closedByInput.focus();
}

function setCloseError(message) {
  closeError.textContent = message;
}

function renderToReview(list) {
  toReviewList.innerHTML = "";

  if (!list.length) {
    toReviewList.innerHTML = '<p class="empty-note">No cards in to review.</p>';
    return;
  }

  list.forEach((card, index) => {
    const node = toReviewTemplate.content.cloneNode(true);
    const cardEl = node.querySelector(".to-review-card");
    cardEl.style.animationDelay = `${index * 50}ms`;

    node.querySelector(".card-message").textContent = card.message;
    node.querySelector(".card-date").textContent = formatDate(card.createdAt);

    const doneBtn = node.querySelector(".done-action");
    doneBtn.addEventListener("click", () => {
      openDoneModal(card.id);
    });

    toReviewList.appendChild(node);
  });
}

function renderDone(list) {
  doneList.innerHTML = "";

  if (!list.length) {
    doneList.innerHTML = '<p class="empty-note">No cards in done yet.</p>';
    return;
  }

  list.forEach((card, index) => {
    const node = doneTemplate.content.cloneNode(true);
    const cardEl = node.querySelector(".done-card");
    cardEl.style.animationDelay = `${index * 50}ms`;

    node.querySelector(".card-message").textContent = card.message;
    node.querySelector(".done-meta").textContent = `done by ${card.closedBy || "team"}`;

    doneList.appendChild(node);
  });
}

function renderBoard() {
  const toReview = cards.filter(card => card.status === "to_review");
  const done = cards
    .filter(card => card.status === "done" && card.closedAt)
    .sort((a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime());

  renderToReview(toReview);
  renderDone(done);
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Client-Token": getClientToken(),
      ...(options.headers || {})
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }
  return payload;
}

async function loadCards() {
  const result = await apiFetch("/api/cards");
  cards = Array.isArray(result.cards) ? result.cards : [];
  renderBoard();
}

messageInput.addEventListener("input", () => {
  charCount.textContent = `${messageInput.value.length} / 800`;
  if (messageInput.value.length <= 800) {
    setStatusMessage({ error: "" });
  }
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  setStatusMessage({});

  const message = messageInput.value.trim();
  if (!message) {
    setStatusMessage({ error: "Message cannot be empty." });
    return;
  }

  if (message.length > 800) {
    setStatusMessage({ error: "Message exceeds 800 character limit." });
    return;
  }

  try {
    await apiFetch("/api/cards", {
      method: "POST",
      body: JSON.stringify({ message })
    });

    setStatusMessage({ success: "Card added to review." });
    messageInput.value = "";
    charCount.textContent = "0 / 800";
    await loadCards();
  } catch (error) {
    setStatusMessage({ error: error.message });
  }
});

async function handleConfirmDone() {
  if (!activeCloseCardId) return;

  const closedBy = closedByInput.value.trim();
  if (!closedBy) {
    setCloseError("Your name is required.");
    closedByInput.focus();
    return;
  }

  setCloseError("");
  confirmDone.disabled = true;
  try {
    await apiFetch(`/api/cards/${activeCloseCardId}/close`, {
      method: "POST",
      body: JSON.stringify({ closedBy })
    });
    closeOverlay();
    setStatusMessage({ success: "Card moved to done." });
    await loadCards();
  } catch (error) {
    setCloseError(error.message);
  } finally {
    confirmDone.disabled = false;
  }
}

confirmDone.addEventListener("click", handleConfirmDone);
closedByInput.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    handleConfirmDone();
  }
});

manifestoOpen.addEventListener("click", openManifesto);
manifestoUnderstood.addEventListener("click", () => {
  safeSetItem(STORAGE_KEY, "true");
  closeOverlay();
});

modalOverlay.addEventListener("click", event => {
  if (event.target === modalOverlay) {
    closeOverlay();
  }
});

window.addEventListener("keydown", event => {
  if (event.key === "Escape" && !modalOverlay.hidden) {
    closeOverlay();
  }
});

(async function init() {
  try {
    if (safeGetItem(STORAGE_KEY) !== "true") {
      openManifesto();
    }
    await loadCards();
  } catch (error) {
    setStatusMessage({ error: "Unable to load board. Check API configuration." });
  }
})();
