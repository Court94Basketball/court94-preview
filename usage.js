// Court94 Anonymous Usage Counts
//
// Off unless the coach turns it on (Settings → Anonymous Usage Counts).
// When on, and only on court94.com, Court94 counts three things by name:
//     app-opened, game-started, game-saved
// and sends just that name to GoatCounter (court94.goatcounter.com/count,
// its documented browser endpoint). Nothing else is sent: no teams, players,
// opponents, scores, statistics, game IDs or anything that identifies the
// coach or the device.
//
// Counting can never get in the way of Court94:
// - It runs after tracking or saving has finished and never waits for it.
// - Every step is wrapped, so a failure here only means a missed count.
// - It keeps its own storage key (USAGE_KEY), and never reads or changes
//   teams, games, the game in progress, backups or the safety copy.
//   Backups don't include it.
// - Counts made without internet wait in a short list (at most
//   USAGE_QUEUE_LIMIT) and are sent the next time Court94 is online.
// - A count is taken off the list before it is sent and put back only when
//   the send clearly failed, so a count is never sent twice. A saved game is
//   counted once: the device remembers the last USAGE_SAVED_LIMIT games it
//   counted (only on this device; never sent).
// - Turning it off removes everything it kept, including counts not yet sent.

const USAGE_KEY = "court94UsageCounts";
const USAGE_ENDPOINT = "https://court94.goatcounter.com/count";
const USAGE_EVENTS = ["app-opened", "game-started", "game-saved"];
const USAGE_QUEUE_LIMIT = 30;
const USAGE_SAVED_LIMIT = 50;

// GoatCounter accepts 4 counts a second from one device; stay well under it.
const USAGE_SEND_GAP_MS = 400;
const USAGE_SEND_DELAY_MS = 2000;
const USAGE_BUSY_RETRY_MS = 4000;
const USAGE_BUSY_RETRY_LIMIT = 3;

let usageSending = false;
let usageSendTimer = null;
let usageBusyRetries = 0;

// Only the real site counts: never previews, local copies or tests.
function isUsageCountingSite() {
    return (
        location.protocol === "https:" &&
        (location.hostname === "court94.com" ||
            location.hostname === "www.court94.com")
    );
}

// The stored state when counting is on, otherwise null.
function readUsageState() {
    try {
        const stored = JSON.parse(localStorage.getItem(USAGE_KEY) || "null");

        if (!stored || stored.on !== true) {
            return null;
        }

        return {
            on: true,
            queue: (Array.isArray(stored.queue) ? stored.queue : [])
                .filter((name) => USAGE_EVENTS.includes(name))
                .slice(-USAGE_QUEUE_LIMIT),
            saved: (Array.isArray(stored.saved) ? stored.saved : [])
                .filter((id) => typeof id === "string")
                .slice(-USAGE_SAVED_LIMIT)
        };
    } catch (error) {
        return null;
    }
}

function writeUsageState(state) {
    try {
        if (state) {
            localStorage.setItem(USAGE_KEY, JSON.stringify(state));
        } else {
            localStorage.removeItem(USAGE_KEY);
        }

        return true;
    } catch (error) {
        return false;
    }
}

// Runs work() with the stored counts to itself: one Court94 tab or window
// at a time, so two tabs can't overwrite each other's counts. Where the
// browser can't arrange that, it simply runs. Never rejects.
function withUsageLock(work) {
    const run = () => {
        try {
            return work();
        } catch (error) {
            return false;
        }
    };

    try {
        if (navigator.locks && typeof navigator.locks.request === "function") {
            return navigator.locks
                .request("court94-usage-state", run)
                .catch(() => false);
        }
    } catch (error) {
        // Run it directly below.
    }

    return Promise.resolve(run());
}

// Changes the stored counts while counting is on. change(state) edits the
// state and returns true to keep the change. Resolves to whether it was kept.
function updateUsageState(change) {
    return withUsageLock(() => {
        const state = readUsageState();

        return Boolean(state && change(state) && writeUsageState(state));
    });
}

// Adds one count by name. For game-saved, savedGameId stops the same game
// being counted twice (it stays on this device and is never sent).
function recordUsage(name, savedGameId) {
    try {
        if (!USAGE_EVENTS.includes(name) || !isUsageCountingSite()) {
            return;
        }

        if (
            name === "game-saved" &&
            (typeof savedGameId !== "string" || !savedGameId)
        ) {
            return;
        }

        updateUsageState((state) => {
            if (name === "game-saved") {
                if (state.saved.includes(savedGameId)) {
                    return false;
                }

                state.saved = [...state.saved, savedGameId].slice(-USAGE_SAVED_LIMIT);
            }

            state.queue = [...state.queue, name].slice(-USAGE_QUEUE_LIMIT);
            return true;
        })
            .then((kept) => {
                if (kept) {
                    scheduleUsageSend(USAGE_SEND_DELAY_MS);
                }
            })
            .catch(() => {});
    } catch (error) {
        // A missed count; nothing else is affected.
    }
}

