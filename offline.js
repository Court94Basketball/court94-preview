// Offline use. Starts Court94's offline helper (sw.js), which keeps a complete
// copy of the app on this device so it opens without internet, and shows in
// Settings whether that copy is ready.
//
// Updates: a new version is downloaded in the background and only switched to
// when Court94 opens with no game in progress (including a game kept in the
// game recovery) and before anything is tapped. A game is never interrupted,
// and the app's files always come from one version.
//
// Nothing here reads or changes saved teams or games, except to check
// whether a game is in progress.

const OFFLINE_APP_CACHE_PREFIX = "court94-app-";
const OFFLINE_META_CACHE = "court94-meta";

let offlineRegistration = null;
let offlineSetupFailed = false;
let offlineSetupProblem = "";
let offlineUserActed = false;

function offlineUrl(path) {
    const base = offlineRegistration?.scope || new URL("./", location.href).href;

    return new URL(path, base).href;
}

function isOfflineSupported() {
    return (
        "serviceWorker" in navigator &&
        typeof caches !== "undefined" &&
        window.isSecureContext
    );
}

function isGameInProgress() {
    if (typeof liveGameState !== "undefined" && liveGameState) {
        return true;
    }

    try {
        return Boolean(localStorage.getItem(LIVE_GAME_STORAGE_KEY));
    } catch (error) {
        // Can't tell, so treat it as a game in progress.
        return true;
    }
}

// Reading never creates the cache (caches.open would), so a removed copy
// stays removed.
async function readOfflineMeta(path) {
    const response = await caches.match(offlineUrl(path), {
        cacheName: OFFLINE_META_CACHE
    });

    return response ? response.text() : null;
}

// The helper's registration, even before register() has answered (it can be
// slow, or fail, without internet).
async function findOfflineRegistration() {
    if (!offlineRegistration) {
        offlineRegistration =
            (await navigator.serviceWorker.getRegistration()) || null;
    }

    return offlineRegistration;
}

