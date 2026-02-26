const API_BASE_URL = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) || "";
const STORAGE_KEY = "anonymous_initiative_manifesto_ack";
const CLIENT_TOKEN_KEY = "anonymous_initiative_client_token";

const form = document.getElementById("card-form");
const messageInput = document.getElementById("message");
const charCount = document.getElementById("char-count");
const formError = document.getElementById("form-error");
const formSuccess = document.getElementById("form-success");
const toReviewList = document.getElementById("to-review-list");
const doneGroups = document.getElementById("done-groups");
const toReviewCount = document.getElementById("to-review-count");
const doneCount = document.getElementById("done-count");
const toReviewTemplate = document.getElementById("to-review-card-template");
const doneTemplate = document.getElementById("done-card-template");

const manifestoModal = document.getElementById("manifesto-modal");
const manifestoOpen = document.getElementById("manifesto-open");
const manifestoClose = document.getElementById("manifesto-close");
const manifestoUnderstood = document.getElementById("manifesto-understood");

let cards = [];

function getClientToken() {
  const existing = localStorage.getItem(CLIENT_TOKEN_KEY);
  if (existing) return existing;
  const token = crypto.randomUUID();
  localStorage.setItem(CLIENT_TOKEN_KEY, token);
  return token;
}

function formatDate(iso) {
  return new Date(iso).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function startOfWeek(iso) {
  const date = new Date(iso);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function weekLabel(startDate) {
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6);
  const fmt = new Intl.DateTimeFormat([], {
    month: "short",
    day: "2-digit",
    year: "numeric"
  });
  return `${fmt.format(startDate)} - ${fmt.format(endDate)}`;
}

function clearFormState() {
  formError.textContent = "";
  formSuccess.textContent = "";
}

function renderToReview(list) {
  toReviewList.innerHTML = "";
  toReviewCount.textContent = String(list.length);

  if (!list.length) {
    toReviewList.innerHTML = '<p class="hint">No cards in To Review.</p>';
    return;
  }

  list.forEach((card, index) => {
    const node = toReviewTemplate.content.cloneNode(true);
    const article = node.querySelector(".to-review-card");
    article.style.animationDelay = `${index * 45}ms`;
    node.querySelector(".card-id").textContent = `ID: ${card.id}`;
    node.querySelector(".card-date").textContent = `Created: ${formatDate(card.createdAt)}`;
    node.querySelector(".card-message").textContent = card.message;

    const closerInput = node.querySelector(".closer-input");
    const closeError = node.querySelector(".error");
    const closeAction = node.querySelector(".close-action");

    closeAction.addEventListener("click", async () => {
      closeError.textContent = "";
      const closedBy = closerInput.value.trim();
      if (!closedBy) {
        closeError.textContent = "Who moved this card is required.";
        return;
      }

      closeAction.disabled = true;
      try {
        await apiFetch(`/api/cards/${card.id}/close`, {
          method: "POST",
          body: JSON.stringify({ closedBy })
        });
        await loadCards();
      } catch (error) {
        closeError.textContent = error.message;
      } finally {
        closeAction.disabled = false;
      }
    });

    toReviewList.appendChild(node);
  });
}

function renderDone(list) {
  doneGroups.innerHTML = "";
  doneCount.textContent = String(list.length);

  if (!list.length) {
    doneGroups.innerHTML = '<p class="hint">No cards in Done yet.</p>';
    return;
  }

  const grouped = new Map();

  list.forEach(card => {
    const weekStart = startOfWeek(card.closedAt);
    const key = weekStart.toISOString();
    if (!grouped.has(key)) {
      grouped.set(key, { weekStart, cards: [] });
    }
    grouped.get(key).cards.push(card);
  });

  const ordered = Array.from(grouped.values()).sort((a, b) => b.weekStart - a.weekStart);

  ordered.forEach((group, index) => {
    const details = document.createElement("details");
    details.className = "done-group";
    details.open = index === 0;

    const summary = document.createElement("summary");
    summary.textContent = `${weekLabel(group.weekStart)} · ${group.cards.length} card${group.cards.length === 1 ? "" : "s"}`;

    const cardsWrap = document.createElement("div");
    cardsWrap.className = "group-cards";

    group.cards
      .sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt))
      .forEach((card, cardIndex) => {
        const node = doneTemplate.content.cloneNode(true);
        const article = node.querySelector(".done-card");
        article.style.animationDelay = `${cardIndex * 35}ms`;

        node.querySelector(".card-id").textContent = `ID: ${card.id}`;
        node.querySelector(".card-date").textContent = `Created: ${formatDate(card.createdAt)}`;
        node.querySelector(".card-message").textContent = card.message;
        node.querySelector(".done-meta").textContent = `Done by ${card.closedBy} on ${formatDate(card.closedAt)}`;
        cardsWrap.appendChild(node);
      });

    details.appendChild(summary);
    details.appendChild(cardsWrap);
    doneGroups.appendChild(details);
  });
}

function renderBoard() {
  const toReview = cards.filter(card => card.status === "to_review");
  const done = cards.filter(card => card.status === "done" && card.closedAt);
  renderToReview(toReview);
  renderDone(done);
}

async function apiFetch(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  const response = await fetch(url, {
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
  cards = result.cards || [];
  renderBoard();
}

messageInput.addEventListener("input", () => {
  charCount.textContent = `${messageInput.value.length} / 800`;
  if (messageInput.value.length <= 800) formError.textContent = "";
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  clearFormState();
  const message = messageInput.value.trim();

  if (!message) {
    formError.textContent = "Message cannot be empty.";
    return;
  }

  if (message.length > 800) {
    formError.textContent = "Message exceeds 800 character limit.";
    return;
  }

  try {
    await apiFetch("/api/cards", {
      method: "POST",
      body: JSON.stringify({ message })
    });
    formSuccess.textContent = "Card added to To Review.";
    messageInput.value = "";
    charCount.textContent = "0 / 800";
    await loadCards();
  } catch (error) {
    formError.textContent = error.message;
  }
});

function openManifesto() {
  if (!manifestoModal.open) {
    manifestoModal.showModal();
  }
}

function closeManifesto() {
  if (manifestoModal.open) manifestoModal.close();
}

manifestoOpen.addEventListener("click", openManifesto);
manifestoClose.addEventListener("click", closeManifesto);
manifestoUnderstood.addEventListener("click", () => {
  localStorage.setItem(STORAGE_KEY, "true");
  closeManifesto();
});

(async function init() {
  try {
    if (localStorage.getItem(STORAGE_KEY) !== "true") {
      openManifesto();
    }
    await loadCards();
  } catch (error) {
    formError.textContent = "Unable to load board. Check API configuration.";
  }
})();