function scheduleUsageSend(delay) {
    try {
        clearTimeout(usageSendTimer);
        usageSendTimer = setTimeout(sendUsageCounts, delay);
    } catch (error) {
        // Nothing to do.
    }
}

function usageCountUrl(name) {
    return (
        `${USAGE_ENDPOINT}?p=${encodeURIComponent(name)}&e=true` +
        `&rnd=${Math.random().toString(36).slice(2, 10)}`
    );
}

// "sent", "retry" (no internet or the service is busy) or "drop" (refused;
// trying again wouldn't help).
async function sendOneUsageCount(name) {
    try {
        const response = await fetch(usageCountUrl(name), {
            method: "GET",
            mode: "cors",
            credentials: "omit",
            cache: "no-store",
            referrerPolicy: "no-referrer",
            keepalive: true
        });

        if (response.ok) {
            return "sent";
        }

        return response.status === 429 || response.status >= 500
            ? "retry"
            : "drop";
    } catch (error) {
        return "retry";
    }
}

function waitBetweenUsageCounts(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendUsageQueue() {
    for (let sent = 0; sent < USAGE_QUEUE_LIMIT; sent += 1) {
        if (navigator.onLine === false) {
            return;
        }

        // Take it off the list first: if Court94 closes mid-send, the count
        // may be lost but is never sent twice.
        let name = null;

        const taken = await updateUsageState((state) => {
            if (state.queue.length === 0) {
                return false;
            }

            name = state.queue[0];
            state.queue = state.queue.slice(1);
            return true;
        });

        if (!taken) {
            return;
        }

        const result = await sendOneUsageCount(name);

        if (result === "retry") {
            // Put it back (only while counting is still on).
            await updateUsageState((state) => {
                state.queue = [name, ...state.queue].slice(0, USAGE_QUEUE_LIMIT);
                return true;
            });

            return;
        }

        await waitBetweenUsageCounts(USAGE_SEND_GAP_MS);
    }
}

async function sendUsageCounts() {
    if (usageSending || !isUsageCountingSite() || navigator.onLine === false) {
        return;
    }

    usageSending = true;

    try {
        // One Court94 tab or window sends at a time. If another one is
        // sending, try again shortly for anything it didn't pick up.
        if (navigator.locks && typeof navigator.locks.request === "function") {
            let busy = false;

            await navigator.locks.request(
                "court94-usage-send",
                { ifAvailable: true },
                (lock) => {
                    busy = !lock;
                    return lock ? sendUsageQueue() : null;
                }
            );

            if (busy && usageBusyRetries < USAGE_BUSY_RETRY_LIMIT) {
                usageBusyRetries += 1;
                scheduleUsageSend(USAGE_BUSY_RETRY_MS);
            } else if (!busy) {
                usageBusyRetries = 0;
            }
        } else {
            await sendUsageQueue();
        }
    } catch (error) {
        // Counts stay on the list for next time.
    } finally {
        usageSending = false;
    }
}

// ---------- Settings ----------

function renderUsageSettings(message = "") {
    try {
        const toggle = document.getElementById("usageCountsToggle");
        const status = document.getElementById("usageCountsStatus");

        if (!toggle || !status) {
            return;
        }

        const state = readUsageState();

        toggle.checked = Boolean(state);

        let text;

        if (!state) {
            text = "Off. Nothing is counted.";
        } else if (!isUsageCountingSite()) {
            text = "On. This copy of Court94 isn't court94.com, so nothing is counted here.";
        } else if (state.queue.length > 0) {
            text =
                `On. ${state.queue.length} ${state.queue.length === 1 ? "count is" : "counts are"} ` +
                "waiting and will be sent the next time Court94 is online.";
        } else {
            text = "On. Thank you!";
        }

        status.textContent = message ? `${message} ${text}` : text;
    } catch (error) {
        // Settings still work without this line.
    }
}

function changeUsageSetting(event) {
    try {
        const turnOn = event.target.checked;

        withUsageLock(() =>
            turnOn
                ? writeUsageState({ on: true, queue: [], saved: [] })
                : // Off: remove everything counting kept, including unsent counts.
                  writeUsageState(null)
        ).then(() =>
            renderUsageSettings(
                turnOn ? "" : "Anything waiting to be sent was removed."
            )
        );
    } catch (error) {
        renderUsageSettings();
    }
}

function connectUsageControls() {
    try {
        document
            .getElementById("usageCountsToggle")
            ?.addEventListener("change", changeUsageSetting);

        document
            .getElementById("settingsBtn")
            ?.addEventListener("click", () => renderUsageSettings());

        window.addEventListener("online", () => scheduleUsageSend(USAGE_SEND_DELAY_MS));

        renderUsageSettings();
    } catch (error) {
        // Counting stays off for this page; Court94 is unaffected.
    }
}

connectUsageControls();

// This page load counts as one app open (only when on, on court94.com).
recordUsage("app-opened");

// Anything left from earlier (for example, counted without internet).
scheduleUsageSend(USAGE_SEND_DELAY_MS);