async function offlineSha256(buffer) {
    const digest = await crypto.subtle.digest("SHA-256", buffer);

    return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

// Checks that a saved copy has every file, each matching its fingerprint.
async function verifyOfflineCopy(cacheName) {
    if (!cacheName || !(await caches.has(cacheName))) {
        return { complete: false, version: null };
    }

    const cache = await caches.open(cacheName);
    const manifestResponse = await cache.match(
        offlineUrl("__court94/manifest")
    );

    if (!manifestResponse) {
        return { complete: false, version: null };
    }

    const manifest = await manifestResponse.json();
    const paths = Object.keys(manifest.files || {});

    if (paths.length === 0) {
        return { complete: false, version: manifest.version };
    }

    for (const path of paths) {
        const file = await cache.match(offlineUrl(path));

        if (
            !file ||
            (await offlineSha256(await file.arrayBuffer())) !==
                manifest.files[path]
        ) {
            return { complete: false, version: manifest.version };
        }
    }

    return { complete: true, version: manifest.version };
}

// Run once as Court94 opens: switches to a newer downloaded version only if
// no game is in progress and nothing has been tapped yet, then reopens.
async function useNewVersionIfSafe() {
    if (!navigator.serviceWorker.controller) {
        // Opened from the internet, not from the saved copy: nothing to switch.
        return;
    }

    const current = await readOfflineMeta("__court94/current");
    const latest = await readOfflineMeta("__court94/latest");

    if (!latest || latest === current || offlineUserActed || isGameInProgress()) {
        return;
    }

    const check = await verifyOfflineCopy(latest);

    if (!check.complete || offlineUserActed || isGameInProgress()) {
        return;
    }

    const meta = await caches.open(OFFLINE_META_CACHE);

    await meta.put(
        offlineUrl("__court94/current"),
        new Response(latest, { headers: { "Content-Type": "text/plain" } })
    );

    location.reload();
}

function noteOfflineUserAction() {
    offlineUserActed = true;
}

function startOfflineSupport() {
    if (!isOfflineSupported()) {
        return;
    }

    ["pointerdown", "touchstart", "mousedown", "keydown"].forEach((type) => {
        document.addEventListener(type, noteOfflineUserAction, {
            capture: true,
            once: true
        });
    });

    navigator.serviceWorker
        .register("sw.js", { updateViaCache: "none" })
        .then((registration) => {
            offlineRegistration = registration;

            registration.addEventListener("updatefound", () => {
                const worker = registration.installing;

                worker?.addEventListener("statechange", () => {
                    if (
                        worker.state === "activated" ||
                        worker.state === "redundant"
                    ) {
                        refreshOfflineSettings();
                    }
                });
            });

            refreshOfflineSettings();
            return useNewVersionIfSafe();
        })
        .catch(async (error) => {
            // Without internet, an existing helper keeps working.
            const existing = await findOfflineRegistration().catch(() => null);

            if (existing) {
                refreshOfflineSettings();
                return useNewVersionIfSafe();
            }

            offlineSetupFailed = true;
            offlineSetupProblem = error?.message || String(error);
            console.error("Court94 couldn't set up offline use:", error);
            refreshOfflineSettings();
        });
}

// ---------- Settings ----------

async function describeOfflineUse() {
    if (!isOfflineSupported()) {
        return {
            ready: "Not available here. Open Court94 at court94.com in Safari.",
            version: "",
            update: ""
        };
    }

    if (offlineSetupFailed) {
        return {
            ready: "Not ready. Court94 couldn't set up offline use on this device.",
            version: "",
            update: "",
            problem: offlineSetupProblem
        };
    }

    const registration = await findOfflineRegistration();
    const current = await readOfflineMeta("__court94/current");
    const latest = await readOfflineMeta("__court94/latest");
    const currentCheck = await verifyOfflineCopy(current);
    const helperActive = Boolean(registration?.active);
    let update = "";

    if (latest && latest !== current) {
        const latestCheck = await verifyOfflineCopy(latest);

        if (latestCheck.complete) {
            update =
                `Version ${latestCheck.version} is downloaded. It will be ` +
                "used the next time Court94 opens with no game in progress.";
        }
    }

    if (currentCheck.complete && helperActive) {
        return {
            ready: "Yes. A complete copy of Court94 is saved on this device.",
            version: currentCheck.version,
            update
        };
    }

    const saving = Boolean(registration?.installing);
    let problem = "";

    try {
        problem = JSON.parse(
            (await readOfflineMeta("__court94/last-attempt")) || "{}"
        ).problem || "";
    } catch (error) {
        problem = "";
    }

    return {
        ready: saving
            ? "Not yet. Saving a copy now; keep Court94 open with internet for a minute."
            : "Not yet. Open Court94 once with an internet connection.",
        version: currentCheck.version || "",
        update,
        problem: saving ? "" : problem
    };
}

let offlineSettingsCheck = 0;

function refreshOfflineSettings() {
    const list = document.getElementById("offlineInfo");

    if (!list) {
        return;
    }

    // Only the newest check fills in the list.
    const check = ++offlineSettingsCheck;

    list.replaceChildren();
    const ready = addStorageRow(list, "Opens without internet", "Checking…");

    describeOfflineUse()
        .then((info) => {
            if (check !== offlineSettingsCheck) {
                return;
            }

            ready.textContent = info.ready;

            if (info.version) {
                addStorageRow(list, "Saved version", info.version);
            }

            if (info.update) {
                addStorageRow(list, "Update", info.update);
            }

            if (info.problem) {
                addStorageRow(
                    list,
                    "Last attempt",
                    `The offline copy couldn't be saved: ${info.problem}`
                );
            }
        })
        .catch((error) => {
            console.error("Court94 couldn't check offline use:", error);

            if (check === offlineSettingsCheck) {
                ready.textContent = "Couldn't be checked";
            }
        });
}

document
    .getElementById("settingsBtn")
    ?.addEventListener("click", refreshOfflineSettings);

document
    .getElementById("checkStorageButton")
    ?.addEventListener("click", refreshOfflineSettings);

startOfflineSupport();

// Reopened on Settings: fill it in.
if (document.getElementById("settingsScreen")?.classList.contains("activeScreen")) {
    refreshOfflineSettings();
}
